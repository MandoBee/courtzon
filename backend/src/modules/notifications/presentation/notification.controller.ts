import type { FastifyRequest, FastifyReply } from 'fastify';
import { notificationService } from '../application/notification.service.js';

export async function getNotificationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const query = request.query as any;
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 20;
  const actionKey = query.action_key || undefined;
  const result = await notificationService.getUserNotifications(userId, page, limit, actionKey);
  return reply.send(result);
}

export async function getUnreadCountHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const count = await notificationService.getUnreadCount(userId);
  return reply.send({ count });
}

export async function markAsReadHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { id } = request.params as any;
  await notificationService.markAsRead(Number(id), userId);
  return reply.send({ success: true });
}

export async function markAllAsReadHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  await notificationService.markAllAsRead(userId);
  return reply.send({ success: true });
}

export async function getNotificationPreferencesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const prefs = await notificationService.getPreferences(userId);
  return reply.send({ data: prefs });
}

export async function updateNotificationPreferencesHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { UpdateNotificationPreferencesSchema } = await import('./notification.dto.js');
  const body = UpdateNotificationPreferencesSchema.parse(request.body);
  await notificationService.updatePreferences(userId, body.preferences);
  return reply.send({ success: true });
}
