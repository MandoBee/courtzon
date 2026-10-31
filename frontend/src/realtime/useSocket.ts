import { useEffect, useRef } from 'react';
import { useSocketContext } from './SocketContext';

export function useSocketEvent(
  eventType: string,
  handler: (payload: any) => void,
  deps: unknown[] = [],
): void {
  const { subscribe } = useSocketContext();

  useEffect(() => {
    const unsub = subscribe(eventType, handler);
    return unsub;
  }, [eventType, subscribe, ...deps]);
}

/**
 * Subscribe one handler to a fixed list of socket events.
 *
 * React forbids calling a hook inside a loop, so the cache-update layer must not
 * do `for (const ev of events) useSocketEvent(ev, …)`. This hook performs the
 * loop **inside a single effect** and keeps the handler in a ref so the
 * subscription is created once per event list (no resubscribe churn, no stale
 * closure) instead of once per event.
 *
 * `eventTypes` must be a stable reference (module-level constant) so the effect
 * only re-runs when the list itself changes.
 */
export function useSocketEvents(
  eventTypes: readonly string[],
  handler: (eventType: string, payload: any) => void,
): void {
  const { subscribe } = useSocketContext();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const unsubscribers = eventTypes.map((eventType) =>
      subscribe(eventType, (payload: any) => handlerRef.current(eventType, payload)),
    );
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [eventTypes, subscribe]);
}

export function useSocketConnection(): { isConnected: boolean } {
  return useSocketContext();
}
