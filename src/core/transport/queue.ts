export type QueueItemState =
  | "queued"
  | "sending"
  | "delivered"
  | "failed";

export interface QueueItem {
  id: string;
  recipientId: string;
  createdAt: string;
  messageId?: string;
  payload: string;
  attempts: number;
  state: QueueItemState;
  maxAttempts: number;
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
  messageId?: string,
): QueueItem {
  const item: QueueItem = {
    id:
      `queue-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    recipientId,
    createdAt: new Date().toISOString(),
    messageId,
    payload: encodePayload(payload),
    attempts: 0,
    state: "queued",
    maxAttempts: 5,
  };

  queue.push(item);

  return { ...item };
}

export function getPendingItems(): QueueItem[] {
  return queue
    .filter(
      item =>
        item.state === "queued" ||
        item.state === "sending",
    )
    .map(item => ({ ...item }));
}

export function getFailedItems(): QueueItem[] {
  return queue
    .filter(
      item =>
        item.state === "failed" &&
        item.attempts < item.maxAttempts,
    )
    .map(item => ({ ...item }));
}

export function getQueuedItems(): QueueItem[] {
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

  if (
    item.state !== "queued" &&
    item.state !== "failed"
  ) {
    return;
  }

  if (item.attempts >= item.maxAttempts) {
    item.state = "failed";
    item.lastError =
      "Maximum delivery attempts reached.";
    return;
  }

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

  if (
    item.state === "delivered"
  ) {
    return;
  }

  if (
    item.state !== "sending" &&
    item.state !== "queued"
  ) {
    return;
  }

  if (item.state !== "sending") {
    return;
  }

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

  if (item.state !== "sending") {
    return;
  }

  item.state = "failed";
  item.lastError = error;
}

export function requeue(id: string): void {
  const item = queue.find(
    candidate => candidate.id === id,
  );

  if (!item) return;

  if (!canRetry(id)) {
    return;
  }

  item.state = "queued";
  item.lastError = undefined;
}

export function retryFailed(
  id: string,
): void {
  const item = queue.find(
    candidate => candidate.id === id,
  );

  if (!item || item.state !== "failed") {
    return;
  }

  if (!canRetry(id)) {
    return;
  }

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

export function resetQueue(): void {
  clearQueue();
}
