export type CallType = "voice" | "video";
export type CallStatus =
  | "idle"
  | "calling"
  | "ringing"
  | "connecting"
  | "connected"
  | "ended"
  | "failed";

export interface CallSession {
  id: string;
  peerId: string;
  type: CallType;
  status: CallStatus;
  startedAt: string;
  connectedAt?: string;
  endedAt?: string;
  error?: string;
}

export interface CallTransport {
  start(session: CallSession): Promise<CallSession>;
  accept(session: CallSession): Promise<CallSession>;
  hangup(session: CallSession): Promise<CallSession>;
}

/**
 * Development transport.
 *
 * IMPORTANT:
 * This transport never claims that a real network call is connected.
 * Actual WebRTC transport must implement this interface in the native build.
 */
export class DevelopmentCallTransport implements CallTransport {
  async start(session: CallSession): Promise<CallSession> {
    return {
      ...session,
      status: "calling",
    };
  }

  async accept(session: CallSession): Promise<CallSession> {
    return {
      ...session,
      status: "connecting",
    };
  }

  async hangup(session: CallSession): Promise<CallSession> {
    return {
      ...session,
      status: "ended",
      endedAt: new Date().toISOString(),
    };
  }
}

let activeCall: CallSession | null = null;

export function createCallSession(
  peerId: string,
  type: CallType,
): CallSession {
  return {
    id: `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    peerId,
    type,
    status: "idle",
    startedAt: new Date().toISOString(),
  };
}

export function getActiveCall(): CallSession | null {
  return activeCall;
}

export async function startCall(
  peerId: string,
  type: CallType,
): Promise<CallSession> {
  if (activeCall && activeCall.status !== "ended") {
    throw new Error("Another call is already active.");
  }

  const session = createCallSession(peerId, type);
  const transport = new DevelopmentCallTransport();

  activeCall = await transport.start(session);
  return activeCall;
}

export async function endCall(): Promise<CallSession | null> {
  if (!activeCall) return null;

  const transport = new DevelopmentCallTransport();
  activeCall = await transport.hangup(activeCall);

  const ended = activeCall;
  activeCall = null;

  return ended;
}
