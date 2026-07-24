import type { Server as SocketIOServer } from 'socket.io';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { socketRoomManager } from '../application/socket-room-manager.js';
import { socketPublisher } from '../application/socket-publisher.js';
import { registry } from '../../../infrastructure/metrics/metrics.js';
import client from 'prom-client';

const log = createModuleLogger('socket-gateway');

const connectedClients = new client.Gauge({
  name: 'courtzon_socket_connected_clients',
  help: 'Number of currently connected socket.io clients',
  registers: [registry],
});

const activeRooms = new client.Gauge({
  name: 'courtzon_socket_active_rooms',
  help: 'Number of currently active socket.io rooms',
  registers: [registry],
});

const errorsTotal = new client.Counter({
  name: 'courtzon_socket_errors_total',
  help: 'Total number of socket errors',
  labelNames: ['type'] as const,
  registers: [registry],
});

export function attachSocketPublisher(io: SocketIOServer): void {
  // Room assignment middleware (relies on socket.data.userId from JWT auth)
  io.use(async (socket, next) => {
    const userId = socket.data?.userId;
    if (!userId) {
      errorsTotal.inc({ type: 'no_user_id' });
      return next(new Error('Authentication required'));
    }

    try {
      const rooms = await socketRoomManager.resolveRoomsForUser(userId);
      for (const room of rooms) {
        socket.join(room);
      }
      log.info({ userId, rooms: rooms.length }, 'socket.rooms_assigned');
      next();
    } catch (err) {
      errorsTotal.inc({ type: 'room_resolve_error' });
      log.error({ err, userId }, 'socket.room_resolve_failed');
      next(new Error('Failed to resolve rooms'));
    }
  });

  // Connection handlers
  io.on('connection', (socket) => {
    connectedClients.inc();
    const userId = socket.data?.userId;

    socket.on('disconnect', (reason) => {
      connectedClients.dec();
      log.debug({ userId, reason }, 'socket.disconnected');
    });

    socket.on('error', (err) => {
      errorsTotal.inc({ type: 'socket_error' });
      log.error({ err, userId }, 'socket.error');
    });
  });

  // Metrics poller for active rooms
  setInterval(() => {
    try {
      const roomSize = io.sockets.adapter.rooms?.size || 0;
      activeRooms.set(roomSize);
    } catch { /* ignore */ }
  }, 15000);

  // Attach publisher (subscribes to EventBusV2 and publishes to rooms)
  socketPublisher.setIO(io);
  socketPublisher.start();

  log.info('socket.publisher_attached');
}
