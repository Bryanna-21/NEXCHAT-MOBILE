import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __backInterceptorCount,
  __resetBackInterceptors,
  registerBackInterceptor,
  resolveBack,
  runBackInterceptors,
  type BackContext,
  type Screen,
  type Tab,
} from "../backHandling";

const ctx = (over: Partial<BackContext> = {}): BackContext => ({
  phase: "ready",
  locked: false,
  callActive: false,
  screen: { name: "home" },
  tab: "Chats",
  ...over,
});

describe("resolveBack: screen stack", () => {
  const cases: Array<[string, Screen, unknown]> = [
    ["chat -> home", { name: "chat", peerId: "p1" }, { name: "home" }],
    ["new message -> home", { name: "new" }, { name: "home" }],
    [
      "contact details -> the same conversation",
      { name: "contact", peerId: "p9" },
      { name: "chat", peerId: "p9" },
    ],
    ["settings -> home", { name: "settings" }, { name: "home" }],
    [
      "settings subsection -> settings",
      { name: "settingsSection", section: "privacy" },
      { name: "settings" },
    ],
    [
      "my posts -> profile settings section",
      { name: "myPosts" },
      { name: "settingsSection", section: "profile" },
    ],
  ];
  it.each(cases)("%s", (_n, screen, expected) => {
    expect(resolveBack(ctx({ screen }))).toEqual({
      kind: "screen",
      screen: expected,
    });
  });

  it("returns to home with the previously selected tab untouched", () => {
    // The policy only emits a screen change; tab state is not part of it.
    const a = resolveBack(ctx({ screen: { name: "chat", peerId: "p" }, tab: "Calls" }));
    expect(a).toEqual({ kind: "screen", screen: { name: "home" } });
  });
});

describe("resolveBack: tabs and root", () => {
  const nonHome: Tab[] = ["Stories", "Feed", "Calls", "Settings"];
  it.each(nonHome)("%s tab -> Chats tab, never terminates the app", (tab) => {
    expect(resolveBack(ctx({ tab }))).toEqual({ kind: "tab", tab: "Chats" });
  });

  it("root (home + Chats) lets Android perform its default action", () => {
    expect(resolveBack(ctx())).toEqual({ kind: "default", reason: "root" });
  });
});

describe("resolveBack: guards", () => {
  it("a call is never ended, declined or abandoned by Back", () => {
    for (const screen of [
      { name: "home" },
      { name: "chat", peerId: "p" },
      { name: "settings" },
    ] as Screen[]) {
      expect(resolveBack(ctx({ callActive: true, screen, tab: "Feed" }))).toEqual({
        kind: "consume",
        reason: "call-active",
      });
    }
  });

  it("does not navigate behind the lock screen", () => {
    expect(
      resolveBack(ctx({ locked: true, screen: { name: "chat", peerId: "p" } })),
    ).toEqual({ kind: "default", reason: "locked" });
  });

  it.each(["booting", "failed", "auth"] as const)(
    "defers to Android while phase is %s",
    (phase) => {
      expect(
        resolveBack(ctx({ phase, screen: { name: "chat", peerId: "p" } })),
      ).toEqual({ kind: "default", reason: "not-ready" });
    },
  );

  it("repeated Back presses from any depth terminate at root without cycling", () => {
    // Simulate pressing Back until the policy yields to Android.
    let screen: Screen = { name: "myPosts" };
    let tab: Tab = "Feed";
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const a = resolveBack(ctx({ screen, tab }));
      if (a.kind === "default") break;
      if (a.kind === "screen") screen = a.screen;
      if (a.kind === "tab") tab = a.tab;
      seen.push(a.kind === "screen" ? a.screen.name : a.kind);
    }
    expect(seen).toEqual(["settingsSection", "settings", "home", "tab"]);
    expect(resolveBack(ctx({ screen, tab })).kind).toBe("default");
  });
});

describe("back interceptors", () => {
  beforeEach(() => __resetBackInterceptors());

  it("runs topmost first and stops at the first that consumes", () => {
    const order: string[] = [];
    registerBackInterceptor(() => (order.push("outer"), true));
    registerBackInterceptor(() => (order.push("inner"), true));
    expect(runBackInterceptors()).toBe(true);
    expect(order).toEqual(["inner"]);
  });

  it("falls through when a handler declines", () => {
    const outer = vi.fn(() => true);
    registerBackInterceptor(outer);
    registerBackInterceptor(() => false);
    expect(runBackInterceptors()).toBe(true);
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it("returns false with nothing registered so the policy can decide", () => {
    expect(runBackInterceptors()).toBe(false);
  });

  it("unregister is idempotent and does not leak", () => {
    const off = registerBackInterceptor(() => true);
    expect(__backInterceptorCount()).toBe(1);
    off();
    off();
    expect(__backInterceptorCount()).toBe(0);
    expect(runBackInterceptors()).toBe(false);
  });

  it("a handler may unregister itself while running", () => {
    let off = () => {};
    off = registerBackInterceptor(() => {
      off();
      return true;
    });
    expect(runBackInterceptors()).toBe(true);
    expect(__backInterceptorCount()).toBe(0);
  });
});
