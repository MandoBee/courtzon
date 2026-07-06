import { Server as SocketIOServer } from 'socket.io';
import type { FastifyInstance } from 'fastify';

let io: SocketIOServer | null = null;

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO not initialized. Call setupRealtime() first.');
  return io;
}

export function setupRealtime(app: FastifyInstance): SocketIOServer {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') ?? [];
  const isDev = process.env.NODE_ENV === 'development';
  const isDockerLocal = process.env.DOCKER_ENV === 'true';

  io = new SocketIOServer(app.server, {
    cors: {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) cb(null, true);
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
  });

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie || '');
      const token = cookies['auth_token'] || socket.handshake.auth?.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const jwt = await import('jsonwebtoken');
      const secret = process.env.JWT_SECRET || 'fallback-secret';
      const decoded = jwt.default.verify(token, secret) as any;

      if (!decoded || !decoded.id) {
        return next(new Error('Invalid token'));
      }

      socket.data.userId = decoded.id;
      socket.data.role = decoded.role || null;
      socket.data.organisationId = decoded.organisationId || null;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const role = socket.data.role;
    const orgId = socket.data.organisationId;

    socket.join(`user:${userId}`);
    if (role) socket.join(`role:${role}`);
    if (orgId) socket.join(`org:${orgId}`);

    socket.on('disconnect', () => { });
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
