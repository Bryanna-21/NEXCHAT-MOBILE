import {
  TransportEnvelope,
  TransportKind,
} from "./protocol";

export type QueueItemState =
  | "queued"
  | "sending"
  | "accepted"
  | "delivered"
  | "failed";

export interface QueueItem {
  id: string;

  /*
   * Full envelope metadata is retained so the message can be
   * reconstructed exactly after an app restart.
   *
   * payload remains base64-encoded encrypted bytes.
   */
  envelopeId: string;
  senderId: string;
  recipientId: string;
  createdAt: string;
  messageId?: string;
  payload: string;
  ttl?: number;

  attempts: number;
  state: QueueItemState;
  maxAttempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  expiresAt?: string;
  lastTransport?: TransportKind;
}

const queue: QueueItem[] = [];

const QUEUE_STORAGE_KEY =
  "@nexchat/transport-queue/v2";

let persistenceTimer:
  ReturnType<typeof setTimeout> | null = null;

let persistenceReady = false;

function persistQueueSoon(): void {
  if (persistenceTimer) {
    clearTimeout(persistenceTimer);
  }

  persistenceTimer = setTimeout(() => {
    persistenceTimer = null;
    void persistQueue();
  }, 150);
}

async function persistQueue(): Promise<void> {
  try {
    const AsyncStorage =
      require("@react-native-async-storage/async-storage")
        .default;

    await AsyncStorage.setItem(
      QUEUE_STORAGE_KEY,
      JSON.stringify(queue),
    );
  } catch {
    /*
     * Queue persistence must never crash the chat UI.
     */
  }
}

export async function initializeQueue(): Promise<void> {
  if (persistenceReady) {
    return;
  }

  try {
    const AsyncStorage =
      require("@react-native-async-storage/async-storage")
        .default;

    const raw =
      await AsyncStorage.getItem(
        QUEUE_STORAGE_KEY,
      );

    if (raw) {
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        const now = Date.now();

        queue.splice(
          0,
          queue.length,
          ...parsed.filter(
            (item): item is QueueItem =>
              Boolean(
                item &&
                typeof item.id === "string" &&
                typeof item.envelopeId === "string" &&
                typeof item.senderId === "string" &&
                typeof item.recipientId === "string" &&
                typeof item.payload === "string" &&
                typeof item.createdAt === "string" &&
                typeof item.attempts === "number" &&
                typeof item.maxAttempts === "number" &&
                (
                  item.state === "queued" ||
                  item.state === "sending" ||
                  item.state === "accepted" ||
                  item.state === "delivered" ||
                  item.state === "failed"
                ),
              ),
          ).filter(item => {
            if (!item.expiresAt) {
              return true;
            }

            return (
              new Date(
                item.expiresAt,
              ).getTime() > now
            );
          }),
        );
      }
    }
  } catch {
    /*
     * A corrupted queue must never prevent NexChat from opening.
     */
  }

  persistenceReady = true;
}

function removeExpired(): void {
  const now = Date.now();
  let changed = false;

  for (
    let index = queue.length - 1;
    index >= 0;
    index -= 1
  ) {
    const item = queue[index];

    if (
      item.expiresAt &&
      new Date(item.expiresAt).getTime() <= now
    ) {
      queue.splice(index, 1);
      changed = true;
    }
  }

  if (changed) {
    persistQueueSoon();
  }
}

function encodePayload(
  payload: Uint8Array,
): string {
  let binary = "";

  for (const byte of payload) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export function decodePayload(
  value: string,
): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(
    binary.length,
  );

  for (
    let index = 0;
    index < binary.length;
    index += 1
  ) {
    bytes[index] =
      binary.charCodeAt(index);
  }

  return bytes;
}

function getEnvelopeExpiry(
  envelope: TransportEnvelope,
): string {
  const createdAt =
    new Date(envelope.createdAt).getTime();

  const ttl =
    envelope.ttl ??
    7 * 24 * 60 * 60 * 1000;

  return new Date(
    createdAt + ttl,
  ).toISOString();
}

export function enqueue(
  envelope: TransportEnvelope,
): QueueItem {
  const item: QueueItem = {
    id:
      envelope.queueId ??
      `queue-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,

    envelopeId: envelope.id,
    senderId: envelope.senderId,
    recipientId: envelope.recipientId,
    createdAt: envelope.createdAt,
    messageId: envelope.messageId,
    payload: encodePayload(
      envelope.payload,
    ),
    ttl: envelope.ttl,

    attempts: 0,
    state: "queued",

    /*
     * Attempts are bounded generously, but expiry is the
     * authoritative retention limit. This prevents the
     * retry ceiling from ending store-and-forward delivery
     * before the seven-day envelope TTL.
     */
    maxAttempts: 4096,

    expiresAt:
      getEnvelopeExpiry(envelope),
  };

  queue.push(item);
  persistQueueSoon();

  return { ...item };
}

export function recoverInterruptedItems(): void {
  let changed = false;

  for (const item of queue) {
    /*
     * A process cannot safely remain in "sending" across an
     * application restart. The worker will retry it normally.
     */
    if (item.state === "sending") {
      item.state = "queued";
      changed = true;
    }
  }

  if (changed) {
    persistQueueSoon();
  }
}

export function getPendingItems(): QueueItem[] {
  removeExpired();

  return queue
    .filter(
      item =>
        item.state === "queued" ||
        item.state === "sending" ||
        item.state === "failed",
    )
    .map(item => ({ ...item }));
}

export function getFailedItems(): QueueItem[] {
  removeExpired();

  return queue
    .filter(
      item =>
        item.state === "failed" &&
        item.attempts < item.maxAttempts,
    )
    .map(item => ({ ...item }));
}

export function getQueuedItems(): QueueItem[] {
  removeExpired();

  return queue.map(item => ({ ...item }));
}

export function canRetry(
  id: string,
): boolean {
  const item = queue.find(
    candidate => candidate.id === id,
  );

  if (!item) {
    return false;
  }

  return (
    (
      item.state === "queued" ||
      item.state === "failed"
    ) &&
    item.attempts < item.maxAttempts
  );
}

export function getQueueItem(
  id: string,
): QueueItem | undefined {
  const item = queue.find(
    candidate => candidate.id === id,
  );

  return item
    ? { ...item }
    : undefined;
}

export function getQueueItemForMessage(
  messageId: string,
): QueueItem | undefined {
  const item = queue.find(
    candidate =>
      candidate.messageId === messageId &&
      candidate.state !== "delivered",
  );

  return item
    ? { ...item }
    : undefined;
}

export function getQueuedForPeer(
  recipientId: string,
): QueueItem[] {
  removeExpired();

  return queue
    .filter(
      item =>
        item.recipientId === recipientId &&
        item.state !== "delivered",
    )
    .map(item => ({ ...item }));
}

export function markSending(
  id: string,
): void {
  const item = queue.find(
    candidate => candidate.id === id,
  );

  if (!item) return;

  if (
    item.state !== "queued" &&
    item.state !== "failed"
  ) {
    return;
  }

  if (
    item.attempts >=
    item.maxAttempts
  ) {
    item.state = "failed";
    item.lastError =
      "Maximum delivery attempts reached.";
    persistQueueSoon();
    return;
  }

  item.state = "sending";
  item.attempts += 1;
  item.lastAttemptAt =
    new Date().toISOString();
  item.lastError = undefined;

  persistQueueSoon();
}

export function markAccepted(
  id: string,
  transport: TransportKind,
): void {
  const item = queue.find(
    candidate => candidate.id === id,
  );

  if (!item) return;

  if (
    item.state !== "sending" &&
    item.state !== "queued"
  ) {
    return;
  }

  item.state = "accepted";
  item.lastTransport = transport;
  item.lastError = undefined;

  persistQueueSoon();
}

export function markDelivered(
  id: string,
): void {
  const item = queue.find(
    candidate => candidate.id === id,
  );

  if (!item) return;

  if (item.state === "delivered") {
    return;
  }

  if (
    item.state !== "sending" &&
    item.state !== "queued" &&
    item.state !== "accepted"
  ) {
    return;
  }

  item.state = "delivered";
  item.lastError = undefined;

  persistQueueSoon();
}

export function markDeliveredByMessageId(
  messageId: string,
): void {
  const item = queue.find(
    candidate =>
      candidate.messageId === messageId &&
      candidate.state !== "delivered",
  );

  if (!item) return;

  item.state = "delivered";
  item.lastError = undefined;

  persistQueueSoon();
}

export function markFailed(
  id: string,
  error: string,
): void {
  const item = queue.find(
    candidate => candidate.id === id,
  );

  if (!item) return;

  if (item.state !== "sending") {
    return;
  }

  item.state = "failed";
  item.lastError = error;

  persistQueueSoon();
}

export function requeue(
  id: string,
): void {
  const item = queue.find(
    candidate => candidate.id === id,
  );

  if (!item) return;

  if (!canRetry(id)) {
    return;
  }

  item.state = "queued";
  item.lastError = undefined;

  persistQueueSoon();
}

export function retryFailed(
  id: string,
): void {
  const item = queue.find(
    candidate => candidate.id === id,
  );

  if (
    !item ||
    item.state !== "failed"
  ) {
    return;
  }

  if (!canRetry(id)) {
    return;
  }

  item.state = "queued";
  item.lastError = undefined;

  persistQueueSoon();
}

export function removeDelivered(): void {
  let changed = false;

  for (
    let index = queue.length - 1;
    index >= 0;
    index -= 1
  ) {
    if (
      queue[index].state ===
      "delivered"
    ) {
      queue.splice(index, 1);
      changed = true;
    }
  }

  if (changed) {
    persistQueueSoon();
  }
}

export function clearQueue(): void {
  queue.splice(0, queue.length);
  persistQueueSoon();
}

export function resetQueue(): void {
  clearQueue();
}
