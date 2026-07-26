import { getPool } from '../../../database/mysql.js';
import { getRedisClient } from '../../../infrastructure/redis/redis.client.js';
import { getHealth, healthDatabase, healthRedis, healthStorage } from '../../../infrastructure/health/health.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { freemem, totalmem, uptime as osUptime } from 'node:os';

const log = createModuleLogger('admin-health');

export class HealthService {
  async getSystemHealth(): Promise<{
    status: string;
    uptime: number;
    processUptime: number;
    timestamp: string;
    database: Record<string, unknown>;
    redis: Record<string, unknown>;
    memory: Record<string, unknown>;
    storage: Record<string, unknown>;
    socket: Record<string, unknown>;
    queue: Record<string, unknown>;
  }> {
    const [composite, db, r, storage] = await Promise.all([
      getHealth(),
      healthDatabase(),
      healthRedis(),
      healthStorage(),
    ]);

    let socketStatus: Record<string, unknown> = { status: 'unknown' };
    try {
      const { getIO } = await import('../../../realtime/index.js');
      const io = getIO();
      const sockets = await io.fetchSockets();
      socketStatus = { status: 'ok', connected: sockets.length };
    } catch {
      socketStatus = { status: 'down', message: 'Socket.IO not initialized' };
    }

    let queueStatus: Record<string, unknown> = { status: 'unknown' };
    try {
      const { queueService } = await import('../../../infrastructure/queue/queue.service.js');
      const defaultQueue = queueService.getQueue('default');
      const notifQueue = queueService.getQueue('notifications');
      const [defaultCounts, notifCounts] = await Promise.all([
        defaultQueue.getJobCounts(),
        notifQueue.getJobCounts(),
      ]);
      queueStatus = { status: 'ok', default: defaultCounts, notifications: notifCounts };
    } catch (err: any) {
      queueStatus = { status: 'down', error: err.message };
    }

    const free = freemem();
    const total = totalmem();

    return {
      status: composite.status,
      uptime: Math.floor(osUptime()),
      processUptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: db,
      redis: r,
      memory: {
        status: composite.checks.memory.status,
        usagePercent: Math.round(((total - free) / total) * 10000) / 100,
        freeMb: Math.round(free / 1024 / 1024),
        totalMb: Math.round(total / 1024 / 1024),
      },
      storage,
      socket: socketStatus,
      queue: queueStatus,
    };
  }
}

export const healthService = new HealthService();
