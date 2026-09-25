import {
  TransportEnvelope,
} from "./protocol";

import {
  QueueItem,
  decodePayload,
  getPendingItems,
  markAccepted,
  markDelivered,
  markFailed,
  markSending,
  requeue,
} from "./queue";

import {
  TransportRouter,
} from "./router";

/*
 * The worker intentionally runs on a modest interval.
 *
 * It is not a realtime socket. The relay transport handles
 * realtime inbound delivery; this worker handles durable
 * outbound recovery/retry.
 */
const WORKER_INTERVAL_MS = 5000;

/*
 * Exponential retry backoff:
 *
 * 5s → 10s → 20s → 40s → 80s → 160s → ...
 *
 * Capped so an offline phone eventually checks again rather
 * than waiting indefinitely.
 */
const BASE_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

function retryDelay(
  attempts: number,
): number {
  const exponent =
    Math.max(0, attempts - 1);

  return Math.min(
    MAX_BACKOFF_MS,
    BASE_BACKOFF_MS *
      Math.pow(2, exponent),
  );
}

function isExpired(
  item: QueueItem,
): boolean {
  if (!item.expiresAt) {
    return false;
  }

  return (
    new Date(
      item.expiresAt,
    ).getTime() <= Date.now()
  );
}

function isReadyForRetry(
  item: QueueItem,
): boolean {
  if (item.state === "accepted") {
    return false;
  }

  if (
    item.state !== "queued" &&
    item.state !== "failed"
  ) {
    return false;
  }

  if (
    item.attempts >=
    item.maxAttempts
  ) {
    return false;
  }

  if (isExpired(item)) {
    return false;
  }

  if (!item.lastAttemptAt) {
    return true;
  }

  const elapsed =
    Date.now() -
    new Date(
      item.lastAttemptAt,
    ).getTime();

  return (
    elapsed >=
    retryDelay(item.attempts)
  );
}

function toEnvelope(
  item: QueueItem,
): TransportEnvelope {
  return {
    id: item.envelopeId,
    senderId: item.senderId,
    recipientId: item.recipientId,
    createdAt: item.createdAt,
    payload: decodePayload(
      item.payload,
    ),
    ttl: item.ttl,
    messageId: item.messageId,
    queueId: item.id,
  };
}

export class DeliveryWorker {
  private readonly routerFactory:
    (identityId: string) => TransportRouter;

  private identityId?: string;

  private timer:
    ReturnType<typeof setInterval> | null =
      null;

  private running = false;

  private processing =
    new Set<string>();

  constructor(
    routerFactory:
      (identityId: string) =>
        TransportRouter,
  ) {
    this.routerFactory =
      routerFactory;
  }

  start(identityId: string): void {
    this.identityId =
      identityId;

    if (this.timer) {
      return;
    }

    /*
     * Run once immediately so restored messages do not wait
     * for the first five-second interval.
     */
    void this.run();

    this.timer =
      setInterval(() => {
        void this.run();
      }, WORKER_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.identityId =
      undefined;

    this.processing.clear();
  }

  async run(): Promise<void> {
    if (this.running) {
      return;
    }

    if (!this.identityId) {
      return;
    }

    this.running = true;

    try {
      const identityId =
        this.identityId;

      const router =
        this.routerFactory(
          identityId,
        );

      const pending =
        getPendingItems();

      for (const item of pending) {
        if (
          this.processing.has(item.id)
        ) {
          continue;
        }

        if (
          !isReadyForRetry(item)
        ) {
          continue;
        }

        this.processing.add(item.id);

        try {
          await this.processItem(
            router,
            item,
          );
        } finally {
          this.processing.delete(
            item.id,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async processItem(
    router: TransportRouter,
    item: QueueItem,
  ): Promise<void> {
    /*
     * Re-read the queue item before sending. Another worker
     * cycle or lifecycle callback may have changed it.
     */
    const current =
      getPendingItems().find(
        candidate =>
          candidate.id === item.id,
      );

    if (!current) {
      return;
    }

    if (
      !isReadyForRetry(current)
    ) {
      return;
    }

    markSending(current.id);

    let result;

    try {
      result =
        await router.send(
          toEnvelope(current),
        );
    } catch (error) {
      markFailed(
        current.id,
        error instanceof Error
          ? error.message
          : "Transport failed.",
      );

      return;
    }

    if (result.delivered) {
      markDelivered(current.id);
      return;
    }

    if (result.accepted) {
      markAccepted(
        current.id,
        result.transport,
      );
      return;
    }

    if (result.queued) {
      /*
       * LocalTransport means the message is still safely
       * held by this device. Return it to queued so the
       * exponential backoff can govern the next attempt.
       */
      requeue(current.id);
      return;
    }

    markFailed(
      current.id,
      result.error ??
        "No transport accepted the message.",
    );
  }
}
