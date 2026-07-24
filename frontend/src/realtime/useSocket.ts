import { useEffect, useCallback } from 'react';
import { useSocketContext } from './SocketContext';

export function useSocketEvent(
  eventType: string,
  handler: (payload: Record<string, unknown>) => void,
  deps: unknown[] = [],
): void {
  const { lastEvent } = useSocketContext();

  const stableHandler = useCallback(handler, deps);

  useEffect(() => {
    if (lastEvent?.type === eventType && lastEvent.payload) {
      stableHandler(lastEvent.payload);
    }
  }, [lastEvent, eventType, stableHandler]);
}

export function useSocketConnection(): { isConnected: boolean } {
  return useSocketContext();
}
