/**
 * Central Android Back-button policy for NexChat.
 *
 * Ownership model (exactly one owner per Back event):
 *   1. Native layers that consume Back themselves, before JS ever sees it:
 *      - the soft keyboard (Android hides it first),
 *      - React Native <Modal> (calls its own onRequestClose).
 *   2. Component-level interceptors (nested views that keep local state,
 *      e.g. an open group chat inside the Chats tab). Topmost wins.
 *   3. This policy (resolveBack), which decides app-level navigation.
 *
 * This file must stay free of react-native imports so it can be tested in
 * plain Node.
 */

export type Tab = "Chats" | "Stories" | "Feed" | "Calls" | "Settings";

export type Screen =
  | { name: "home" }
  | { name: "chat"; peerId: string }
  | { name: "new" }
  | { name: "contact"; peerId: string }
  | { name: "settings" }
  | { name: "settingsSection"; section: string }
  | { name: "myPosts" };

/** Where the app is in its lifecycle. Back is only app-managed when "ready". */
export type AppPhase = "booting" | "failed" | "auth" | "ready";

export type BackContext = {
  phase: AppPhase;
  /** Biometric lock screen is showing. */
  locked: boolean;
  /** An incoming/outgoing call is active (ringing, calling or connecting). */
  callActive: boolean;
  screen: Screen;
  tab: Tab;
};

export type BackAction =
  /** Swallow the event; nothing changes. */
  | { kind: "consume"; reason: "call-active" }
  | { kind: "screen"; screen: Screen }
  | { kind: "tab"; tab: Tab }
  /** Let Android do its default thing (move task to back / leave app). */
  | { kind: "default"; reason: "not-ready" | "locked" | "root" };

export const HOME_TAB: Tab = "Chats";

export function resolveBack(ctx: BackContext): BackAction {
  if (ctx.phase !== "ready") return { kind: "default", reason: "not-ready" };

  // Locked: leave the app in the background; it is re-locked on resume
  // anyway, and there is nothing to navigate behind the lock screen.
  if (ctx.locked) return { kind: "default", reason: "locked" };

  // A call is never ended, declined or abandoned by Back. The user must use
  // the explicit End/Decline controls on the call overlay.
  if (ctx.callActive) return { kind: "consume", reason: "call-active" };

  const { screen } = ctx;
  switch (screen.name) {
    case "contact":
      return { kind: "screen", screen: { name: "chat", peerId: screen.peerId } };
    case "settingsSection":
      return { kind: "screen", screen: { name: "settings" } };
    case "myPosts":
      return {
        kind: "screen",
        screen: { name: "settingsSection", section: "profile" },
      };
    case "chat":
    case "new":
    case "settings":
      return { kind: "screen", screen: { name: "home" } };
    case "home":
    default:
      if (ctx.tab !== HOME_TAB) return { kind: "tab", tab: HOME_TAB };
      return { kind: "default", reason: "root" };
  }
}

// ---------------------------------------------------------------------------
// Interceptor registry
// ---------------------------------------------------------------------------

type Interceptor = { id: number; handle: () => boolean };

let nextId = 1;
const stack: Interceptor[] = [];

/**
 * Register a handler that runs before the app-level policy. It returns true
 * if it consumed the event. Later registrations take priority (LIFO).
 * Returns an idempotent unregister function.
 */
export function registerBackInterceptor(handle: () => boolean): () => void {
  const entry: Interceptor = { id: nextId++, handle };
  stack.push(entry);
  return () => {
    const i = stack.findIndex((e) => e.id === entry.id);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Runs interceptors topmost-first. Returns true if one consumed the event. */
export function runBackInterceptors(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    // Copy the reference: a handler may unregister itself while running.
    const entry = stack[i];
    if (entry && entry.handle()) return true;
  }
  return false;
}

/** Test helper. */
export function __backInterceptorCount(): number {
  return stack.length;
}

/** Test helper. */
export function __resetBackInterceptors(): void {
  stack.length = 0;
}
