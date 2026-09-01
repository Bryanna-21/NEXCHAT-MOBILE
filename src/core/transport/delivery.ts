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
  sending: ["sent", "delivered", "queued", "failed"],
  sent: ["delivered", "read", "failed"],
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

export function tryTransition(
  from: DeliveryState,
  to: DeliveryState,
): DeliveryState {
  return canTransition(from, to)
    ? to
    : from;
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

export function normalizeDeliveryState(
  state: DeliveryState,
): DeliveryState {
  if (state === "created") {
    return "queued";
  }

  return state;
}

export function isSendComplete(
  state: DeliveryState,
): boolean {
  return (
    state === "sent" ||
    state === "delivered" ||
    state === "read"
  );
}

export function isTerminal(
  state: DeliveryState,
): boolean {
  return state === "read";
}

export function messageStatusFromDelivery(
  state: DeliveryState,
): "sending" | "sent" | "delivered" | "failed" {
  switch (state) {
    case "sent":
      return "sent";

    case "delivered":
      return "delivered";

    case "failed":
      return "failed";

    case "created":
    case "queued":
    case "sending":
    case "read":
    default:
      return "sending";
  }
}
