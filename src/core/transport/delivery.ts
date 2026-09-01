export type DeliveryState =
  | "created"
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

const transitions: Record<
  DeliveryState,
  DeliveryState[]
> = {
  created: ["queued", "sending", "failed"],
  queued: ["sending", "failed"],
  sending: ["sent", "queued", "failed"],
  sent: ["delivered", "failed"],
  delivered: ["read"],
  read: [],
  failed: ["queued", "sending"],
};

export function canTransition(
  from: DeliveryState,
  to: DeliveryState,
): boolean {
  return transitions[from].includes(to);
}

export function transition(
  from: DeliveryState,
  to: DeliveryState,
): DeliveryState {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid message state transition: ${from} -> ${to}`,
    );
  }

  return to;
}

export function isTerminal(
  state: DeliveryState,
): boolean {
  return state === "read" || state === "failed";
}
