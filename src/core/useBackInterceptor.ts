import { useEffect, useRef } from "react";
import { registerBackInterceptor } from "./backHandling";

/**
 * While `active` is true, hardware Back is routed to `handler` instead of the
 * app-level policy, and the event is consumed.
 *
 * The latest `handler` is always called (kept in a ref), and the interceptor
 * is registered once per activation, so re-renders neither leak nor duplicate
 * subscriptions.
 */
export function useBackInterceptor(active: boolean, handler: () => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;
    return registerBackInterceptor(() => {
      handlerRef.current();
      return true;
    });
  }, [active]);
}
