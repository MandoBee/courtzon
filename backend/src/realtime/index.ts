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
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie || '');
      const token = cookies['session_token'] || socket.handshake.auth?.token;

      if (!token) return next(new Error('Authentication required'));

      const pool = getPool();
      const tokenHash = hashToken(token);

      const [sessions] = await pool.execute<any[]>(
        `SELECT user_id FROM user_sessions
         WHERE session_token_hash = ? AND is_revoked = FALSE AND expires_at > NOW()
         LIMIT 1`,
        [tokenHash],
      );

      if (!sessions.length) return next(new Error('Authentication failed'));

      const userId: number = sessions[0].user_id;
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

      next();
    } catch (err: any) {
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
