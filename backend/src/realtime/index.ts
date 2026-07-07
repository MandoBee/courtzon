import { Server as SocketIOServer } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { setOnlineWithReconnect, setOffline } from '../modules/notifications/application/presence.service.js';
import { registerUserDevice } from '../modules/notifications/application/cross-device-sync.service.js';
import { setupSocketGateway, userRoom, orgRoom, branchRoom, ADMIN_ROOM, PLAYER_ROOM, getSocketMetrics } from './socket-gateway.js';
import { ALLOWED_ORIGINS } from '../app.js';

let io: SocketIOServer | null = null;

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO not initialized. Call setupRealtime() first.');
  return io;
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

      const jwt = await import('jsonwebtoken');
      const secret = process.env.JWT_SECRET || 'fallback-secret';
      const decoded = jwt.default.verify(token, secret) as any;

      if (!decoded?.id) return next(new Error('Invalid token'));

      socket.data.userId = decoded.id;
      socket.data.role = decoded.role || null;
      socket.data.organisationId = decoded.organisationId || null;
      next();
    } catch {
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
      io?.to(PLAYER_ROOM).emit('presence:offline', { userId });
    });

    setOnlineWithReconnect(userId).then((ids) => {
      if (ids.length) socket.emit('notification:reconnect-queue', { ids });
    }).catch(() => {});

    registerUserDevice(userId, deviceId).catch(() => {});
    io?.to(PLAYER_ROOM).emit('presence:online', { userId });
  });

  setupSocketGateway(io);
  return io;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, ...val] = cookie.trim().split('=');
    if (key) acc[key.trim()] = val.join('=').trim();
    return acc;
  }, {} as Record<string, string>);
}
