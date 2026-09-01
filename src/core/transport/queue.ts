export type QueueItemState =
  | "queued"
  | "sending"
  | "delivered"
  | "failed";

export interface QueueItem {
  id: string;
  recipientId: string;
  createdAt: string;
  payload: string;
  attempts: number;
  state: QueueItemState;
  lastAttemptAt?: string;
  lastError?: string;
}

const queue: QueueItem[] = [];

function encodePayload(payload: Uint8Array): string {
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
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export function enqueue(
  recipientId: string,
  payload: Uint8Array,
): QueueItem {
  const item: QueueItem = {
    id:
      `queue-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    recipientId,
    createdAt: new Date().toISOString(),
    payload: encodePayload(payload),
    attempts: 0,
    state: "queued",
  };

  queue.push(item);

  return { ...item };
}

export function getQueuedItems(): QueueItem[] {
  return queue.map(item => ({ ...item }));
}

export function getQueuedForPeer(
  recipientId: string,
): QueueItem[] {
  return queue
    .filter(
      item =>
        item.recipientId === recipientId &&
        item.state !== "delivered",
    )
    .map(item => ({ ...item }));
}

export function markSending(id: string): void {
  const item = queue.find(
    candidate => candidate.id === id,
  );

  if (!item) return;

  item.state = "sending";
  item.attempts += 1;
  item.lastAttemptAt =
    new Date().toISOString();
  item.lastError = undefined;
}

export function markDelivered(id: string): void {
  const item = queue.find(
    candidate => candidate.id === id,
  );

  if (!item) return;

  item.state = "delivered";
  item.lastError = undefined;
}

export function markFailed(
  id: string,
  error: string,
): void {
  const item = queue.find(
    candidate => candidate.id === id,
  );

  if (!item) return;

  item.state = "failed";
  item.lastError = error;
}

export function requeue(id: string): void {
  const item = queue.find(
    candidate => candidate.id === id,
  );

  if (!item) return;

  item.state = "queued";
  item.lastError = undefined;
}

export function removeDelivered(): void {
  for (
    let index = queue.length - 1;
    index >= 0;
    index -= 1
  ) {
    if (queue[index].state === "delivered") {
      queue.splice(index, 1);
    }
  }
}

export function clearQueue(): void {
  queue.splice(0, queue.length);
}
