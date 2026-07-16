import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './scheduling.controller.js';

export async function schedulingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.post('/scheduling/search', ctrl.searchCoachHandler);
  app.get('/scheduling/coaches/:coachId/availability', ctrl.getCoachAvailabilityHandler);
  app.post('/scheduling/book', ctrl.bookSessionHandler);
}
