import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  StartupStageError,
  createEssentialStartup,
  memoUntilFailure,
  runBackground,
  selectRootView,
  toFailure,
  withTimeout,
  type EssentialSteps,
} from "../startup";

type Id = { id: string };

function makeSteps(over: Partial<EssentialSteps<Id>> = {}) {
  const calls: string[] = [];
  const steps: EssentialSteps<Id> = {
    initIdentity: async () => void calls.push("initIdentity"),
    initVault: async () => void calls.push("initVault"),
    hydrate: async () => void calls.push("hydrate"),
    initLocalTransportState: async () => void calls.push("local"),
    getIdentity: async () => (calls.push("getIdentity"), { id: "me" }),
    hasAccount: async () => (calls.push("hasAccount"), true),
    isAuthenticated: async () => (calls.push("isAuthenticated"), true),
    ...over,
  };
  return { steps, calls };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("selectRootView (regression: infinite splash / white screen)", () => {
  it("shows the error immediately, even if account state never loaded and splash time has not elapsed", () => {
    expect(
      selectRootView({ phase: "failed", splashMinDone: false, authenticated: false }),
    ).toBe("error");
  });

  it("keeps the splash until BOTH ready and minimum time elapsed", () => {
    expect(selectRootView({ phase: "booting", splashMinDone: true, authenticated: true })).toBe("splash");
    expect(selectRootView({ phase: "ready", splashMinDone: false, authenticated: true })).toBe("splash");
  });

  it("routes to auth or app only after readiness", () => {
    expect(selectRootView({ phase: "ready", splashMinDone: true, authenticated: false })).toBe("auth");
    expect(selectRootView({ phase: "ready", splashMinDone: true, authenticated: true })).toBe("app");
  });
});

describe("withTimeout", () => {
  it("turns a never-resolving operation into a readable failure", async () => {
    const p = withTimeout(new Promise<void>(() => {}), 1000, "vault.init");
    const assertion = expect(p).rejects.toMatchObject({
      stage: "vault.init",
      timedOut: true,
    });
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });

  it("passes the value through and clears its timer", async () => {
    await expect(withTimeout(Promise.resolve(7), 1000, "x")).resolves.toBe(7);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("essential startup", () => {
  it("runs stages in order and returns identity/account/session", async () => {
    const { steps, calls } = makeSteps();
    const r = await createEssentialStartup(steps).run();
    expect(r).toEqual({ identity: { id: "me" }, accountExists: true, sessionActive: true });
    expect(calls).toEqual([
      "initIdentity", "initVault", "hydrate", "local",
      "getIdentity", "hasAccount", "isAuthenticated",
    ]);
  });

  it("an early failure rejects (so the UI can show the error) and stops later stages", async () => {
    const { steps, calls } = makeSteps({
      initIdentity: async () => {
        throw new Error("keystore unavailable");
      },
    });
    await expect(createEssentialStartup(steps).run()).rejects.toMatchObject({
      stage: "identity.init",
      message: "keystore unavailable",
      timedOut: false,
    });
    expect(calls).toEqual([]);
  });

  it("a hung stage times out instead of spinning forever", async () => {
    const { steps } = makeSteps({ hydrate: () => new Promise(() => {}) });
    const p = createEssentialStartup(steps, { stageTimeoutMs: 500 }).run();
    const assertion = expect(p).rejects.toMatchObject({ stage: "store.hydrate", timedOut: true });
    await vi.advanceTimersByTimeAsync(501);
    await assertion;
  });

  it("does not depend on the network: no transport/network stage is essential", async () => {
    const { steps } = makeSteps();
    expect(Object.keys(steps)).not.toContain("initializeNetworkTransport");
    const r = await createEssentialStartup(steps).run();
    expect(r.identity.id).toBe("me");
  });

  it("is single flight: concurrent runs share one execution", async () => {
    const { steps, calls } = makeSteps();
    const s = createEssentialStartup(steps);
    const [a, b] = await Promise.all([s.run(), s.run()]);
    expect(a).toBe(b);
    expect(calls.filter((c) => c === "initVault")).toHaveLength(1);
    expect(s.busy).toBe(false);
  });

  it("retry after failure re-runs only the failed stage, not completed ones", async () => {
    let failHydrate = true;
    const { steps, calls } = makeSteps({
      hydrate: async () => {
        calls.push("hydrate");
        if (failHydrate) throw new Error("corrupt vault");
      },
    });
    const s = createEssentialStartup(steps);
    await expect(s.run()).rejects.toMatchObject({ stage: "store.hydrate" });
    failHydrate = false;
    await s.run();
    expect(calls.filter((c) => c === "initIdentity")).toHaveLength(1);
    expect(calls.filter((c) => c === "initVault")).toHaveLength(1);
    expect(calls.filter((c) => c === "hydrate")).toHaveLength(2);
  });

  it("retry after a TIMEOUT re-awaits the still-pending operation instead of starting a duplicate", async () => {
    let resolveVault!: () => void;
    let vaultStarts = 0;
    const { steps } = makeSteps({
      initVault: () => {
        vaultStarts++;
        return new Promise<void>((r) => (resolveVault = r));
      },
    });
    const s = createEssentialStartup(steps, { stageTimeoutMs: 100 });

    const first = s.run();
    const firstAssertion = expect(first).rejects.toMatchObject({ stage: "vault.init", timedOut: true });
    await vi.advanceTimersByTimeAsync(101);
    await firstAssertion;

    const second = s.run();          // retry
    resolveVault();                   // the original operation finishes late
    await expect(second).resolves.toMatchObject({ accountExists: true });
    expect(vaultStarts).toBe(1);      // never started twice
  });

  it("reset() forgets successes (used after the user resets the vault)", async () => {
    const { steps, calls } = makeSteps();
    const s = createEssentialStartup(steps);
    await s.run();
    s.reset();
    await s.run();
    expect(calls.filter((c) => c === "initVault")).toHaveLength(2);
  });

  it("reports stage events without leaking values", async () => {
    const { steps } = makeSteps();
    const events: string[] = [];
    await createEssentialStartup(steps, {
      onStage: (e) => events.push(`${e.stage}:${e.status}`),
    }).run();
    expect(events[0]).toBe("identity.init:start");
    expect(events).toContain("session.check:ok");
    expect(JSON.stringify(events)).not.toContain("me");
  });
});

describe("memoUntilFailure", () => {
  it("clears after rejection, keeps after success", async () => {
    let n = 0;
    const f = memoUntilFailure(async () => {
      n++;
      if (n === 1) throw new Error("x");
      return n;
    });
    await expect(f()).rejects.toThrow("x");
    await expect(f()).resolves.toBe(2);
    await expect(f()).resolves.toBe(2);
    expect(n).toBe(2);
  });
});

describe("runBackground (non-essential work)", () => {
  it("never throws and reports failures", async () => {
    const onError = vi.fn();
    await expect(
      runBackground("backup", async () => { throw new Error("no network"); }, { onError }),
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith("backup", expect.objectContaining({ message: "no network" }));
  });

  it("is time bounded", async () => {
    const onError = vi.fn();
    const p = runBackground("net", () => new Promise(() => {}), { timeoutMs: 50, onError });
    await vi.advanceTimersByTimeAsync(51);
    await p;
    expect(onError).toHaveBeenCalledWith("net", expect.objectContaining({ timedOut: true }));
  });
});

describe("toFailure", () => {
  it("handles unknown thrown values", () => {
    expect(toFailure("boom").message).toMatch(/unknown reason/);
    expect(toFailure(new StartupStageError("s", "m", true))).toEqual({ stage: "s", message: "m", timedOut: true });
  });
});
