import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './notification.controller.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/notifications', ctrl.getNotificationsHandler);
  app.get('/notifications/unread-count', ctrl.getUnreadCountHandler);
  app.put('/notifications/:id/read', ctrl.markAsReadHandler);
  app.put('/notifications/read-all', ctrl.markAllAsReadHandler);

  app.get('/notification-preferences', ctrl.getNotificationPreferencesHandler);
  app.put('/notification-preferences', ctrl.updateNotificationPreferencesHandler);
}
