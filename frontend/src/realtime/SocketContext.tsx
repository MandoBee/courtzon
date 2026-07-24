import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import {
  getSocket,
  createSocket,
  disconnectSocket,
  getSocketState,
  onSocketStateChange,
  type SocketState,
} from './socket-client';
import { useAuthStore } from '../store/auth.store';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  state: SocketState;
  subscribe: (event: string, handler: (payload: any) => void) => () => void;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  state: 'uninitialized',
  subscribe: () => () => {},
});

export function useSocketContext(): SocketContextValue {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [isConnected, setIsConnected] = useState(false);
  const [state, setState] = useState<SocketState>(getSocketState());
  const handlersRef = useRef<Map<string, Set<(payload: any) => void>>>(new Map());

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      disconnectSocket();
      setIsConnected(false);
      setState('uninitialized');
      return;
    }

    createSocket();
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    const unsub = onSocketStateChange((s) => {
      setState(s);
      setIsConnected(s === 'connected');
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (state !== 'connected' && state !== 'connecting') return;
    const s = getSocket();
    if (!s) return;

    for (const [event, handlers] of handlersRef.current) {
      for (const handler of handlers) {
        s.off(event, handler);
        s.on(event, handler);
      }
    }
  }, [state]);

  const subscribe = useCallback((event: string, handler: (payload: any) => void) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set());
    }
    handlersRef.current.get(event)!.add(handler);

    const s = getSocket();
    if (s) {
      s.on(event, handler);
    }

    return () => {
      handlersRef.current.get(event)?.delete(handler);
      const live = getSocket();
      if (live) live.off(event, handler);
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket: getSocket(), isConnected, state, subscribe }}>
      {children}
    </SocketContext.Provider>
  );
}
