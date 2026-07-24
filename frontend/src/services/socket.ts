import { getSocket, disconnectSocket, updateSocketToken } from '../realtime/socket-client';

type EventHandler = (...args: any[]) => void;

/**
 * Facade over the single Socket.IO singleton in realtime/socket-client.ts.
 * Keeps the same public API (on / off / emit / connect / disconnect / connected)
 * so notification.store.ts, MatchListPage, and MatchLobbyPage keep working.
 *
 * IMPORTANT: There is only ONE WebSocket connection — managed by socket-client.ts.
 */
class SocketService {
  private listeners = new Map<string, Set<EventHandler>>();
  private _boundConnectHandler: (() => void) | null = null;
  private _boundDisconnectHandler: (() => void) | null = null;
  private _boundErrorHandler: (() => void) | null = null;

  get connected(): boolean {
    const s = getSocket();
    return s.connected;
  }

  connect(token?: string): void {
    const s = getSocket(token);
    if (s.connected) return;

    if (!this._boundConnectHandler) {
      this._boundConnectHandler = () => {
        this.emitLocal('connect');
      };
      this._boundDisconnectHandler = () => {
        this.emitLocal('disconnect');
      };
      this._boundErrorHandler = () => {};

      s.on('connect', this._boundConnectHandler);
      s.on('disconnect', this._boundDisconnectHandler);
      s.on('connect_error', this._boundErrorHandler);
    }

    if (!s.connected && !s.active) {
      s.connect();
    }

    for (const [event, handlers] of this.listeners) {
      for (const handler of handlers) {
        s.off(event, handler);
        s.on(event, handler);
      }
    }
  }

  disconnect(): void {
    disconnectSocket();
    this._boundConnectHandler = null;
    this._boundDisconnectHandler = null;
    this._boundErrorHandler = null;
  }

  updateToken(token: string): void {
    updateSocketToken(token);
  }

  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    try {
      const s = getSocket();
      s.on(event, handler);
    } catch {}
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler);
    try {
      const s = getSocket();
      s.off(event, handler);
    } catch {}
  }

  emit(event: string, ...args: any[]): void {
    try {
      const s = getSocket();
      s.emit(event, ...args);
    } catch {}
  }

  private emitLocal(event: string, ...args: any[]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(...args);
      }
    }
  }
}

export const socketService = new SocketService();
