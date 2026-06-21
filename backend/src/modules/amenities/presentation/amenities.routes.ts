import type { FastifyInstance } from 'fastify';
import { authMiddleware, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './amenities.controller.js';

export async function amenitiesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/amenities/:id', ctrl.getAmenityHandler);
  app.post('/amenities', { preHandler: [adminGuard] }, ctrl.createAmenityHandler);
  app.put('/amenities/:id', { preHandler: [adminGuard] }, ctrl.updateAmenityHandler);
  app.delete('/amenities/:id', { preHandler: [adminGuard] }, ctrl.deleteAmenityHandler);
}
