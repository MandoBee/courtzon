import type { FastifyInstance } from 'fastify';
import { authMiddleware, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './admin-tag.controller.js';

export async function adminTagRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/admin/tags', ctrl.listTagsHandler);
  app.get('/admin/tags/:id', ctrl.getTagHandler);
  app.post('/admin/tags', { preHandler: [adminGuard] }, ctrl.createTagHandler);
  app.put('/admin/tags/:id', { preHandler: [adminGuard] }, ctrl.updateTagHandler);
  app.delete('/admin/tags/:id', { preHandler: [adminGuard] }, ctrl.deleteTagHandler);
}
