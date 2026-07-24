import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../../shared/middleware/auth.middleware.js';
import { getSocketStatsHandler } from './realtime.controller.js';

export async function realtimeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  app.get('/admin/realtime/stats', getSocketStatsHandler);
}
