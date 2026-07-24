import { io, Socket } from 'socket.io-client';

/**
 * Socket lifecycle state machine.
 *
 *   UNINITIALIZED ──auth ready──▸ CONNECTING ──connected──▸ CONNECTED
 *         │                          │                        │
 *         │                          │ server rejects         │ network/server lost
 *         │                          ▼                        ▼
 *         │                      AUTH_FAILED            RECONNECTING
 *         │                                                  │
 *         │                          ◂── reconnected ────────┘
 *         │                          │
 *         │                     auth failed → AUTH_FAILED (no reconnect)
 *         │
 *   logout / auth lost ──▸ UNINITIALIZED
 */
export type SocketState =
  | 'uninitialized'   // no socket, auth not ready or logged out
  | 'connecting'      // socket created, handshake in progress
  | 'connected'       // authenticated and connected
  | 'disconnected'    // was connected, transport lost (will reconnect)
  | 'auth_failed'     // server rejected authentication (permanent, no reconnect)
  | 'reconnecting';   // attempting to reconnect after network/server issue

// ── helpers ──────────────────────────────────────────────────────────

function resolveSocketUrl(): string {
  const url = import.meta.env.VITE_API_URL;
  if (typeof url === 'string' && url.length > 0) return url;
  return '';
}

const SOCKET_URL = resolveSocketUrl();

const log = (msg: string, ...args: unknown[]) => {
  console.log(`[Socket ${new Date().toISOString().slice(11, 23)}] ${msg}`, ...args);
};

// ── singleton state ──────────────────────────────────────────────────

let socket: Socket | null = null;
let currentState: SocketState = 'uninitialized';
const stateListeners = new Set<(s: SocketState) => void>();

function setState(next: SocketState) {
  if (currentState === next) return;
  const prev = currentState;
  currentState = next;
  log('%s → %s', prev, next);
  stateListeners.forEach((fn) => fn(next));
}

// ── public API ───────────────────────────────────────────────────────

export function getSocketState(): SocketState {
  return currentState;
}

export function onSocketStateChange(fn: (s: SocketState) => void): () => void {
  stateListeners.add(fn);
  return () => stateListeners.delete(fn);
}

/** Returns the live socket or null. Never creates one. */
export function getSocket(): Socket | null {
  return socket;
}

export function updateSocketToken(_token: string): void {
  // Cookie-based auth: the session_token cookie is sent automatically.
  // This function is kept for API compatibility but is a no-op.
}

/**
 * Create and connect the socket. Only call this after auth is confirmed.
 * If a socket already exists in a good state, this is a no-op.
 * If a previous socket failed auth, it is destroyed and recreated.
 */
export function createSocket(): Socket {
  if (socket) {
    if (currentState === 'connected' || currentState === 'connecting' || currentState === 'reconnecting') {
      return socket;
    }
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  socket = io(SOCKET_URL, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    timeout: 20000,
  });

  setState('connecting');

  socket.on('connect', () => {
    const transport = (socket?.io.engine as any)?.transport?.name || 'unknown';
    log('Connected id=%s transport=%s', socket?.id, transport);
    setState('connected');
  });

  socket.on('disconnect', (reason) => {
    log('Disconnected reason=%s', reason);
    if (reason === 'io server disconnect') {
      setState('disconnected');
      return;
    }
    setState('reconnecting');
  });

  socket.on('connect_error', (err) => {
    const msg = err.message || '';
    log('connect_error message=%s', msg);

    const isAuthError =
      msg.includes('Authentication') ||
      msg.includes('Invalid token');

    if (isAuthError) {
      setState('auth_failed');
      socket?.disconnect();
      return;
    }

    if (currentState !== 'reconnecting') {
      setState('reconnecting');
    }
  });

  socket.io.on('reconnect_attempt', (attempt) => {
    log('Reconnect attempt #%d', attempt);
    if (currentState !== 'auth_failed') {
      setState('reconnecting');
    }
  });

  socket.io.on('reconnect', (attempt) => {
    log('Reconnected after %d attempts', attempt);
    setState('connected');
  });

  socket.io.on('reconnect_failed', () => {
    log('Reconnect failed — all attempts exhausted');
    setState('disconnected');
  });

  socket.connect();

  return socket;
}

/**
 * Gracefully disconnect and destroy the socket.
 * Called on logout or when auth is lost.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  setState('uninitialized');
}
