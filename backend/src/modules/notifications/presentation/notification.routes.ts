import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './notification.controller.js';
import * as broadcastCtrl from './admin-broadcast.controller.js';
import * as enterpriseCtrl from './enterprise-admin.controller.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/notifications', ctrl.getNotificationsHandler);
  app.get('/notifications/unread-count', ctrl.getUnreadCountHandler);
  app.get('/notifications/filters', ctrl.getFiltersHandler);
  app.put('/notifications/:id/read', ctrl.markAsReadHandler);
  app.put('/notifications/read-all', ctrl.markAllAsReadHandler);
  app.put('/notifications/:id/archive', ctrl.archiveHandler);
  app.put('/notifications/archive-all', ctrl.archiveAllHandler);
  app.delete('/notifications/:id', ctrl.deleteHandler);

  app.get('/notification-preferences', ctrl.getNotificationPreferencesHandler);
  app.put('/notification-preferences', ctrl.updateNotificationPreferencesHandler);

  app.get('/notifications/reconnect-queue', ctrl.reconnectQueueHandler);
  app.post('/notifications/track', ctrl.trackEventHandler);

  // Admin broadcast
  app.post('/admin/notifications/broadcast', broadcastCtrl.broadcastHandler);
  app.get('/admin/notifications/broadcasts', broadcastCtrl.getBroadcastsHandler);
  app.put('/admin/notifications/broadcasts/:id/cancel', broadcastCtrl.cancelBroadcastHandler);

  // Analytics
  app.get('/admin/notifications/analytics', broadcastCtrl.analyticsHandler);
  app.get('/admin/notifications/dead-letters', broadcastCtrl.deadLettersHandler);
  app.put('/admin/notifications/dead-letters/:id/resolve', broadcastCtrl.resolveDeadLetterHandler);
  app.get('/admin/notifications/presence', broadcastCtrl.presenceHandler);

  // Feature flags
  app.get('/admin/notifications/feature-flags', enterpriseCtrl.getFeatureFlagsHandler);
  app.put('/admin/notifications/feature-flags', enterpriseCtrl.setFeatureFlagHandler);

  // A/B tests
  app.get('/admin/notifications/ab-tests', enterpriseCtrl.getAbTestsHandler);
  app.post('/admin/notifications/ab-tests', enterpriseCtrl.createAbTestHandler);
  app.put('/admin/notifications/ab-tests/:id', enterpriseCtrl.toggleAbTestHandler);
  app.get('/admin/notifications/ab-tests/:id/results', enterpriseCtrl.getAbTestResultsHandler);

  // Cleanup policies
  app.get('/admin/notifications/cleanup', enterpriseCtrl.getCleanupPoliciesHandler);
  app.put('/admin/notifications/cleanup', enterpriseCtrl.updateCleanupPolicyHandler);
  app.post('/admin/notifications/cleanup/run', enterpriseCtrl.runCleanupHandler);

  // Event replay
  app.get('/admin/notifications/replay-logs', enterpriseCtrl.getReplayLogsHandler);
  app.post('/admin/notifications/replay', enterpriseCtrl.replayEventHandler);

  // Template management
  app.get('/admin/notifications/templates', enterpriseCtrl.getTemplatesHandler);
  app.put('/admin/notifications/templates/:id', enterpriseCtrl.updateTemplateHandler);
  app.get('/admin/notifications/templates/:id/versions', enterpriseCtrl.getTemplateVersionsHandler);
  app.post('/admin/notifications/templates/:id/rollback', enterpriseCtrl.rollbackTemplateHandler);

  // Webhook management
  app.get('/admin/notifications/webhooks', enterpriseCtrl.getWebhooksHandler);
  app.post('/admin/notifications/webhooks', enterpriseCtrl.createWebhookHandler);
  app.put('/admin/notifications/webhooks/:id', enterpriseCtrl.updateWebhookHandler);
  app.delete('/admin/notifications/webhooks/:id', enterpriseCtrl.deleteWebhookHandler);

  // Channel preferences
  app.get('/notifications/channel-preferences', enterpriseCtrl.getChannelPreferencesHandler);
  app.put('/notifications/channel-preferences', enterpriseCtrl.updateChannelPreferencesHandler);

  // Quiet hours
  app.get('/notifications/quiet-hours', enterpriseCtrl.getQuietHoursHandler);
  app.post('/notifications/quiet-hours', enterpriseCtrl.upsertQuietHoursHandler);
  app.delete('/notifications/quiet-hours/:id', enterpriseCtrl.deleteQuietHoursHandler);

  // Devices
  app.get('/notifications/devices', enterpriseCtrl.getDevicesHandler);
  app.post('/notifications/devices', enterpriseCtrl.registerDeviceHandler);

  // Audit trail
  app.get('/admin/notifications/audit-trail', enterpriseCtrl.getAuditTrailHandler);
}
