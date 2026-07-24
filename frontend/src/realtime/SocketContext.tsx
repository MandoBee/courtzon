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

const ctxLog = (msg: string, ...args: unknown[]) => {
  console.log(`[SocketCtx ${new Date().toISOString().slice(11, 23)}] ${msg}`, ...args);
};

/**
 * Socket lifecycle is fully driven by auth state:
 *
 *   App starts
 *     ↓
 *   isLoading=true  →  no socket
 *     ↓
 *   checkAuth() completes
 *     ↓
 *   isAuthenticated=false → no socket (guest)
 *   isAuthenticated=true  → createSocket() → connected
 *     ↓
 *   logout() → isAuthenticated=false → disconnectSocket()
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [isConnected, setIsConnected] = useState(false);
  const [state, setState] = useState<SocketState>(getSocketState());
  const handlersRef = useRef<Map<string, Set<(payload: any) => void>>>(new Map());

  // ── 1. React to auth state changes ──
  useEffect(() => {
    if (isLoading) {
      ctxLog('Auth loading — no socket');
      return;
    }

    if (!isAuthenticated) {
      ctxLog('Not authenticated — destroying socket');
      disconnectSocket();
      setIsConnected(false);
      setState('uninitialized');
      return;
    }

    // Authenticated and auth init complete → create socket
    ctxLog('Authenticated — creating socket');
    createSocket();
  }, [isAuthenticated, isLoading]);

  // ── 2. Subscribe to socket state changes ──
  useEffect(() => {
    const unsub = onSocketStateChange((s) => {
      setState(s);
      setIsConnected(s === 'connected');
    });
    return unsub;
  }, []);

  // ── 3. Re-register event handlers on socket recreation ──
  useEffect(() => {
    if (state !== 'connected' && state !== 'connecting') return;
    const s = getSocket();
    if (!s) return;

    // Flush queued handlers onto the live socket
    for (const [event, handlers] of handlersRef.current) {
      for (const handler of handlers) {
        s.off(event, handler);
        s.on(event, handler);
      }
    }
  }, [state]);

  // ── 4. Subscribe helper for child components ──
  const subscribe = useCallback((event: string, handler: (payload: any) => void) => {
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set());
    }
    handlersRef.current.get(event)!.add(handler);

    // If socket is live, attach immediately
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
