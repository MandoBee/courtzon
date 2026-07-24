import { io, Socket } from 'socket.io-client';

/**
 * Resolve the Socket.IO connection URL.
 *
 * - Local dev: VITE_API_URL is set (e.g. http://localhost:3000) → connect directly to backend.
 * - Docker / production: VITE_API_URL is NOT set → empty string means same-origin,
 *   and Nginx proxies /socket.io/ to the backend container.
 */
function resolveSocketUrl(): string {
  const url = import.meta.env.VITE_API_URL;
  if (typeof url === 'string' && url.length > 0) return url;
  return '';
}

const SOCKET_URL = resolveSocketUrl();

const log = (msg: string, ...args: unknown[]) => {
  console.log(`[Socket ${new Date().toISOString().slice(11, 23)}] ${msg}`, ...args);
};

let socket: Socket | null = null;

export function getSocket(token?: string): Socket {
  if (!socket) {
    log('Creating socket. url=%s hasToken=%s', SOCKET_URL, !!token);
    socket = io(SOCKET_URL, {
      auth: token ? { token } : undefined,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      timeout: 20000,
    });

    socket.on('connect', () => {
      const transport = (socket?.io.engine as any)?.transport?.name || 'unknown';
      log('Connected id=%s transport=%s', socket?.id, transport);
    });
    socket.on('disconnect', (reason) => {
      log('Disconnected reason=%s', reason);
    });
    socket.on('connect_error', (err) => {
      log('Connect error message=%s', err.message);
    });
    socket.io.on('reconnect_attempt', (attempt) => {
      log('Reconnect attempt #%d', attempt);
    });
    socket.io.on('reconnect', (attempt) => {
      log('Reconnected after %d attempts', attempt);
    });
    socket.io.on('reconnect_failed', () => {
      log('Reconnect failed — no more attempts');
    });
  } else if (token) {
    socket.auth = { token };
  }
  return socket;
}

export function updateSocketToken(token: string): void {
  if (socket) {
    socket.auth = { token };
  }
}

export function disconnectSocket(): void {
  if (socket) {
    log('Disconnecting (destroying singleton)');
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
