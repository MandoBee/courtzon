import type { FastifyRequest, FastifyReply } from 'fastify';
import { notificationService } from '../application/notification.service.js';
import { notificationPlatform } from '../infrastructure/notification-platform.impl.js';

export async function getNotificationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const query = request.query as any;
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const filters: any = {};
  if (query.action_key) filters.actionKey = query.action_key;
  if (query.type) filters.type = query.type;
  if (query.priority) filters.priority = query.priority;
  if (query.is_read !== undefined) filters.isRead = query.is_read === 'true' || query.is_read === '1';
  const result = await notificationPlatform.list(userId, { page, limit }, filters);
  return reply.send(result);
}

export async function getUnreadCountHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const count = await notificationPlatform.getUnreadCount(userId);
  return reply.send({ count });
}

export async function markAsReadHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { id } = request.params as any;
  await notificationPlatform.markRead(userId, Number(id));
  return reply.send({ success: true });
}

export async function markAllAsReadHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  await notificationPlatform.markAllRead(userId);
  return reply.send({ success: true });
}

export async function archiveHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { id } = request.params as any;
  await notificationPlatform.archive(userId, Number(id));
  return reply.send({ success: true });
}

export async function archiveAllHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  await notificationPlatform.archiveAll(userId);
  return reply.send({ success: true });
}

export async function deleteHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { id } = request.params as any;
  await notificationService.softDelete(Number(id), userId);
  return reply.send({ success: true });
}

export async function getFiltersHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const filters = await notificationPlatform.getFilters(userId);
  return reply.send(filters);
}

export async function getNotificationPreferencesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const prefs = await notificationPlatform.getPreferences(userId);
  return reply.send({ data: prefs });
}

export async function updateNotificationPreferencesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { UpdateNotificationPreferencesSchema } = await import('./notification.dto.js');
  const body = UpdateNotificationPreferencesSchema.parse(request.body);
  await notificationPlatform.updatePreferences(userId, body.preferences);
  return reply.send({ success: true });
}

export async function reconnectQueueHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { getReconnectQueue: getQueue } = await import('../application/presence.service.js');
  const ids = await getQueue(userId);

  if (!ids.length) return reply.send({ notifications: [] });

  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM notifications WHERE id IN (${ids.map(() => '?').join(',')}) AND deleted_at IS NULL`,
    ids,
  );
  return reply.send({ notifications: rows });
}

export async function trackEventHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = request.body as any;
  const { eventType, notificationId, actionKey, actionPayload } = body || {};

  const { recordAnalytics } = await import('../infrastructure/repositories/delivery.repository.js');
  await recordAnalytics(notificationId, userId, eventType, 'in_app', { actionKey, actionPayload });

  if (eventType === 'read') {
    try {
      await notificationPlatform.markRead(userId, notificationId);
    } catch { }
  }

  return reply.send({ success: true });
}
