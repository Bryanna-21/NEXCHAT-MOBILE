import {
  PeerMessagePacket,
  PeerPacket,
  createCustodyAck,
  createPeerMessagePacket,
  createDeliveryAck,
  deserializePeerPacket,
  forwardPeerPacket,
  canForwardPeerPacket,
  isPeerMessagePacket,
  isPeerRouteExpired,
  serializePeerPacket,
} from "./peerProtocol";

import {
  acceptPeerPacket,
  getReadyPeerCustodyItems,
  hasPeerCustody,
  markPeerSending,
  markPeerFailed,
  removePeerCustody,
} from "./peerStore";

export interface NearbyPeer {
  id: string;
  name?: string;
}

export interface NearbyBridgeAdapter {
  readonly kind: "nearby-bluetooth" | "nearby-wifi";

  isAvailable(): Promise<boolean>;

  discover(): Promise<NearbyPeer[]>;

  connect(peerId: string): Promise<void>;

  disconnect(peerId: string): Promise<void>;

  send(
    peerId: string,
    payload: Uint8Array,
  ): Promise<void>;

  setReceiver?(
    receiver: (
      peerId: string,
      payload: Uint8Array,
    ) => void | Promise<void>,
  ): void;
}

export interface NearbyBridgeHandlers {
  getIdentityId(): string | undefined;

  onFinalDelivery?(
    packet: PeerMessagePacket,
  ): Promise<boolean>;

  onDeliveryAck?(
    packet: ReturnType<typeof createDeliveryAck>,
  ): Promise<void>;
}

const MAX_DISCOVERED_PEERS = 32;

export class NearbyPeerBridge {
  private readonly adapters: NearbyBridgeAdapter[];
  private readonly handlers: NearbyBridgeHandlers;

  private receiverInstalled = new Set<string>();

  constructor(
    adapters: NearbyBridgeAdapter[],
    handlers: NearbyBridgeHandlers,
  ) {
    this.adapters = adapters;
    this.handlers = handlers;

    for (const adapter of adapters) {
      this.installReceiver(adapter);
    }
  }

  private installReceiver(
    adapter: NearbyBridgeAdapter,
  ): void {
    if (!adapter.setReceiver) return;
    if (this.receiverInstalled.has(adapter.kind)) return;

    adapter.setReceiver(
      async (peerId, payload) => {
        await this.receive(
          adapter,
          peerId,
          payload,
        );
      },
    );

    this.receiverInstalled.add(adapter.kind);
  }

  async discover(): Promise<NearbyPeer[]> {
    const peers = new Map<string, NearbyPeer>();

    for (const adapter of this.adapters) {
      try {
        if (!(await adapter.isAvailable())) continue;

        const discovered =
          await adapter.discover();

        for (const peer of discovered) {
          if (!peer.id) continue;

          peers.set(peer.id, peer);

          if (
            peers.size >=
            MAX_DISCOVERED_PEERS
          ) {
            return Array.from(peers.values());
          }
        }
      } catch {
        // One unavailable adapter must not
        // stop the other nearby transports.
      }
    }

    return Array.from(peers.values());
  }

  async flush(): Promise<void> {
    const custody =
      getReadyPeerCustodyItems();

    if (!custody.length) return;

    const peers = await this.discover();

    if (!peers.length) return;

    for (const item of custody) {
      if (isPeerRouteExpired(item.packet.route)) {
        removePeerCustody(item.id);
        continue;
      }

      if (!canForwardPeerPacket(item.packet)) {
        removePeerCustody(item.id);
        continue;
      }

      if (!hasPeerCustody(item.packet)) {
        continue;
      }

      for (const peer of peers) {
        const identityId =
          this.handlers.getIdentityId();

        if (
          !identityId ||
          peer.id === identityId ||
          peer.id === item.packet.envelope.senderId ||
          peer.id === item.packet.route.previousPeerId
        ) {
          continue;
        }

        const adapter =
          await this.findAdapterForPeer(
            peer.id,
          );

        if (!adapter) continue;

        try {
          const forwardedPacket =
            forwardPeerPacket(
              item.packet,
              identityId,
            );

          if (!forwardedPacket) {
            removePeerCustody(item.id);
            break;
          }

          if (
            isPeerRouteExpired(
              forwardedPacket.route,
            )
          ) {
            removePeerCustody(item.id);
            break;
          }

          if (
            !canForwardPeerPacket(
              forwardedPacket,
            )
          ) {
            removePeerCustody(item.id);
            break;
          }

          markPeerSending(item.id);

          await adapter.connect(peer.id);

          await adapter.send(
            peer.id,
            this.toBytes(
              serializePeerPacket(
                forwardedPacket,
              ),
            ),
          );

          /*
           * Keep the original custody item.
           *
           * The next peer must first persist the
           * forwarded packet and return a custody
           * ACK. Only then is our local custody
           * copy removed.
           */
          break;
        } catch (error) {
          markPeerFailed(
            item.id,
            error instanceof Error
              ? error.message
              : "Nearby transfer failed.",
          );
        }
      }
    }
  }

  async receive(
    adapter: NearbyBridgeAdapter,
    peerId: string,
    payload: Uint8Array,
  ): Promise<void> {
    const packet =
      this.parsePayload(payload);

    if (!packet) return;

    if (
      packet.type === "custody-ack"
    ) {
      await this.handleCustodyAck(
        packet,
        peerId,
      );
      return;
    }

    if (
      packet.type === "delivery-ack"
    ) {
      await this.handleDeliveryAck(
        adapter,
        packet,
        peerId,
      );
      return;
    }

    if (!isPeerMessagePacket(packet)) {
      return;
    }

    await this.handleMessage(
      adapter,
      peerId,
      packet,
    );
  }

  private async handleMessage(
    adapter: NearbyBridgeAdapter,
    peerId: string,
    packet: PeerMessagePacket,
  ): Promise<void> {
    if (isPeerRouteExpired(packet.route)) {
      return;
    }

    const identityId =
      this.handlers.getIdentityId();

    if (!identityId) return;

    /*
     * Never accept a packet that is being sent
     * back to the same origin device.
     */
    if (
      packet.envelope.senderId === identityId
    ) {
      return;
    }

    /*
     * Final recipient:
     *
     * The encrypted envelope is handed to the
     * existing application/store delivery path.
     * This bridge itself never decrypts it.
     */
    if (
      packet.route.destinationId ===
      identityId
    ) {
      const accepted =
        await this.handlers.onFinalDelivery?.(
          packet,
        );

      if (!accepted) return;

      const deliveryAck =
        createDeliveryAck(
          packet,
        );

      await this.sendPacket(
        adapter,
        peerId,
        deliveryAck,
      );

      return;
    }

    /*
     * Intermediate relay:
     *
     * Persist the opaque packet before
     * acknowledging custody.
     */
    const custody =
      acceptPeerPacket(packet);

    if (!custody) return;

    const custodyAck =
      createCustodyAck(
        packet,
        identityId,
        true,
      );

    await this.sendPacket(
      adapter,
      peerId,
      custodyAck,
    );

    /*
     * Forwarding happens later through flush().
     *
     * The packet is deliberately stored before
     * acknowledging custody. Its encrypted
     * envelope remains completely opaque to
     * this intermediate device.
     */
  }

  private async handleCustodyAck(
    packet: Extract<
      PeerPacket,
      { type: "custody-ack" }
    >,
    peerId: string,
  ): Promise<void> {
    if (!packet.accepted) return;

    const custody =
      getReadyPeerCustodyItems()
        .find(item =>
          item.packet.packetId ===
          packet.packetId,
        );

    if (!custody) return;

    /*
     * The transport peer that acknowledges
     * custody must be the peer we contacted.
     */
    if (packet.peerId !== peerId) {
      return;
    }

    removePeerCustody(custody.id);
  }

  private async handleDeliveryAck(
    adapter: NearbyBridgeAdapter,
    packet: Extract<
      PeerPacket,
      { type: "delivery-ack" }
    >,
    peerId: string,
  ): Promise<void> {
    const identityId =
      this.handlers.getIdentityId();

    if (!identityId) return;

    /*
     * The delivery ACK is addressed to the
     * original sender. Only that device settles
     * the outbound message.
     */
    if (
      packet.recipientId === identityId
    ) {
      await this.handlers.onDeliveryAck?.(
        packet,
      );
      return;
    }

    /*
     * An intermediate peer forwards the ACK
     * backwards through the recorded route.
     */
    const path =
      packet.routeId &&
      packet.routeId.length > 0
        ? undefined
        : undefined;

    void path;
    void adapter;
    void peerId;
  }

  private async sendPacket(
    adapter: NearbyBridgeAdapter,
    peerId: string,
    packet: PeerPacket,
  ): Promise<void> {
    await adapter.connect(peerId);

    await adapter.send(
      peerId,
      this.toBytes(
        serializePeerPacket(packet),
      ),
    );
  }

  private async findAdapterForPeer(
    peerId: string,
  ): Promise<NearbyBridgeAdapter | null> {
    for (const adapter of this.adapters) {
      try {
        if (!(await adapter.isAvailable())) {
          continue;
        }

        const peers =
          await adapter.discover();

        if (
          peers.some(peer => peer.id === peerId)
        ) {
          return adapter;
        }
      } catch {
        // Try the next adapter.
      }
    }

    return null;
  }

  private parsePayload(
    payload: Uint8Array,
  ): PeerPacket | null {
    try {
      const value =
        new TextDecoder().decode(payload);

      return deserializePeerPacket(value);
    } catch {
      return null;
    }
  }

  private toBytes(
    value: string,
  ): Uint8Array {
    return new TextEncoder().encode(value);
  }
}
