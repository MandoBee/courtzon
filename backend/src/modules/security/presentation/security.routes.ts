import type { FastifyInstance } from 'fastify';
import { authMiddleware, requireRole } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './security.controller.js';

const superAdminGuard = requireRole(['super_admin', 'super-admin']);

export async function securityRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Security Dashboard
  app.get('/admin/security/dashboard', { preHandler: [superAdminGuard] }, ctrl.getSecurityDashboardHandler);

  // Active Sessions
  app.get('/admin/security/sessions', { preHandler: [superAdminGuard] }, ctrl.getActiveSessionsHandler);
  app.get('/admin/security/sessions/suspicious', { preHandler: [superAdminGuard] }, ctrl.getSuspiciousSessionsHandler);
  app.post('/admin/security/sessions/:id/revoke', { preHandler: [superAdminGuard] }, ctrl.revokeSessionHandler);

  // Failed Login Monitoring
  app.get('/admin/security/failed-logins', { preHandler: [superAdminGuard] }, ctrl.getFailedLoginStatsHandler);
  app.get('/admin/security/failed-logins/feed', { preHandler: [superAdminGuard] }, ctrl.getFailedLoginFeedHandler);

  // Upload Security
  app.get('/admin/security/uploads', { preHandler: [superAdminGuard] }, ctrl.getUploadSecurityStatsHandler);
  app.get('/admin/security/uploads/recent', { preHandler: [superAdminGuard] }, ctrl.getRecentUploadsHandler);

  // Security Alerts
  app.get('/admin/security/alerts', { preHandler: [superAdminGuard] }, ctrl.getSecurityAlertsHandler);

  // Organisation Security
  app.get('/admin/security/organisations', { preHandler: [superAdminGuard] }, ctrl.getOrganisationSecurityHandler);

  // Role & Permission Audit
  app.get('/admin/security/role-audit', { preHandler: [superAdminGuard] }, ctrl.getRoleAuditHandler);

  // System Health
  app.get('/admin/security/system-health', { preHandler: [superAdminGuard] }, ctrl.getSystemHealthHandler);
  app.get('/admin/security/redis', { preHandler: [superAdminGuard] }, ctrl.getRedisInfoHandler);
}
