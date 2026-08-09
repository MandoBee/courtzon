import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './admin.controller.js';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // All admin routes are authenticated
  app.addHook('preHandler', authMiddleware);

  // ── Settings ──────────────────────────────────────────────────────────
  app.get('/admin/settings', { preHandler: [requirePermission(['app-settings.view'])] }, ctrl.getSettingsHandler);
  app.get('/admin/settings/metadata', { preHandler: [requirePermission(['app-settings.view'])] }, ctrl.getSettingsMetadataHandler);
  app.get('/admin/settings/history', { preHandler: [requirePermission(['app-settings.view'])] }, ctrl.getSettingsHistoryHandler);
  app.get('/admin/settings/categories', { preHandler: [requirePermission(['app-settings.view'])] }, ctrl.getSettingCategoriesHandler);
  app.get('/admin/settings/:key', { preHandler: [requirePermission(['app-settings.view'])] }, ctrl.getSettingByKeyHandler);
  app.put('/admin/settings/:key', { preHandler: [requirePermission(['app-settings.edit'])] }, ctrl.updateSettingHandler);
  app.get('/admin/settings/profiles', { preHandler: [requirePermission(['app-settings.view'])] }, ctrl.listProfilesHandler);
  app.post('/admin/settings/profiles', { preHandler: [requirePermission(['app-settings.edit'])] }, ctrl.createProfileHandler);
  app.post('/admin/settings/profiles/:id/apply', { preHandler: [requirePermission(['app-settings.edit'])] }, ctrl.applyProfileHandler);
  app.post('/admin/settings/profiles/:id/archive', { preHandler: [requirePermission(['app-settings.edit'])] }, ctrl.archiveProfileHandler);
  app.delete('/admin/settings/profiles/:id', { preHandler: [requirePermission(['app-settings.edit'])] }, ctrl.deleteProfileHandler);

  // ── Feature Flags ─────────────────────────────────────────────────────
  app.get('/admin/feature-flags', { preHandler: [requirePermission(['feature-flags.view'])] }, ctrl.listFeatureFlagsHandler);
  app.post('/admin/feature-flags', { preHandler: [requirePermission(['feature-flags.manage'])] }, ctrl.createFeatureFlagHandler);
  app.put('/admin/feature-flags/:id', { preHandler: [requirePermission(['feature-flags.manage'])] }, ctrl.updateFeatureFlagHandler);
  app.post('/admin/feature-flags/:id/toggle', { preHandler: [requirePermission(['feature-flags.manage'])] }, ctrl.toggleFeatureFlagHandler);
  app.delete('/admin/feature-flags/:id', { preHandler: [requirePermission(['feature-flags.manage'])] }, ctrl.deleteFeatureFlagHandler);

  // ── Health ────────────────────────────────────────────────────────────
  app.get('/admin/health', { preHandler: [requirePermission(['security.system-health'])] }, ctrl.getSystemHealthHandler);

  // ── Cache ─────────────────────────────────────────────────────────────
  app.get('/admin/cache', { preHandler: [requirePermission(['cache.manage'])] }, ctrl.getCacheStatsHandler);
  app.post('/admin/cache/clear', { preHandler: [requirePermission(['cache.manage'])] }, ctrl.clearCacheHandler);

  // ── Queues ────────────────────────────────────────────────────────────
  app.get('/admin/queues', { preHandler: [requirePermission(['queue.manage'])] }, ctrl.getQueueStatusHandler);
  app.get('/admin/queues/:queueName/jobs', { preHandler: [requirePermission(['queue.manage'])] }, ctrl.getQueueJobsHandler);
  app.post('/admin/queues/:queueName/jobs/:jobId/retry', { preHandler: [requirePermission(['queue.manage'])] }, ctrl.retryJobHandler);
  app.post('/admin/queues/:queueName/drain', { preHandler: [requirePermission(['queue.manage'])] }, ctrl.drainQueueHandler);
  app.post('/admin/queues/:queueName/pause', { preHandler: [requirePermission(['queue.manage'])] }, ctrl.pauseQueueHandler);
  app.post('/admin/queues/:queueName/resume', { preHandler: [requirePermission(['queue.manage'])] }, ctrl.resumeQueueHandler);
}

// Public routes — no auth
export async function publicAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get('/public/settings', ctrl.getPublicSettingsHandler);
}
