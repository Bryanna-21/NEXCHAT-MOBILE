import {
  TransportEvent,
  TransportEventKind,
} from "./protocol";

type TransportEventListener = (
  event: TransportEvent,
) => void;

const listeners = new Set<TransportEventListener>();

export function subscribeTransportEvents(
  listener: TransportEventListener,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function emitTransportEvent(
  kind: TransportEventKind,
  senderId: string,
  recipientId: string,
  ttlMs = 5000,
): TransportEvent {
  const now = Date.now();

  const event: TransportEvent = {
    id:
      `evt-${now}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    kind,
    senderId,
    recipientId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
  };

  for (const listener of listeners) {
    listener(event);
  }

  return event;
}

export function deliverTransportEvent(
  event: TransportEvent,
): void {
  if (new Date(event.expiresAt).getTime() <= Date.now()) {
    return;
  }

  for (const listener of listeners) {
    listener(event);
  }
}
