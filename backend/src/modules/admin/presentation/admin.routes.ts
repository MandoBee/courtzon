import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './admin.controller.js';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // All admin routes are authenticated
  app.addHook('preHandler', authMiddleware);

  // ── Settings ──────────────────────────────────────────────────────────
  app.get('/admin/settings', { preHandler: [requirePermission(['system_settings.view'])] }, ctrl.getSettingsHandler);
  app.get('/admin/settings/categories', { preHandler: [requirePermission(['system_settings.view'])] }, ctrl.getSettingCategoriesHandler);
  app.get('/admin/settings/:key', { preHandler: [requirePermission(['system_settings.view'])] }, ctrl.getSettingByKeyHandler);
  app.put('/admin/settings/:key', { preHandler: [requirePermission(['system_settings.update'])] }, ctrl.updateSettingHandler);

  // ── Feature Flags ─────────────────────────────────────────────────────
  app.get('/admin/feature-flags', { preHandler: [requirePermission(['feature_flags.view'])] }, ctrl.listFeatureFlagsHandler);
  app.post('/admin/feature-flags', { preHandler: [requirePermission(['feature_flags.update'])] }, ctrl.createFeatureFlagHandler);
  app.put('/admin/feature-flags/:id', { preHandler: [requirePermission(['feature_flags.update'])] }, ctrl.updateFeatureFlagHandler);
  app.post('/admin/feature-flags/:id/toggle', { preHandler: [requirePermission(['feature_flags.update'])] }, ctrl.toggleFeatureFlagHandler);
  app.delete('/admin/feature-flags/:id', { preHandler: [requirePermission(['feature_flags.update'])] }, ctrl.deleteFeatureFlagHandler);

  // ── Health ────────────────────────────────────────────────────────────
  app.get('/admin/health', { preHandler: [requirePermission(['system_health.view'])] }, ctrl.getSystemHealthHandler);

  // ── Cache ─────────────────────────────────────────────────────────────
  app.get('/admin/cache', { preHandler: [requirePermission(['cache.manage'])] }, ctrl.getCacheStatsHandler);
  app.post('/admin/cache/clear', { preHandler: [requirePermission(['cache.manage'])] }, ctrl.clearCacheHandler);

  // ── Queues ────────────────────────────────────────────────────────────
  app.get('/admin/queues', { preHandler: [requirePermission(['queue.view'])] }, ctrl.getQueueStatusHandler);

  // ── Audit Logs ────────────────────────────────────────────────────────
  app.get('/admin/audit-logs', { preHandler: [requirePermission(['audit.view'])] }, ctrl.getAuditLogsHandler);
}

// Public routes — no auth
export async function publicAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/public/settings', ctrl.getPublicSettingsHandler);
}
