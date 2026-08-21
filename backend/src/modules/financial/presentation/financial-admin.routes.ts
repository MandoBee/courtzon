import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './financial-admin.controller.js';

export async function financialAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', requirePermission(['financial.view']));

  // Organisation lookup (command palette / admin search)
  app.get('/admin/organisations', ctrl.listOrganisationsHandler);
}