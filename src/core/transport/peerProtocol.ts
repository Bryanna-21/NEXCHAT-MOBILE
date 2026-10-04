import {
  TransportEnvelope,
  isValidTransportEnvelope,
} from "./protocol";

/**
 * Application-layer protocol carried by Bluetooth/Wi-Fi Direct peers.
 *
 * The payload remains the original encrypted TransportEnvelope payload.
 * Intermediate peers only inspect routing metadata; they never decrypt
 * the message.
 */

export const DEFAULT_PEER_MAX_HOPS = 32;

export type PeerPacketType =
  | "message"
  | "custody-ack"
  | "delivery-ack";

export interface PeerRouteMetadata {
  routeId: string;
  hopCount: number;
  maxHops: number;
  expiresAt: string;
  originId: string;
  destinationId: string;
  previousPeerId?: string;
  path: string[];
}

export interface PeerMessagePacket {
  type: "message";
  packetId: string;
  envelope: TransportEnvelope;
  route: PeerRouteMetadata;
}

export interface PeerCustodyAck {
  type: "custody-ack";
  packetId: string;
  routeId: string;
  envelopeId: string;
  accepted: boolean;
  peerId: string;
}

export interface PeerDeliveryAck {
  type: "delivery-ack";
  packetId: string;
  routeId: string;
  envelopeId: string;
  messageId?: string;
  recipientId: string;
  returnPath: string[];
}

export type PeerPacket =
  | PeerMessagePacket
  | PeerCustodyAck
  | PeerDeliveryAck;

/**
 * JSON-safe representation used on the Bluetooth/Wi-Fi Direct wire.
 *
 * The encrypted message payload is converted to base64 only for transport.
 * It is never decrypted or interpreted by an intermediate peer.
 */
export interface PeerWirePacket {
  type: PeerPacketType;
  packetId: string;
  routeId?: string;
  envelopeId?: string;
  messageId?: string;
  peerId?: string;
  accepted?: boolean;
  recipientId?: string;
  returnPath?: string[];
  envelope?: {
    id: string;
    senderId: string;
    recipientId: string;
    createdAt: string;
    payload: string;
    ttl?: number;
    messageId?: string;
    queueId?: string;
  };
  route?: PeerRouteMetadata;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function encodePeerPacket(
  packet: PeerPacket,
): PeerWirePacket {
  if (packet.type === "message") {
    return {
      type: packet.type,
      packetId: packet.packetId,
      envelope: {
        id: packet.envelope.id,
        senderId: packet.envelope.senderId,
        recipientId: packet.envelope.recipientId,
        createdAt: packet.envelope.createdAt,
        payload: bytesToBase64(packet.envelope.payload),
        ttl: packet.envelope.ttl,
        messageId: packet.envelope.messageId,
        queueId: packet.envelope.queueId,
      },
      route: packet.route,
    };
  }

  if (packet.type === "custody-ack") {
    return {
      type: packet.type,
      packetId: packet.packetId,
      routeId: packet.routeId,
      envelopeId: packet.envelopeId,
      accepted: packet.accepted,
      peerId: packet.peerId,
    };
  }

  return {
    type: packet.type,
    packetId: packet.packetId,
    routeId: packet.routeId,
    envelopeId: packet.envelopeId,
    messageId: packet.messageId,
    recipientId: packet.recipientId,
    returnPath: packet.returnPath,
  };
}

export function decodePeerPacket(
  value: unknown,
): PeerPacket | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const wire = value as PeerWirePacket;

  if (
    typeof wire.type !== "string" ||
    typeof wire.packetId !== "string"
  ) {
    return null;
  }

  if (wire.type === "message") {
    if (
      !wire.envelope ||
      !wire.route ||
      typeof wire.envelope.id !== "string" ||
      typeof wire.envelope.senderId !== "string" ||
      typeof wire.envelope.recipientId !== "string" ||
      typeof wire.envelope.createdAt !== "string" ||
      typeof wire.envelope.payload !== "string"
    ) {
      return null;
    }

    try {
      const envelope: TransportEnvelope = {
        id: wire.envelope.id,
        senderId: wire.envelope.senderId,
        recipientId: wire.envelope.recipientId,
        createdAt: wire.envelope.createdAt,
        payload: base64ToBytes(wire.envelope.payload),
        ttl: wire.envelope.ttl,
        messageId: wire.envelope.messageId,
        queueId: wire.envelope.queueId,
      };

      const packet: PeerMessagePacket = {
        type: "message",
        packetId: wire.packetId,
        envelope,
        route: wire.route,
      };

      return isPeerMessagePacket(packet)
        ? packet
        : null;
    } catch {
      return null;
    }
  }

  if (wire.type === "custody-ack") {
    if (
      typeof wire.routeId !== "string" ||
      typeof wire.envelopeId !== "string" ||
      typeof wire.peerId !== "string" ||
      typeof wire.accepted !== "boolean"
    ) {
      return null;
    }

    return {
      type: "custody-ack",
      packetId: wire.packetId,
      routeId: wire.routeId,
      envelopeId: wire.envelopeId,
      accepted: wire.accepted,
      peerId: wire.peerId,
    };
  }

  if (wire.type === "delivery-ack") {
    if (
      typeof wire.routeId !== "string" ||
      typeof wire.envelopeId !== "string" ||
      typeof wire.recipientId !== "string" ||
      !Array.isArray(wire.returnPath) ||
      wire.returnPath.length === 0 ||
      wire.returnPath.some(
        peerId =>
          typeof peerId !== "string" ||
          peerId.length === 0,
      )
    ) {
      return null;
    }

    return {
      type: "delivery-ack",
      packetId: wire.packetId,
      routeId: wire.routeId,
      envelopeId: wire.envelopeId,
      messageId: wire.messageId,
      recipientId: wire.recipientId,
      returnPath: [...wire.returnPath],
    };
  }

  return null;
}

export function serializePeerPacket(
  packet: PeerPacket,
): string {
  return JSON.stringify(encodePeerPacket(packet));
}

export function deserializePeerPacket(
  value: string,
): PeerPacket | null {
  try {
    return decodePeerPacket(JSON.parse(value));
  } catch {
    return null;
  }
}

export function createPeerRoute(
  envelope: TransportEnvelope,
  maxHops: number = DEFAULT_PEER_MAX_HOPS,
): PeerRouteMetadata {
  const createdAt = new Date(envelope.createdAt).getTime();

  const ttl =
    envelope.ttl !== undefined
      ? envelope.ttl
      : 7 * 24 * 60 * 60 * 1000;

  return {
    routeId:
      envelope.messageId ??
      envelope.queueId ??
      envelope.id,
    hopCount: 0,
    maxHops: Math.max(1, maxHops),
    expiresAt: new Date(createdAt + ttl).toISOString(),
    originId: envelope.senderId,
    destinationId: envelope.recipientId,
    path: [envelope.senderId],
  };
}

export function createPeerMessagePacket(
  envelope: TransportEnvelope,
  maxHops: number = DEFAULT_PEER_MAX_HOPS,
): PeerMessagePacket {
  if (!isValidTransportEnvelope(envelope)) {
    throw new Error("Cannot create a peer packet from an invalid envelope.");
  }

  const route = createPeerRoute(envelope, maxHops);

  return {
    type: "message",
    packetId:
      `peer-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    envelope: {
      ...envelope,
      payload: new Uint8Array(envelope.payload),
    },
    route,
  };
}

export function isPeerRouteExpired(
  route: PeerRouteMetadata,
): boolean {
  const expiresAt = new Date(route.expiresAt).getTime();

  return (
    !Number.isFinite(expiresAt) ||
    Date.now() >= expiresAt
  );
}

export function canForwardPeerPacket(
  packet: PeerMessagePacket,
): boolean {
  if (!isValidTransportEnvelope(packet.envelope)) {
    return false;
  }

  if (isPeerRouteExpired(packet.route)) {
    return false;
  }

  if (
    packet.route.hopCount < 0 ||
    packet.route.maxHops < 1 ||
    packet.route.hopCount >= packet.route.maxHops
  ) {
    return false;
  }

  if (
    packet.route.originId !== packet.envelope.senderId ||
    packet.route.destinationId !== packet.envelope.recipientId
  ) {
    return false;
  }

  return true;
}

export function forwardPeerPacket(
  packet: PeerMessagePacket,
  forwardingPeerId: string,
): PeerMessagePacket | null {
  if (!canForwardPeerPacket(packet)) {
    return null;
  }

  const currentPath =
    packet.route.path &&
    packet.route.path.length > 0
      ? packet.route.path
      : [packet.route.originId];

  if (currentPath.includes(forwardingPeerId)) {
    return null;
  }

  return {
    ...packet,
    envelope: {
      ...packet.envelope,
      payload: new Uint8Array(packet.envelope.payload),
    },
    route: {
      ...packet.route,
      hopCount: packet.route.hopCount + 1,
      previousPeerId: forwardingPeerId,
      path: [...currentPath, forwardingPeerId],
    },
  };
}

export function createCustodyAck(
  packet: PeerMessagePacket,
  peerId: string,
  accepted: boolean = true,
): PeerCustodyAck {
  return {
    type: "custody-ack",
    packetId: packet.packetId,
    routeId: packet.route.routeId,
    envelopeId: packet.envelope.id,
    accepted,
    peerId,
  };
}

export function createDeliveryAck(
  packet: PeerMessagePacket,
): PeerDeliveryAck {
  const path =
    packet.route.path &&
    packet.route.path.length > 0
      ? packet.route.path
      : [packet.route.originId];

  /*
   * Include the final recipient in the reverse path.
   *
   * Message:
   *   A -> B -> C -> D
   *
   * Delivery ACK:
   *   D -> C -> B -> A
   *
   * This allows every intermediate peer to verify
   * that the ACK came from the expected previous hop.
   */
  const deliveryPath =
    path[path.length - 1] ===
    packet.route.destinationId
      ? path
      : [...path, packet.route.destinationId];

  return {
    type: "delivery-ack",
    packetId: packet.packetId,
    routeId: packet.route.routeId,
    envelopeId: packet.envelope.id,
    messageId: packet.envelope.messageId,
    recipientId: packet.envelope.recipientId,
    returnPath: [...deliveryPath].reverse(),
  };
}

export function isPeerMessagePacket(
  value: unknown,
): value is PeerMessagePacket {
  if (!value || typeof value !== "object") return false;

  const packet = value as Partial<PeerMessagePacket>;

  return (
    packet.type === "message" &&
    typeof packet.packetId === "string" &&
    !!packet.envelope &&
    !!packet.route &&
    isValidTransportEnvelope(packet.envelope) &&
    typeof packet.route.routeId === "string" &&
    typeof packet.route.hopCount === "number" &&
    typeof packet.route.maxHops === "number" &&
    typeof packet.route.expiresAt === "string" &&
    typeof packet.route.originId === "string" &&
    typeof packet.route.destinationId === "string"
  );
}
