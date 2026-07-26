import type { FastifyRequest, FastifyReply } from 'fastify';
import { communicationPreferenceService } from '../application/communication-preference.service.js';

function buildMeta(request: FastifyRequest, code?: string) {
  return {
    requestId: (request as any).id ?? request.id,
    timestamp: new Date().toISOString(),
    ...(code ? { code } : {}),
  };
}

export async function getHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const result = await communicationPreferenceService.get(userId);
  return reply.send({
    data: result,
    meta: buildMeta(request),
  });
}

export async function updateHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = request.body as { preferences: Array<{
    notification_type_id: number;
    is_allowed?: boolean;
    push_enabled?: boolean;
    email_enabled?: boolean;
    sms_enabled?: boolean;
    channels?: string[];
  }> };
  const result = await communicationPreferenceService.update(userId, body.preferences);
  return reply.send({
    data: result,
    meta: buildMeta(request),
  });
}

export async function getQuietHoursHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const quietHours = await communicationPreferenceService.getQuietHours(userId);
  return reply.send({
    data: quietHours,
    meta: buildMeta(request),
  });
}

export async function upsertQuietHoursHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = request.body as { weekday?: string | null; start_time: string; end_time: string; timezone?: string };
  const result = await communicationPreferenceService.upsertQuietHours(userId, body);
  return reply.send({
    data: result,
    meta: buildMeta(request),
  });
}
