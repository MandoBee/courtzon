import { getSocket, onSocketStateChange, updateSocketToken } from '../realtime/socket-client';
import type { SocketState } from '../realtime/socket-client';

type EventHandler = (...args: any[]) => void;

/**
 * Facade over the single Socket.IO singleton in realtime/socket-client.ts.
 * Keeps the same public API (on / off / emit / connected) so
 * notification.store.ts, MatchListPage, and MatchLobbyPage keep working.
 *
 * IMPORTANT: There is only ONE WebSocket connection — managed by socket-client.ts.
 * The SocketService does NOT create or destroy the socket.
 * Socket lifecycle is driven by SocketProvider (auth state).
 *
 * Handlers registered via on() are queued and automatically flushed to the
 * live socket whenever it connects or is recreated.
 */
class SocketService {
  private listeners = new Map<string, Set<EventHandler>>();

  constructor() {
    // When socket state changes to connecting/connected, flush all queued handlers
    onSocketStateChange((state: SocketState) => {
      if (state === 'connecting' || state === 'connected') {
        this.flushHandlers();
      }
    });
  }

  get connected(): boolean {
    const s = getSocket();
    return !!s?.connected;
  }

  connect(_token?: string): void {
    // Socket lifecycle is managed by SocketProvider.
    // This method is kept for API compatibility but does nothing.
  }

  disconnect(): void {
    // Do NOT call disconnectSocket() — the singleton is managed by SocketProvider.
    // Just clean up our own handler registrations from the live socket.
    const s = getSocket();
    if (s) {
      for (const [event, handlers] of this.listeners) {
        for (const handler of handlers) {
          s.off(event, handler);
        }
      }
    }
  }

  updateToken(token: string): void {
    updateSocketToken(token);
  }

  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    // Attach to live socket if it exists right now
    const s = getSocket();
    if (s) {
      s.on(event, handler);
    }
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
    const s = getSocket();
    if (s) {
      s.off(event, handler);
    }
  }

  emit(event: string, ...args: any[]): void {
    const s = getSocket();
    if (s) {
      s.emit(event, ...args);
    }
  }

  /** Re-attach all queued handlers to the live socket. */
  private flushHandlers(): void {
    const s = getSocket();
    if (!s) return;
    for (const [event, handlers] of this.listeners) {
      for (const handler of handlers) {
        s.off(event, handler);
        s.on(event, handler);
      }
    }
  }
}

export const socketService = new SocketService();
