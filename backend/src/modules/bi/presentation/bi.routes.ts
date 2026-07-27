import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './bi.controller.js';

export async function biRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/bi/dashboard', { preHandler: [requirePermission(['bi.dashboard.view'])] }, ctrl.getExecutiveDashboardHandler);
  app.get('/bi/dashboard/org/:orgId', { preHandler: [requirePermission(['bi.dashboard.view'])] }, ctrl.getOrgDashboardHandler);

  app.get('/bi/kpi-snapshots', { preHandler: [requirePermission(['bi.kpi.view'])] }, ctrl.getKPISnapshotsHandler);

  app.get('/bi/export/:reportType', { preHandler: [requirePermission(['bi.export'])] }, ctrl.exportReportHandler);

  app.get('/bi/web-vitals', { preHandler: [requirePermission(['bi.observability.view'])] }, ctrl.getWebVitalsHandler);

  app.get('/bi/client-errors', { preHandler: [requirePermission(['bi.observability.view'])] }, ctrl.getClientErrorsHandler);
}
