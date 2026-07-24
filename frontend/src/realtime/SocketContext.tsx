import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket } from './socket-client';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  lastEvent: { type: string; payload: Record<string, unknown> } | null;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  lastEvent: null,
});

export function useSocketContext(): SocketContextValue {
  return useContext(SocketContext);
}

export function SocketProvider({ children, token }: { children: React.ReactNode; token?: string }) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<{ type: string; payload: Record<string, unknown> } | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const s = getSocket(token);
    socketRef.current = s;

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    const onConnectError = () => setIsConnected(false);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);

    if (s.connected) setIsConnected(true);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onConnectError);
    };
  }, [token]);

  useEffect(() => {
    const s = socketRef.current;
    if (!s) return;

    const handler = (event: string) => (payload: Record<string, unknown>) => {
      setLastEvent({ type: event, payload });
    };

    const events = [
      'booking.created', 'booking.confirmed', 'booking.cancelled', 'booking.expired',
      'booking.completed', 'payment.completed', 'payment.failed',
      'wallet.deposited', 'wallet.withdrawn',
      'marketplace.order-placed', 'marketplace.order-confirmed',
      'notification.new', 'settlement.completed',
      'organisation.updated', 'academy.enrolled', 'attendance.updated',
      'membership.renewed',
    ];

    const handlers = events.map((e) => {
      const h = handler(e);
      s.on(e, h);
      return [e, h] as const;
    });

    return () => {
      for (const [e, h] of handlers) s.off(e, h);
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected, lastEvent }}>
      {children}
    </SocketContext.Provider>
  );
}
