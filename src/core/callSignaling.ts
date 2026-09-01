export type SignalType =
  | "offer"
  | "answer"
  | "ice-candidate"
  | "ring"
  | "accept"
  | "reject"
  | "hangup";

export interface CallSignal {
  id: string;
  callId: string;
  senderId: string;
  recipientId: string;
  type: SignalType;
  payload?: string;
  createdAt: string;
}

export interface CallSignalTransport {
  send(signal: CallSignal): Promise<void>;
  close(): Promise<void>;
}

export function createCallSignal(
  callId: string,
  senderId: string,
  recipientId: string,
  type: SignalType,
  payload?: string,
): CallSignal {
  return {
    id:
      `signal-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    callId,
    senderId,
    recipientId,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
}
