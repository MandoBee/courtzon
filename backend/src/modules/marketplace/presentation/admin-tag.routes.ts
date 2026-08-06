import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './admin-tag.controller.js';

export async function adminTagRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/admin/tags', { preHandler: [requirePermission(['tags.view'])] }, ctrl.listTagsHandler);
  app.get('/admin/tags/:id', { preHandler: [requirePermission(['tags.view'])] }, ctrl.getTagHandler);
  app.post('/admin/tags', { preHandler: [requirePermission(['tags.manage'])] }, ctrl.createTagHandler);
  app.put('/admin/tags/:id', { preHandler: [requirePermission(['tags.manage'])] }, ctrl.updateTagHandler);
  app.delete('/admin/tags/:id', { preHandler: [requirePermission(['tags.manage'])] }, ctrl.deleteTagHandler);
}
