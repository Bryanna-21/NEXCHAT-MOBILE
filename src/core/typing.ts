import { useSyncExternalStore } from "react";
import { subscribeTransportEvents } from "./transport/events";

type TypingListener = () => void;

const listeners = new Set<TypingListener>();

const typingPeers = new Map<string, number>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function cleanupExpired() {
  const now = Date.now();
  let changed = false;

  for (const [peerId, expiresAt] of typingPeers) {
    if (expiresAt <= now) {
      typingPeers.delete(peerId);
      changed = true;
    }
  }

  if (changed) {
    notify();
  }
}

export function setPeerTyping(
  peerId: string,
  isTyping: boolean,
  ttlMs = 5000,
): void {
  if (isTyping) {
    typingPeers.set(peerId, Date.now() + ttlMs);
  } else {
    typingPeers.delete(peerId);
  }

  notify();
}

export function isPeerTyping(peerId: string): boolean {
  cleanupExpired();
  const expiresAt = typingPeers.get(peerId);
  return expiresAt !== undefined && expiresAt > Date.now();
}

export function subscribeTyping(
  listener: TypingListener,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function usePeerTyping(peerId: string): boolean {
  return useSyncExternalStore(
    subscribeTyping,
    () => isPeerTyping(peerId),
    () => false,
  );
}


subscribeTransportEvents((event) => {
  if (event.kind === "typing-start") {
    setPeerTyping(event.senderId, true);
  } else if (event.kind === "typing-stop") {
    setPeerTyping(event.senderId, false);
  }
});
