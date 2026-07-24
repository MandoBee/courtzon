import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket } from './socket-client';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  subscribe: (event: string, handler: (payload: any) => void) => () => void;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  subscribe: () => () => {},
});

export function useSocketContext(): SocketContextValue {
  return useContext(SocketContext);
}

export function SocketProvider({ children, token }: { children: React.ReactNode; token?: string }) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef<Map<string, Set<(payload: any) => void>>>(new Map());

  useEffect(() => {
    const s = getSocket(token);
    socketRef.current = s;

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    const onConnectError = () => setIsConnected(false);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);

    // Global event dispatcher
    const globalHandler = (event: string) => (payload: any) => {
      const handlers = handlersRef.current.get(event);
      if (handlers) {
        handlers.forEach((h) => h(payload));
      }
    };

    const knownEvents = [
      'booking.created', 'booking.confirmed', 'booking.cancelled',
      'booking.expired', 'booking.completed', 'booking.checked_in',
      'payment.completed', 'payment.failed', 'payment.expired',
      'wallet.deposited', 'wallet.withdrawn', 'wallet.low_balance',
      'marketplace.order-placed', 'marketplace.order-confirmed',
      'marketplace.order-shipped', 'marketplace.order-delivered',
      'marketplace.order-cancelled', 'marketplace.order-refunded',
      'notification.new', 'notification.unread-count',
      'notification.sync-read', 'notification.sync-deleted',
      'match.available', 'match.removed', 'match.updated', 'match.pending',
      'settlement.completed', 'settlement.failed',
      'organisation.approved', 'organisation.rejected',
      'organisation.subscription-renewed', 'organisation.subscription-expired',
      'academy.enrolled', 'academy.graduated', 'academy.session-reminder',
      'coaching.session-scheduled', 'coaching.session-cancelled',
      'attendance.updated',
      'membership.renewed', 'membership.expired', 'membership.expiring',
      'presence.online', 'presence.offline',
    ];

    const cleanup: Array<() => void> = knownEvents.map((event) => {
      const h = globalHandler(event);
      s.on(event, h);
      return () => s.off(event, h);
    });

    if (s.connected) setIsConnected(true);

    return () => {
      cleanup.forEach((c) => c());
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onConnectError);
    };
  }, [token]);

  const subscribe = useCallback((event: string, handler: (payload: any) => void) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set());
    }
    handlersRef.current.get(event)!.add(handler);
    return () => {
      handlersRef.current.get(event)?.delete(handler);
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected, subscribe }}>
      {children}
    </SocketContext.Provider>
  );
}
