import { Server as SocketIOServer } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { setOnlineWithReconnect, setOffline } from '../modules/notifications/application/presence.service.js';
import { registerUserDevice } from '../modules/notifications/application/cross-device-sync.service.js';
import { userRoom, orgRoom, branchRoom, bookingRoom, matchRoom, conversationRoom, room, ADMIN_ROOM, PLAYER_ROOM } from '../modules/realtime/domain/realtime-rooms.js';
import { eventBusV2 } from '../shared/event-bus/event-bus.v2.js';
import { ALLOWED_ORIGINS } from '../app.js';
import { getPool } from '../database/mysql.js';
import { canAccessOrganisation, isPlatformAdmin } from '../shared/middleware/org-access.js';

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
      const rawCookie = socket.handshake.headers.cookie;
      const cookies = parseCookies(rawCookie || '');
      const tokenFromCookie = cookies['session_token'];
      const tokenFromAuth = socket.handshake.auth?.token;
      const token = tokenFromCookie || tokenFromAuth;

      if (!token) {
        slog(sid, 'REJECT: No session token');
        return next(new Error('Authentication required'));
      }

      const pool = getPool();
      const tokenHash = hashToken(token);

      const [sessions] = await pool.execute<any[]>(
        `SELECT id, user_id, expires_at, is_revoked
         FROM user_sessions
         WHERE session_token_hash = ?
         LIMIT 1`,
        [tokenHash],
      );

      if (sessions.length === 0) {
        slog(sid, 'REJECT: Authentication failed — no session found');
        return next(new Error('Authentication failed'));
      }

      const session = sessions[0];

      if (session.is_revoked) {
        slog(sid, 'REJECT: Session revoked');
        return next(new Error('Authentication failed'));
      }

      if (new Date(session.expires_at) <= new Date()) {
        slog(sid, 'REJECT: Session expired');
        return next(new Error('Authentication failed'));
      }

      const userId: number = session.user_id;
      socket.data.userId = userId;

      const [userRows] = await pool.execute<any[]>(
        'SELECT account_status, deleted_at FROM users WHERE id = ? LIMIT 1',
        [userId],
      );
      const account = userRows[0];
      if (!account || account.account_status !== 'active' || account.deleted_at) {
        slog(sid, 'REJECT: Account not active');
        return next(new Error('Authentication failed'));
      }

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
        `SELECT scope_id FROM user_role_scopes
         WHERE user_role_id IN (
           SELECT id FROM user_roles WHERE user_id = ? AND is_active = TRUE
         ) AND scope_type = 'organisation'
         LIMIT 1`,
        [userId],
      );

      socket.data.organisationId = orgs.length ? orgs[0].scope_id : null;

      slog(sid, `ACCEPT: userId=${userId} role=${socket.data.role} orgId=${socket.data.organisationId}`);
      next();
    } catch (err: any) {
      slog(sid, `EXCEPTION: ${err.code || err.errno || 'unknown'} ${err.message}`);
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
        const { registerDevice, savePushToken } = await import('../modules/notifications/application/device.service.js');
        await registerDevice(userId, deviceId, {
          deviceType: data?.platform || data?.deviceType,
          browser: data?.browser,
          os: data?.os,
          userAgent: data?.userAgent,
          ipAddress: socket.handshake.address,
        });
        if (data?.pushToken) {
          await savePushToken(userId, data.pushToken, data.platform || 'web');
        }
      } catch {}
    });

    socket.on('join:booking', async (id: number) => {
      if (id && (await canJoinRoom(socket, 'booking', Number(id)))) socket.join(bookingRoom(Number(id)));
    });
    socket.on('leave:booking', (id: number) => { socket.leave(bookingRoom(Number(id))); });
    socket.on('join:match', async (id: number) => {
      if (id && (await canJoinRoom(socket, 'match', Number(id)))) socket.join(matchRoom(Number(id)));
    });
    socket.on('leave:match', (id: number) => { socket.leave(matchRoom(Number(id))); });
    socket.on('join:conversation', async (id: number) => {
      if (id && (await canJoinRoom(socket, 'conversation', Number(id)))) socket.join(conversationRoom(Number(id)));
    });
    socket.on('leave:conversation', (id: number) => { socket.leave(conversationRoom(Number(id))); });
    socket.on('join:resource', async (id: number) => {
      if (id && (await canJoinRoom(socket, 'resource', Number(id)))) socket.join(room('resource', Number(id)));
    });
    socket.on('leave:resource', (id: number) => { if (id) socket.leave(room('resource', Number(id))); });

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

/**
 * Authorize a client-initiated room join. Fails CLOSED: a numeric id alone
 * never grants access. Each room's membership is resolved from authoritative
 * server data (never trusted from the client):
 *
 *   booking:      owner, organisation staff (canAccessOrganisation), platform admin
 *   resource:     any authenticated user may observe a valid resource's realtime
 *                 booking events — mirrors GET /resources/:id/slots (bookings.view
 *                 is granted to all authenticated players/staff)
 *   conversation: a conversation participant, or platform admin
 *   match:        the match's booking owner, an invited/join-requested user, or
 *                 platform admin
 *
 * Unauthorized joins are silently ignored (no event emitted, no existence
 * disclosure).
 */
export async function canJoinRoom(socket: any, roomKind: 'booking' | 'resource' | 'conversation' | 'match', id: number): Promise<boolean> {
  const pool = getPool();
  const userId: number = socket.data.userId;
  if (!userId || !id) return false;

  if (roomKind === 'booking') {
    const [rows] = await pool.execute<any[]>(
      'SELECT user_id, organisation_id FROM bookings WHERE id = ?', [id],
    );
    if (!rows.length) return false;
    const b = rows[0];
    if (Number(b.user_id) === userId) return true;
    return canAccessOrganisation(userId, b.organisation_id);
  }

  if (roomKind === 'resource') {
    // The resource must exist and be active; the observing user is already
    // authenticated (the same gate as the public availability API).
    const [rows] = await pool.execute<any[]>(
      'SELECT id FROM resources WHERE id = ? AND deleted_at IS NULL', [id],
    );
    return rows.length > 0;
  }

  if (roomKind === 'conversation') {
    const [rows] = await pool.execute<any[]>(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1', [id, userId],
    );
    if (rows.length) return true;
    return isPlatformAdmin(userId);
  }

  // match
  const [matchRows] = await pool.execute<any[]>(
    `SELECT m.id, b.user_id AS owner_id
     FROM matches m LEFT JOIN bookings b ON b.id = m.booking_id
     WHERE m.id = ?`, [id],
  );
  if (!matchRows.length) return false;
  if (Number(matchRows[0].owner_id) === userId) return true;
  const [inv] = await pool.execute<any[]>(
    'SELECT 1 FROM invitations WHERE match_id = ? AND user_id = ? LIMIT 1', [id, userId],
  );
  if (inv.length) return true;
  const [jr] = await pool.execute<any[]>(
    'SELECT 1 FROM join_requests WHERE match_id = ? AND user_id = ? LIMIT 1', [id, userId],
  );
  if (jr.length) return true;
  return isPlatformAdmin(userId);
}
