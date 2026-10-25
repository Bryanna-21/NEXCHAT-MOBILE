/**
 * Startup orchestration for NexChat.
 *
 * Goals:
 *  - Readiness is explicit: "booting" | "ready" | "failed". A non-null
 *    identity alone is never treated as proof that startup succeeded.
 *  - Every essential stage is bounded by a timeout, so an awaited operation
 *    that never resolves turns into a readable failure instead of an endless
 *    splash.
 *  - Slow heavy initialisers are memoised: a retry re-awaits an operation that
 *    is still pending (rather than starting a duplicate) and skips stages that
 *    already succeeded. Failed stages are cleared so a retry really retries.
 *  - Retry is single-flight: overlapping runs share one in-flight promise.
 *  - Non-essential work (network, backups) never blocks readiness and never
 *    throws into the caller; its failures are reported through a callback.
 *
 * No react-native imports, so this is unit-testable in plain Node.
 */

export type StartupPhase = "booting" | "ready" | "failed";

export type StartupFailure = {
  stage: string;
  message: string;
  timedOut: boolean;
};

export class StartupStageError extends Error {
  readonly stage: string;
  readonly timedOut: boolean;
  constructor(stage: string, message: string, timedOut: boolean, cause?: unknown) {
    super(message);
    this.name = "StartupStageError";
    this.stage = stage;
    this.timedOut = timedOut;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export const DEFAULT_STAGE_TIMEOUT_MS = 20_000;

/**
 * Rejects with a StartupStageError if `work` does not settle in `ms`.
 * The underlying promise is NOT cancelled (JS cannot); callers that need
 * "don't start it twice" semantics should wrap it in memoUntilFailure.
 */
export function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  stage: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new StartupStageError(
          stage,
          `"${stage}" did not finish within ${Math.round(ms / 1000)}s.`,
          true,
        ),
      );
    }, ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(
          e instanceof StartupStageError
            ? e
            : new StartupStageError(
                stage,
                e instanceof Error && e.message
                  ? e.message
                  : `"${stage}" failed.`,
                false,
                e,
              ),
        );
      },
    );
  });
}

/**
 * Calls fn at most once while it is pending or has succeeded. If it rejects,
 * the memo is cleared so the next call runs it again.
 */
export function memoUntilFailure<T>(fn: () => Promise<T>): {
  (): Promise<T>;
  reset(): void;
} {
  let p: Promise<T> | null = null;
  const run = (() => {
    if (!p) {
      const cur: Promise<T> = fn().catch((e) => {
        if (p === cur) p = null;
        throw e;
      });
      p = cur;
    }
    return p;
  }) as { (): Promise<T>; reset(): void };
  run.reset = () => {
    p = null;
  };
  return run;
}

export type EssentialSteps<TIdentity> = {
  /** Secure-storage identity creation/restoration. */
  initIdentity(): Promise<unknown>;
  /** Encrypted vault open/migrate. */
  initVault(): Promise<unknown>;
  /** Store hydration from the vault. */
  hydrate(): Promise<unknown>;
  /** Local-only restore of durable queues/peer custody. No network. */
  initLocalTransportState(): Promise<unknown>;
  getIdentity(): Promise<TIdentity>;
  hasAccount(): Promise<boolean>;
  isAuthenticated(): Promise<boolean>;
};

export type EssentialResult<TIdentity> = {
  identity: TIdentity;
  accountExists: boolean;
  sessionActive: boolean;
};

export type StageEvent = {
  stage: string;
  status: "start" | "ok" | "fail";
  ms?: number;
  /** Never include secrets here. */
  error?: string;
};

export type StartupOptions = {
  stageTimeoutMs?: number;
  onStage?: (e: StageEvent) => void;
  now?: () => number;
};

export function createEssentialStartup<TIdentity>(
  steps: EssentialSteps<TIdentity>,
  baseOptions: StartupOptions = {},
) {
  // Heavy, stateful initialisers are memoised across retries.
  const initIdentity = memoUntilFailure(() => steps.initIdentity());
  const initVault = memoUntilFailure(() => steps.initVault());
  const hydrate = memoUntilFailure(() => steps.hydrate());
  const initLocalTransportState = memoUntilFailure(() =>
    steps.initLocalTransportState(),
  );

  let inflight: Promise<EssentialResult<TIdentity>> | null = null;

  async function runOnce(
    options: StartupOptions,
  ): Promise<EssentialResult<TIdentity>> {
    const timeoutMs =
      options.stageTimeoutMs ??
      baseOptions.stageTimeoutMs ??
      DEFAULT_STAGE_TIMEOUT_MS;
    const onStage = options.onStage ?? baseOptions.onStage;
    const now = options.now ?? baseOptions.now ?? Date.now;

    async function stage<T>(name: string, fn: () => Promise<T>): Promise<T> {
      const t0 = now();
      onStage?.({ stage: name, status: "start" });
      try {
        // fn() may throw synchronously; wrap so it becomes a rejection.
        const result = await withTimeout(
          Promise.resolve().then(fn),
          timeoutMs,
          name,
        );
        onStage?.({ stage: name, status: "ok", ms: now() - t0 });
        return result;
      } catch (e) {
        const err =
          e instanceof StartupStageError
            ? e
            : new StartupStageError(
                name,
                e instanceof Error ? e.message : `"${name}" failed.`,
                false,
                e,
              );
        onStage?.({
          stage: name,
          status: "fail",
          ms: now() - t0,
          error: err.message,
        });
        throw err;
      }
    }

    await stage("identity.init", initIdentity);
    await stage("vault.init", initVault);
    await stage("store.hydrate", hydrate);
    await stage("transport.localState", initLocalTransportState);
    const identity = await stage("identity.get", () => steps.getIdentity());
    const accountExists = await stage("account.has", () => steps.hasAccount());
    const sessionActive = await stage("session.check", () =>
      steps.isAuthenticated(),
    );
    return { identity, accountExists, sessionActive };
  }

  return {
    /**
     * Single flight: if a run is already in progress, callers share it.
     */
    run(options: StartupOptions = {}): Promise<EssentialResult<TIdentity>> {
      if (!inflight) {
        const p: Promise<EssentialResult<TIdentity>> = runOnce(options).finally(
          () => {
            if (inflight === p) inflight = null;
          },
        );
        inflight = p;
      }
      return inflight;
    },
    get busy(): boolean {
      return inflight !== null;
    },
    /** Forget memoised successes, e.g. after the user resets the vault. */
    reset(): void {
      initIdentity.reset();
      initVault.reset();
      hydrate.reset();
      initLocalTransportState.reset();
    },
  };
}

export function toFailure(e: unknown): StartupFailure {
  if (e instanceof StartupStageError) {
    return { stage: e.stage, message: e.message, timedOut: e.timedOut };
  }
  return {
    stage: "unknown",
    message:
      e instanceof Error && e.message
        ? e.message
        : "NexChat failed to start for an unknown reason.",
    timedOut: false,
  };
}

/**
 * Runs non-essential work after readiness. Never throws; bounded by a timeout;
 * failures go to onError (callers log/record them, they do not block the UI).
 */
export async function runBackground<T>(
  name: string,
  fn: () => Promise<T>,
  opts: {
    timeoutMs?: number;
    onError?: (name: string, error: StartupFailure) => void;
  } = {},
): Promise<T | undefined> {
  try {
    return await withTimeout(
      Promise.resolve().then(fn),
      opts.timeoutMs ?? 30_000,
      name,
    );
  } catch (e) {
    opts.onError?.(name, toFailure(e));
    return undefined;
  }
}

export type RootView = "error" | "splash" | "auth" | "app";

/**
 * Which top-level view to render. Order matters and is regression-tested:
 *  - A startup failure is shown immediately, even if the minimum splash time
 *    has not elapsed and even if account state was never loaded. (Previously
 *    the error screen sat behind account/auth gates, so an early failure left
 *    the user on the splash forever.)
 *  - The splash stays up until startup is explicitly "ready" AND the minimum
 *    display time has elapsed.
 */
export function selectRootView(input: {
  phase: StartupPhase;
  splashMinDone: boolean;
  authenticated: boolean;
}): RootView {
  if (input.phase === "failed") return "error";
  if (input.phase !== "ready" || !input.splashMinDone) return "splash";
  return input.authenticated ? "app" : "auth";
}
