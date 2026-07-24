import { useEffect } from 'react';
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

export function useSocketConnection(): { isConnected: boolean } {
  return useSocketContext();
}
