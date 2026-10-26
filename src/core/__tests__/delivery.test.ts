import { describe, expect, it } from "vitest";
import {
  canTransition,
  transition,
  tryTransition,
  isSendComplete,
  isTerminal,
} from "../transport/delivery";

describe("message read-receipt delivery transitions", () => {
  it("allows a sent message to become read", () => {
    expect(canTransition("sent", "read")).toBe(true);
    expect(transition("sent", "read")).toBe("read");
    expect(tryTransition("sent", "read")).toBe("read");
  });

  it("allows a delivered message to become read", () => {
    expect(canTransition("delivered", "read")).toBe(true);
    expect(transition("delivered", "read")).toBe("read");
    expect(tryTransition("delivered", "read")).toBe("read");
  });

  it("does not transition a read message backwards", () => {
    expect(canTransition("read", "sent")).toBe(false);
    expect(tryTransition("read", "sent")).toBe("read");
    expect(() => transition("read", "sent")).toThrow(
      "Invalid message state transition: read -> sent",
    );
  });

  it("recognizes sent, delivered, and read as send-complete states", () => {
    expect(isSendComplete("sent")).toBe(true);
    expect(isSendComplete("delivered")).toBe(true);
    expect(isSendComplete("read")).toBe(true);
    expect(isSendComplete("sending")).toBe(false);
  });

  it("treats read as terminal", () => {
    expect(isTerminal("read")).toBe(true);
    expect(isTerminal("delivered")).toBe(false);
  });
});
