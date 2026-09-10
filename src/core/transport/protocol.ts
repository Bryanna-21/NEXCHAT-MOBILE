export type TransportKind =
  | "local"
  | "nearby-bluetooth"
  | "nearby-wifi"
  | "internet-relay";

export type TransportState =
  | "unavailable"
  | "available"
  | "connecting"
  | "connected"
  | "failed";

export interface TransportEnvelope {
  id: string;
  senderId: string;
  recipientId: string;
  createdAt: string;
  payload: Uint8Array;
  ttl?: number;
  messageId?: string;
  queueId?: string;
}

export interface TransportResult {
  transport: TransportKind;
  delivered: boolean;
  queued: boolean;
  error?: string;
  queueId?: string;
  messageId?: string;
}

export interface NexTransport {
  readonly kind: TransportKind;

  available(): Promise<boolean>;

  send(
    envelope: TransportEnvelope,
  ): Promise<TransportResult>;
}

export function createTransportEnvelope(
  senderId: string,
  recipientId: string,
  payload: Uint8Array,
  messageId?: string,
): TransportEnvelope {
  return {
    id:
      `tx-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    senderId,
    recipientId,
    createdAt: new Date().toISOString(),
    payload,
    messageId,
    queueId: undefined,
  };
}


export function isValidTransportEnvelope(
  envelope: TransportEnvelope,
): boolean {
  return Boolean(
    envelope.id &&
    envelope.senderId &&
    envelope.recipientId &&
    envelope.createdAt &&
    envelope.payload instanceof Uint8Array &&
    (!envelope.ttl || envelope.ttl > 0),
  );
}
