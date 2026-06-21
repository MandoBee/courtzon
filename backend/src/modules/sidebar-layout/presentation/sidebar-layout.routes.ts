import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './sidebar-layout.controller.js';

export async function sidebarLayoutRoutes(app: FastifyInstance) {
  app.get('/sidebar/layout', { preHandler: [authMiddleware] }, ctrl.getLayoutHandler);
  app.put('/sidebar/layout', { preHandler: [authMiddleware, requirePermission(['sidebar.layout.manage'])] }, ctrl.saveLayoutHandler);
}
