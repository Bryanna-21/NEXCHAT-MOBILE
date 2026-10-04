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
  getPeerCustodyItems,
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

  private flushTimer:
    ReturnType<typeof setInterval> | null = null;

  private flushRunning = false;

  private readonly flushIntervalMs =
    10_000;

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

  /**
   * Seed the nearby custody store with an outbound envelope.
   *
   * The encrypted TransportEnvelope remains unchanged. The bridge
   * only wraps it in the application-layer peer packet; it never
   * decrypts or alters the payload.
   */
  enqueueEnvelope(
    envelope: import("./protocol").TransportEnvelope,
  ): void {
    const packet =
      createPeerMessagePacket(envelope);

    if (!canForwardPeerPacket(packet)) {
      return;
    }

    acceptPeerPacket(packet);
  }

  /**
   * Attempt nearby forwarding immediately.
   *
   * The peer custody store remains durable if no adapter is
   * currently available, so a later flush can retry it.
   */
  async flushOutbound(): Promise<void> {
    if (this.flushRunning) {
      return;
    }

    this.flushRunning = true;

    try {
      await this.flush();
    } finally {
      this.flushRunning = false;
    }
  }

  /**
   * Start periodic nearby custody delivery.
   *
   * This is intentionally lightweight. When the native adapters
   * report unavailable, discovery returns immediately and the
   * durable custody item remains stored for the next attempt.
   */
  start(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer =
      setInterval(() => {
        void this.flushOutbound();
      }, this.flushIntervalMs);

    void this.flushOutbound();
  }

  /**
   * Stop periodic nearby delivery.
   *
   * The durable peer custody store is deliberately not cleared.
   */
  stop(): void {
    if (!this.flushTimer) {
      return;
    }

    clearInterval(this.flushTimer);
    this.flushTimer = null;
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

    /*
     * Custody ACKs settle the packet that we may
     * currently have marked as "sending". Do not
     * search only ready/queued custody items here.
     */
    const custodyItems =
      getPeerCustodyItems();

    const custody =
      custodyItems.find(item =>
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

    const returnPath =
      Array.isArray(packet.returnPath)
        ? packet.returnPath
        : [];

    if (returnPath.length === 0) {
      return;
    }

    const currentIndex =
      returnPath.indexOf(identityId);

    /*
     * The ACK must arrive from the previous hop
     * in the recorded reverse path. This prevents
     * an unrelated nearby peer from injecting a
     * delivery confirmation.
     */
    if (currentIndex < 0) {
      return;
    }

    if (
      currentIndex > 0 &&
      returnPath[currentIndex - 1] !== peerId
    ) {
      return;
    }

    /*
     * The final entry is the original sender.
     * Only that device settles the outbound message.
     */
    if (
      currentIndex ===
      returnPath.length - 1
    ) {
      await this.handlers.onDeliveryAck?.(
        packet,
      );
      return;
    }

    /*
     * Intermediate peers forward the ACK to the
     * next device in the recorded return path.
     *
     * The encrypted message payload is not present
     * in a delivery ACK, so no message decryption
     * occurs here.
     */
    const nextPeerId =
      returnPath[currentIndex + 1];

    if (
      !nextPeerId ||
      nextPeerId === identityId
    ) {
      return;
    }

    try {
      /*
       * The return hop may use a different nearby transport
       * from the one that delivered this ACK. Resolve the
       * adapter for the actual next peer instead of blindly
       * reusing the incoming adapter.
       */
      const nextAdapter =
        await this.findAdapterForPeer(
          nextPeerId,
        );

      if (!nextAdapter) {
        return;
      }

      await this.sendPacket(
        nextAdapter,
        nextPeerId,
        packet,
      );
    } catch {
      /*
       * Do not settle the original message if the
       * return hop could not be completed.
       */
    }
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
