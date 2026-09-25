import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  PeerMessagePacket,
  decodePeerPacket,
  encodePeerPacket,
  isPeerRouteExpired,
} from "./peerProtocol";

const STORAGE_KEY = "@nexchat/transport/peer-custody/v1";

const DEFAULT_MAX_ATTEMPTS = 4096;
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type PeerCustodyState =
  | "queued"
  | "sending"
  | "failed";

export interface PeerCustodyItem {
  id: string;
  packet: PeerMessagePacket;
  state: PeerCustodyState;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  lastAttemptAt?: string;
  lastError?: string;
  expiresAt: string;
  lastPeerId?: string;
}

let items: PeerCustodyItem[] = [];
let initialized = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistSoon(): void {
  if (persistTimer) return;

  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persist();
  }, 150);
}

async function persist(): Promise<void> {
  try {
    const serialized = items.map(item => ({
      ...item,
      packet: encodePeerPacket(item.packet),
    }));

    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(serialized),
    );
  } catch {
    // Keep the in-memory custody store alive.
  }
}

function removeExpiredInternal(): boolean {
  const before = items.length;

  items = items.filter(item => {
    if (isPeerRouteExpired(item.packet.route)) {
      return false;
    }

    const expiresAt = new Date(item.expiresAt).getTime();

    return (
      Number.isFinite(expiresAt) &&
      Date.now() < expiresAt
    );
  });

  return items.length !== before;
}

function makeItem(
  packet: PeerMessagePacket,
): PeerCustodyItem {
  const routeExpiry = new Date(
    packet.route.expiresAt,
  ).getTime();

  const fallbackExpiry =
    Date.now() + DEFAULT_RETENTION_MS;

  const expiry =
    Number.isFinite(routeExpiry)
      ? routeExpiry
      : fallbackExpiry;

  return {
    id:
      `custody-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    packet: {
      ...packet,
      envelope: {
        ...packet.envelope,
        payload: new Uint8Array(packet.envelope.payload),
      },
      route: {
        ...packet.route,
      },
    },
    state: "queued",
    attempts: 0,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(expiry).toISOString(),
  };
}

function samePacket(
  item: PeerCustodyItem,
  packet: PeerMessagePacket,
): boolean {
  const routeId = packet.route.routeId;

  return (
    item.packet.route.routeId === routeId ||
    item.packet.envelope.id === packet.envelope.id ||
    (
      !!item.packet.envelope.messageId &&
      item.packet.envelope.messageId ===
        packet.envelope.messageId
    )
  );
}

export async function initializePeerStore(): Promise<void> {
  if (initialized) return;

  initialized = true;

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);

    if (!raw) {
      items = [];
      return;
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      items = [];
      return;
    }

    items = parsed
      .map(value => {
        if (!value || typeof value !== "object") {
          return null;
        }

        const candidate =
          value as Partial<PeerCustodyItem>;

        if (
          typeof candidate.id !== "string" ||
          typeof candidate.createdAt !== "string" ||
          typeof candidate.expiresAt !== "string" ||
          typeof candidate.attempts !== "number" ||
          typeof candidate.maxAttempts !== "number"
        ) {
          return null;
        }

        const packet = decodePeerPacket(
          JSON.stringify(
            candidate.packet,
          ),
        );

        if (!packet || packet.type !== "message") {
          return null;
        }

        return {
          ...candidate,
          packet,
          state:
            candidate.state === "sending"
              ? "queued"
              : candidate.state === "failed"
                ? "failed"
                : "queued",
        } as PeerCustodyItem;
      })
      .filter(
        (item): item is PeerCustodyItem =>
          item !== null,
      );

    if (removeExpiredInternal()) {
      await persist();
    }
  } catch {
    items = [];
  }
}

export function recoverPeerCustody(): void {
  let changed = false;

  for (const item of items) {
    if (item.state === "sending") {
      item.state = "queued";
      changed = true;
    }
  }

  if (removeExpiredInternal()) {
    changed = true;
  }

  if (changed) {
    persistSoon();
  }
}

export function acceptPeerPacket(
  packet: PeerMessagePacket,
): PeerCustodyItem | null {
  if (
    packet.type !== "message" ||
    isPeerRouteExpired(packet.route)
  ) {
    return null;
  }

  removeExpiredInternal();

  const existing = items.find(item =>
    samePacket(item, packet),
  );

  if (existing) {
    return existing;
  }

  const item = makeItem(packet);

  items.push(item);
  persistSoon();

  return item;
}

export function getPeerCustodyItems(): PeerCustodyItem[] {
  removeExpiredInternal();

  return items.map(item => ({
    ...item,
    packet: {
      ...item.packet,
      envelope: {
        ...item.packet.envelope,
        payload: new Uint8Array(
          item.packet.envelope.payload,
        ),
      },
    },
  }));
}

export function getReadyPeerCustodyItems(): PeerCustodyItem[] {
  return getPeerCustodyItems().filter(
    item =>
      item.state === "queued" ||
      item.state === "failed",
  );
}

export function getPeerCustodyItem(
  id: string,
): PeerCustodyItem | undefined {
  return getPeerCustodyItems().find(
    item => item.id === id,
  );
}

export function markPeerSending(
  id: string,
): void {
  const item = items.find(
    candidate => candidate.id === id,
  );

  if (!item) return;

  item.state = "sending";
  item.attempts += 1;
  item.lastAttemptAt =
    new Date().toISOString();

  persistSoon();
}

export function markPeerFailed(
  id: string,
  error: string,
): void {
  const item = items.find(
    candidate => candidate.id === id,
  );

  if (!item) return;

  item.state = "failed";
  item.lastError = error;

  persistSoon();
}

export function requeuePeer(
  id: string,
  peerId?: string,
): void {
  const item = items.find(
    candidate => candidate.id === id,
  );

  if (!item) return;

  item.state = "queued";
  item.lastPeerId = peerId;
  item.lastError = undefined;

  persistSoon();
}

export function removePeerCustody(
  id: string,
): void {
  const before = items.length;

  items = items.filter(
    item => item.id !== id,
  );

  if (items.length !== before) {
    persistSoon();
  }
}

export function hasPeerCustody(
  packet: PeerMessagePacket,
): boolean {
  removeExpiredInternal();

  return items.some(item =>
    samePacket(item, packet),
  );
}

export function getPeerCustodyCount(): number {
  removeExpiredInternal();
  return items.length;
}

export function clearPeerStore(): void {
  items = [];
  initialized = true;
  persistSoon();
}

/**
 * Returns a JSON-safe copy of a custody item.
 *
 * This is intended for debugging/diagnostics and transport
 * handoff only. The encrypted payload remains opaque.
 */
export function encodeCustodyItem(
  item: PeerCustodyItem,
): string {
  return JSON.stringify({
    ...item,
    packet: encodePeerPacket(item.packet),
  });
}
