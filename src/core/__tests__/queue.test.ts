import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nodeRequire = createRequire(import.meta.url);
const KEY = "@nexchat/transport-queue/v2";

// queue.ts lazily require()s AsyncStorage; inject an in-memory fake into the
// CommonJS require cache so we can observe persistence.
function installFakeStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  const writes: Array<[string, string]> = [];
  const fake = {
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      writes.push([k, v]);
      data.set(k, v);
    },
    removeItem: async (k: string) => void data.delete(k),
  };
  const id = nodeRequire.resolve("@react-native-async-storage/async-storage");
  nodeRequire.cache[id] = {
    id,
    filename: id,
    loaded: true,
    exports: { default: fake },
  } as unknown as NodeJS.Module;
  return { data, writes };
}

async function freshQueue(initial: Record<string, string> = {}) {
  const storage = installFakeStorage(initial);
  vi.resetModules();
  const q = await import("../transport/queue");
  return { q, storage };
}

const envelope = (over: Record<string, unknown> = {}) => ({
  id: "env-1",
  senderId: "me",
  recipientId: "peer",
  createdAt: new Date().toISOString(),
  messageId: "msg-1",
  payload: new Uint8Array([1, 2, 3]),
  ...over,
});
type Env = Parameters<typeof import("../transport/queue").enqueue>[0];
const env = (o: Record<string, unknown> = {}) => envelope(o) as unknown as Env;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("delivery state machine", () => {
  it("queued -> sending -> accepted -> delivered", async () => {
    const { q } = await freshQueue();
    const item = q.enqueue(env());
    expect(item.state).toBe("queued");

    q.markSending(item.id);
    expect(q.getQueueItem(item.id)).toMatchObject({ state: "sending", attempts: 1 });

    q.markAccepted(item.id, "internet" as never);
    expect(q.getQueueItem(item.id)?.state).toBe("accepted");

    q.markDelivered(item.id);
    expect(q.getQueueItem(item.id)?.state).toBe("delivered");
  });

  it("local acceptance is not delivery: accepted items are still pending-for-peer", async () => {
    const { q } = await freshQueue();
    const item = q.enqueue(env());
    q.markSending(item.id);
    q.markAccepted(item.id, "internet" as never);
    expect(q.getQueuedForPeer("peer")).toHaveLength(1);
    expect(q.getQueueItem(item.id)?.state).not.toBe("delivered");
  });

  it("markDelivered is idempotent (duplicate receipts do nothing)", async () => {
    const { q } = await freshQueue();
    const item = q.enqueue(env());
    q.markSending(item.id);
    q.markDelivered(item.id);
    q.markDelivered(item.id);
    expect(q.getQueueItem(item.id)?.state).toBe("delivered");
    expect(q.getQueueItem(item.id)?.attempts).toBe(1);
  });

  it("a delivered item cannot be re-sent, failed or requeued", async () => {
    const { q } = await freshQueue();
    const item = q.enqueue(env());
    q.markSending(item.id);
    q.markDelivered(item.id);
    q.markSending(item.id);
    q.markFailed(item.id, "late error");
    q.requeue(item.id);
    q.retryFailed(item.id);
    expect(q.getQueueItem(item.id)?.state).toBe("delivered");
  });

  it("failure is recorded only from sending, and retry returns it to queued", async () => {
    const { q } = await freshQueue();
    const item = q.enqueue(env());
    q.markFailed(item.id, "ignored: not sending");
    expect(q.getQueueItem(item.id)?.state).toBe("queued");

    q.markSending(item.id);
    q.markFailed(item.id, "relay unavailable");
    expect(q.getQueueItem(item.id)).toMatchObject({ state: "failed", lastError: "relay unavailable" });

    q.retryFailed(item.id);
    expect(q.getQueueItem(item.id)).toMatchObject({ state: "queued", lastError: undefined });
  });

  it("an interrupted 'sending' item is retried after restart", async () => {
    const { q } = await freshQueue();
    const item = q.enqueue(env());
    q.markSending(item.id);
    q.recoverInterruptedItems();
    expect(q.getQueueItem(item.id)?.state).toBe("queued");
  });

  it("delivery receipt by message id resolves the right item only", async () => {
    const { q } = await freshQueue();
    const a = q.enqueue(env({ id: "e-a", messageId: "m-a", queueId: "qa" }));
    const b = q.enqueue(env({ id: "e-b", messageId: "m-b", queueId: "qb" }));
    q.markDeliveredByMessageId("m-a");
    expect(q.getQueueItem(a.id)?.state).toBe("delivered");
    expect(q.getQueueItem(b.id)?.state).toBe("queued");
  });

  it("expired items are dropped, unexpired kept", async () => {
    const { q } = await freshQueue();
    const old = q.enqueue(env({ queueId: "old", createdAt: new Date(Date.now() - 10_000).toISOString(), ttl: 1000 }));
    const fresh = q.enqueue(env({ queueId: "fresh", id: "e2", messageId: "m2" }));
    const ids = q.getQueuedItems().map((i) => i.id);
    expect(ids).not.toContain(old.id);
    expect(ids).toContain(fresh.id);
  });

  it("stops after max attempts instead of sending forever", async () => {
    const { q } = await freshQueue();
    const item = q.enqueue(env());
    for (let i = 0; i < 4096; i++) {
      q.markSending(item.id);
      q.markFailed(item.id, "x");
    }
    expect(q.canRetry(item.id)).toBe(false);
    q.markSending(item.id);
    expect(q.getQueueItem(item.id)?.state).toBe("failed");
  });
});

describe("queue durability", () => {
  it("enqueue is persisted immediately, not after the 150 ms debounce", async () => {
    const { q, storage } = await freshQueue();
    q.enqueue(env());
    await Promise.resolve();
    await Promise.resolve();
    expect(storage.writes.length).toBeGreaterThan(0);
    expect(JSON.parse(storage.data.get(KEY)!)).toHaveLength(1);
  });

  it("restores queued items after restart and keeps payload bytes", async () => {
    const first = await freshQueue();
    first.q.enqueue(env({ queueId: "keep" }));
    await vi.advanceTimersByTimeAsync(500);
    const saved = first.storage.data.get(KEY)!;

    const second = await freshQueue({ [KEY]: saved });
    await second.q.initializeQueue();
    const item = second.q.getQueueItem("keep");
    expect(item?.state).toBe("queued");
    expect(Array.from(second.q.decodePayload(item!.payload))).toEqual([1, 2, 3]);
  });

  it("drops malformed entries but keeps valid ones", async () => {
    const valid = {
      id: "ok", envelopeId: "e", senderId: "a", recipientId: "b",
      createdAt: new Date().toISOString(), payload: "AQID", attempts: 0, maxAttempts: 10, state: "queued",
    };
    const { q } = await freshQueue({
      [KEY]: JSON.stringify([valid, { id: 5 }, null, { ...valid, id: "bad", state: "weird" }]),
    });
    await q.initializeQueue();
    expect(q.getQueuedItems().map((i) => i.id)).toEqual(["ok"]);
  });

  it("a corrupt stored queue does not block startup and is preserved, not overwritten", async () => {
    const { q, storage } = await freshQueue({ [KEY]: "{not json" });
    await expect(q.initializeQueue()).resolves.toBeUndefined();
    expect(storage.data.get(`${KEY}.corrupt`)).toBe("{not json");
    expect(q.getQueuedItems()).toEqual([]);
  });
});
