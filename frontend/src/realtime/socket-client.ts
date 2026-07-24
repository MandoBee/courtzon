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

let socket: Socket | null = null;

export function getSocket(token?: string): Socket {
  if (!socket) {
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
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
