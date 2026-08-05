import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './notification.controller.js';
import * as broadcastCtrl from './admin-broadcast.controller.js';
import * as enterpriseCtrl from './enterprise-admin.controller.js';
import * as monitoringCtrl from './monitoring.controller.js';
import * as configCtrl from './notification-config.controller.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  // Public routes (no auth required)
  app.post('/client/errors', monitoringCtrl.reportClientError);
  app.post('/client/web-vitals', monitoringCtrl.reportWebVitals);

  // Authenticated routes
  await app.register(async function authenticatedScope(scopedApp: FastifyInstance) {
    scopedApp.addHook('preHandler', authMiddleware);

    // User-facing notification routes (auth-only, self-service)
    scopedApp.get('/notifications', ctrl.getNotificationsHandler);
    scopedApp.get('/notifications/unread-count', ctrl.getUnreadCountHandler);
    scopedApp.get('/notifications/filters', ctrl.getFiltersHandler);
    scopedApp.put('/notifications/:id/read', ctrl.markAsReadHandler);
    scopedApp.put('/notifications/read-all', ctrl.markAllAsReadHandler);
    scopedApp.put('/notifications/:id/archive', ctrl.archiveHandler);
    scopedApp.put('/notifications/archive-all', ctrl.archiveAllHandler);
    scopedApp.delete('/notifications/:id', ctrl.deleteHandler);

    scopedApp.get('/notification-preferences', ctrl.getNotificationPreferencesHandler);
    scopedApp.put('/notification-preferences', ctrl.updateNotificationPreferencesHandler);

    // Admin read of a specific user's notification preferences (reuses the same service).
    scopedApp.get('/admin/users/:id/notification-preferences', { preHandler: [requirePermission(['users.view-activity'])] }, ctrl.adminGetNotificationPreferencesHandler);

    scopedApp.get('/notifications/reconnect-queue', ctrl.reconnectQueueHandler);
    scopedApp.post('/notifications/track', ctrl.trackEventHandler);

    // Admin notification routes with permission guards
    scopedApp.post('/admin/notifications/broadcast', { preHandler: [requirePermission(['notifications.broadcast'])] }, broadcastCtrl.broadcastHandler);
    scopedApp.get('/admin/notifications/broadcasts', { preHandler: [requirePermission(['notifications.broadcast'])] }, broadcastCtrl.getBroadcastsHandler);
    scopedApp.put('/admin/notifications/broadcasts/:id/cancel', { preHandler: [requirePermission(['notifications.broadcast'])] }, broadcastCtrl.cancelBroadcastHandler);

    scopedApp.get('/admin/notifications/analytics', { preHandler: [requirePermission(['notifications.analytics'])] }, broadcastCtrl.analyticsHandler);
    scopedApp.get('/admin/notifications/dead-letters', { preHandler: [requirePermission(['notifications.dead-letters'])] }, broadcastCtrl.deadLettersHandler);
    scopedApp.put('/admin/notifications/dead-letters/:id/resolve', { preHandler: [requirePermission(['notifications.dead-letters'])] }, broadcastCtrl.resolveDeadLetterHandler);
    scopedApp.get('/admin/notifications/presence', { preHandler: [requirePermission(['notifications.presence'])] }, broadcastCtrl.presenceHandler);

    scopedApp.get('/admin/notifications/feature-flags', { preHandler: [requirePermission(['notifications.feature-flags.manage'])] }, enterpriseCtrl.getFeatureFlagsHandler);
    scopedApp.put('/admin/notifications/feature-flags', { preHandler: [requirePermission(['notifications.feature-flags.manage'])] }, enterpriseCtrl.setFeatureFlagHandler);

    scopedApp.get('/admin/notifications/ab-tests', { preHandler: [requirePermission(['notifications.ab-tests.manage'])] }, enterpriseCtrl.getAbTestsHandler);
    scopedApp.post('/admin/notifications/ab-tests', { preHandler: [requirePermission(['notifications.ab-tests.manage'])] }, enterpriseCtrl.createAbTestHandler);
    scopedApp.put('/admin/notifications/ab-tests/:id', { preHandler: [requirePermission(['notifications.ab-tests.manage'])] }, enterpriseCtrl.toggleAbTestHandler);
    scopedApp.get('/admin/notifications/ab-tests/:id/results', { preHandler: [requirePermission(['notifications.ab-tests.manage'])] }, enterpriseCtrl.getAbTestResultsHandler);

    scopedApp.get('/admin/notifications/cleanup', { preHandler: [requirePermission(['notifications.cleanup.manage'])] }, enterpriseCtrl.getCleanupPoliciesHandler);
    scopedApp.put('/admin/notifications/cleanup', { preHandler: [requirePermission(['notifications.cleanup.manage'])] }, enterpriseCtrl.updateCleanupPolicyHandler);
    scopedApp.post('/admin/notifications/cleanup/run', { preHandler: [requirePermission(['notifications.cleanup.manage'])] }, enterpriseCtrl.runCleanupHandler);

    scopedApp.get('/admin/notifications/replay-logs', { preHandler: [requirePermission(['notifications.replay.manage'])] }, enterpriseCtrl.getReplayLogsHandler);
    scopedApp.post('/admin/notifications/replay', { preHandler: [requirePermission(['notifications.replay.manage'])] }, enterpriseCtrl.replayEventHandler);

    scopedApp.get('/admin/notifications/templates', { preHandler: [requirePermission(['notifications.templates'])] }, enterpriseCtrl.getTemplatesHandler);
    scopedApp.put('/admin/notifications/templates/:id', { preHandler: [requirePermission(['notifications.templates'])] }, enterpriseCtrl.updateTemplateHandler);
    scopedApp.get('/admin/notifications/templates/:id/versions', { preHandler: [requirePermission(['notifications.templates'])] }, enterpriseCtrl.getTemplateVersionsHandler);
    scopedApp.post('/admin/notifications/templates/:id/rollback', { preHandler: [requirePermission(['notifications.templates'])] }, enterpriseCtrl.rollbackTemplateHandler);

    scopedApp.get('/admin/notifications/webhooks', { preHandler: [requirePermission(['notifications.webhooks.manage'])] }, enterpriseCtrl.getWebhooksHandler);
    scopedApp.post('/admin/notifications/webhooks', { preHandler: [requirePermission(['notifications.webhooks.manage'])] }, enterpriseCtrl.createWebhookHandler);
    scopedApp.put('/admin/notifications/webhooks/:id', { preHandler: [requirePermission(['notifications.webhooks.manage'])] }, enterpriseCtrl.updateWebhookHandler);
    scopedApp.delete('/admin/notifications/webhooks/:id', { preHandler: [requirePermission(['notifications.webhooks.manage'])] }, enterpriseCtrl.deleteWebhookHandler);

    scopedApp.get('/admin/notifications/audit-trail', { preHandler: [requirePermission(['notifications.audit.view'])] }, enterpriseCtrl.getAuditTrailHandler);

    // User-facing self-service routes (auth-only, no additional permission needed)
    scopedApp.get('/notifications/channel-preferences', enterpriseCtrl.getChannelPreferencesHandler);
    scopedApp.put('/notifications/channel-preferences', enterpriseCtrl.updateChannelPreferencesHandler);

    scopedApp.get('/notifications/quiet-hours', enterpriseCtrl.getQuietHoursHandler);
    scopedApp.post('/notifications/quiet-hours', enterpriseCtrl.upsertQuietHoursHandler);
    scopedApp.delete('/notifications/quiet-hours/:id', enterpriseCtrl.deleteQuietHoursHandler);

    scopedApp.get('/notifications/devices', enterpriseCtrl.getDevicesHandler);
    scopedApp.post('/notifications/devices', enterpriseCtrl.registerDeviceHandler);

    // Admin: Notification Platform configuration
    scopedApp.get('/admin/notifications/config/settings', { preHandler: [requirePermission(['notifications.config.manage'])] }, configCtrl.getGlobalSettingsHandler);
    scopedApp.put('/admin/notifications/config/settings/:key', { preHandler: [requirePermission(['notifications.config.manage'])] }, configCtrl.updateGlobalSettingHandler);
    scopedApp.get('/admin/notifications/config/retry-policies', { preHandler: [requirePermission(['notifications.config.manage'])] }, configCtrl.getRetryPoliciesHandler);
    scopedApp.post('/admin/notifications/config/retry-policies', { preHandler: [requirePermission(['notifications.config.manage'])] }, configCtrl.createRetryPolicyHandler);
    scopedApp.put('/admin/notifications/config/retry-policies/:id', { preHandler: [requirePermission(['notifications.config.manage'])] }, configCtrl.updateRetryPolicyHandler);
    scopedApp.delete('/admin/notifications/config/retry-policies/:id', { preHandler: [requirePermission(['notifications.config.manage'])] }, configCtrl.deleteRetryPolicyHandler);
    scopedApp.get('/admin/notifications/config/rules', { preHandler: [requirePermission(['notifications.config.manage'])] }, configCtrl.getRulesHandler);
    scopedApp.post('/admin/notifications/config/rules', { preHandler: [requirePermission(['notifications.config.manage'])] }, configCtrl.createRuleHandler);
    scopedApp.put('/admin/notifications/config/rules/:id', { preHandler: [requirePermission(['notifications.config.manage'])] }, configCtrl.updateRuleHandler);
    scopedApp.delete('/admin/notifications/config/rules/:id', { preHandler: [requirePermission(['notifications.config.manage'])] }, configCtrl.deleteRuleHandler);
    scopedApp.get('/admin/notifications/config/providers', { preHandler: [requirePermission(['notifications.config.manage'])] }, configCtrl.getProvidersHandler);
    scopedApp.put('/admin/notifications/config/providers/:id', { preHandler: [requirePermission(['notifications.config.manage'])] }, configCtrl.updateProviderHandler);
  });
}
