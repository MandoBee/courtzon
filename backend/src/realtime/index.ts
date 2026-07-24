import { Server as SocketIOServer } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { setOnlineWithReconnect, setOffline } from '../modules/notifications/application/presence.service.js';
import { registerUserDevice } from '../modules/notifications/application/cross-device-sync.service.js';
import { userRoom, orgRoom, branchRoom, ADMIN_ROOM, PLAYER_ROOM } from '../modules/realtime/domain/realtime-rooms.js';
import { eventBusV2 } from '../shared/event-bus/event-bus.v2.js';
import { ALLOWED_ORIGINS } from '../app.js';
import { getPool } from '../database/mysql.js';

let io: SocketIOServer | null = null;

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO not initialized. Call setupRealtime() first.');
  return io;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function slog(socketId: string, msg: string) {
  console.log(`[SocketAuth ${new Date().toISOString().slice(11, 23)}] [${socketId}] ${msg}`);
}

export function setupRealtime(app: FastifyInstance): SocketIOServer {
  const isDev = process.env.NODE_ENV === 'development';
  const isDockerLocal = process.env.DOCKER_ENV === 'true';

  io = new SocketIOServer(app.server, {
    cors: {
      origin: (origin, cb) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
        else if (isDev || isDockerLocal) cb(null, true);
        else cb(new Error('Not allowed by CORS'), false);
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    cookie: true,
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 120000,
      skipMiddlewares: false,
    },
  });

  io.use(async (socket, next) => {
    const sid = socket.id;
    try {
      // ── Step 1: raw cookie header ──
      const rawCookie = socket.handshake.headers.cookie;
      slog(sid, `Cookie header: ${rawCookie ? `present (${rawCookie.length} chars)` : 'MISSING / undefined'}`);

      if (rawCookie) {
        const cookieKeys = rawCookie.split(';').map(c => c.trim().split('=')[0].trim());
        slog(sid, `Cookie keys: [${cookieKeys.join(', ')}]`);
      }

      // ── Step 2: parse and extract session_token ──
      const cookies = parseCookies(rawCookie || '');
      const hasSessionCookie = 'session_token' in cookies;
      const tokenFromCookie = cookies['session_token'];
      const tokenFromAuth = socket.handshake.auth?.token;
      const token = tokenFromCookie || tokenFromAuth;

      slog(sid, `session_token in cookie jar: ${hasSessionCookie} | from auth handshake: ${!!tokenFromAuth} | resolved token: ${token ? `${token.length} chars (first8: ${token.slice(0, 8)})` : 'NONE'}`);

      // ── Step 3: no token → reject ──
      if (!token) {
        slog(sid, `REJECT: No session token. handshake.auth keys: [${Object.keys(socket.handshake.auth || {}).join(', ')}] | headers: [${Object.keys(socket.handshake.headers).join(', ')}]`);
        return next(new Error('Authentication required'));
      }

      // ── Step 4: hash and DB lookup ──
      const pool = getPool();
      const tokenHash = hashToken(token);
      slog(sid, `Token hash: ${tokenHash.slice(0, 16)}...`);

      const [sessions] = await pool.execute<any[]>(
        `SELECT id, user_id, session_token_hash, expires_at, is_revoked, created_at
         FROM user_sessions
         WHERE session_token_hash = ?
         LIMIT 5`,
        [tokenHash],
      );

      slog(sid, `DB lookup: ${sessions.length} row(s) found`);

      if (sessions.length === 0) {
        // Check if ANY session exists for debugging
        const [anySession] = await pool.execute<any[]>(
          `SELECT COUNT(*) as cnt FROM user_sessions WHERE session_token_hash = ?`,
          [tokenHash],
        );
        slog(sid, `REJECT: Authentication failed. Hash exists in DB at all: ${(anySession[0]?.cnt || 0) > 0}`);
        return next(new Error('Authentication failed'));
      }

      const session = sessions[0];
      slog(sid, `Session: userId=${session.user_id} revoked=${session.is_revoked} expires=${session.expires_at} created=${session.created_at}`);

      if (session.is_revoked) {
        slog(sid, `REJECT: Session is revoked`);
        return next(new Error('Authentication failed'));
      }

      const now = new Date();
      const expiresAt = new Date(session.expires_at);
      if (expiresAt <= now) {
        slog(sid, `REJECT: Session expired (${expiresAt.toISOString()} <= ${now.toISOString()})`);
        return next(new Error('Authentication failed'));
      }

      // ── Step 5: success ──
      const userId: number = session.user_id;
      socket.data.userId = userId;

      const [roles] = await pool.execute<any[]>(
        `SELECT DISTINCT r.slug FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ? AND ur.is_active = TRUE
           AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
           AND r.deleted_at IS NULL`,
        [userId],
      );

      socket.data.role = roles.length ? roles[0].slug : null;

      const [orgs] = await pool.execute<any[]>(
        `SELECT organisation_id FROM user_role_scopes
         WHERE user_role_id IN (
           SELECT id FROM user_roles WHERE user_id = ? AND is_active = TRUE
         ) AND scope_type = 'organisation'
         LIMIT 1`,
        [userId],
      );

      socket.data.organisationId = orgs.length ? orgs[0].organisation_id : null;

      slog(sid, `ACCEPT: userId=${userId} role=${socket.data.role} orgId=${socket.data.organisationId}`);
      next();
    } catch (err: any) {
      slog(sid, `EXCEPTION: ${err.message}`);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    const userId: number = socket.data.userId;
    const role: string | null = socket.data.role;
    const orgId: number | null = socket.data.organisationId;
    const deviceId: string = (socket.handshake.query.deviceId as string) || socket.id;

    socket.join(userRoom(userId));
    if (role) {
      socket.join(`role:${role}`);
      if (['super_admin', 'admin'].includes(role)) socket.join(ADMIN_ROOM);
    }
    if (orgId) socket.join(orgRoom(orgId));
    socket.join(PLAYER_ROOM);

    socket.on('device:register', async (data) => {
      try {
        const { registerDevice } = await import('../modules/notifications/application/device.service.js');
        await registerDevice(userId, deviceId, data || {});
      } catch {}
    });

    socket.on('join:booking', (id: number) => { socket.join(`booking:${id}`); });
    socket.on('leave:booking', (id: number) => { socket.leave(`booking:${id}`); });
    socket.on('join:match', (id: number) => { socket.join(`match:${id}`); });
    socket.on('leave:match', (id: number) => { socket.leave(`match:${id}`); });
    socket.on('join:conversation', (id: number) => { socket.join(`conversation:${id}`); });
    socket.on('leave:conversation', (id: number) => { socket.leave(`conversation:${id}`); });

    socket.on('notification:read', async (data) => {
      if (!data?.notificationId) return;
      try {
        const { syncNotificationRead } = await import('../modules/notifications/application/cross-device-sync.service.js');
        await syncNotificationRead(userId, data.notificationId, deviceId);
      } catch {}
    });

    socket.on('notification:delete', async (data) => {
      if (!data?.notificationId) return;
      try {
        const { syncNotificationDeleted } = await import('../modules/notifications/application/cross-device-sync.service.js');
        await syncNotificationDeleted(userId, data.notificationId, deviceId);
      } catch {}
    });

    socket.on('disconnect', () => {
      setOffline(userId).catch(() => {});
      eventBusV2.emit('presence:offline', { userId } as Record<string, unknown>, {
        aggregateType: 'presence', aggregateId: String(userId), aggregateVersion: 1,
      });
    });

    setOnlineWithReconnect(userId).then((ids) => {
      if (ids.length) socket.emit('notification:reconnect-queue', { ids });
    }).catch(() => {});

    registerUserDevice(userId, deviceId).catch(() => {});
    eventBusV2.emit('presence:online', { userId } as Record<string, unknown>, {
      aggregateType: 'presence', aggregateId: String(userId), aggregateVersion: 1,
    });
  });

  return io;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, ...val] = cookie.trim().split('=');
    if (key) acc[key.trim()] = val.join('=').trim();
    return acc;
  }, {} as Record<string, string>);
}
