import type { FastifyRequest, FastifyReply } from 'fastify';
import { sendBroadcast, getBroadcasts, cancelBroadcast, type BroadcastPayload, type BroadcastTarget } from '../application/admin-broadcast.service.js';
import { getDeadLetters, retryFromDeadLetter, getAnalytics, getAnalyticsSummary, getDeadLetters as getDeadLettersList } from '../infrastructure/repositories/delivery.repository.js';
import { getOnlineCount } from '../application/presence.service.js';

export async function broadcastHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { BroadcastSchema } = await import('./admin-broadcast.dto.js');
  const body = BroadcastSchema.parse(request.body) as {
    title: string;
    body: string;
    type?: string;
    priority?: string;
    actionKey?: string;
    routePattern?: string;
    imageUrls?: Record<string, string>;
    actions?: any[];
    target: { scope: string; roleSlug?: string; organisationId?: number; branchId?: number; userIds?: number[] };
    scheduledAt?: string;
  };

  const target: BroadcastTarget = body.target.scope === 'all'
    ? { scope: 'all' }
    : body.target.scope === 'role'
      ? { scope: 'role', roleSlug: body.target.roleSlug! }
      : body.target.scope === 'organisation'
        ? { scope: 'organisation', organisationId: body.target.organisationId! }
        : body.target.scope === 'branch'
          ? { scope: 'branch', branchId: body.target.branchId! }
          : body.target.scope === 'users'
            ? { scope: 'users', userIds: body.target.userIds! }
            : { scope: 'all' };

  const broadcastId = await sendBroadcast(
    {
      title: body.title,
      body: body.body,
      type: body.type,
      priority: body.priority,
      actionKey: body.actionKey,
      routePattern: body.routePattern,
      imageUrls: body.imageUrls,
      actions: body.actions,
    },
    target,
    userId,
    body.scheduledAt ? new Date(body.scheduledAt) : undefined,
  );

  return reply.send({ success: true, broadcastId });
}

export async function getBroadcastsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const activeOnly = query.active_only === 'true' || query.active_only === '1';
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 50;

  const broadcasts = await getBroadcasts(activeOnly, limit, (page - 1) * limit);
  return reply.send({ data: broadcasts });
}

export async function cancelBroadcastHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await cancelBroadcast(Number(id));
  return reply.send({ success: true });
}

export async function analyticsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const action = query.action || undefined;
  const from = query.from ? new Date(query.from) : undefined;
  const to = query.to ? new Date(query.to) : undefined;

  const [records, summary] = await Promise.all([
    getAnalytics(action, from, to),
    getAnalyticsSummary(from, to),
  ]);

  return reply.send({ records, summary });
}

export async function deadLettersHandler(request: FastifyRequest, reply: FastifyReply) {
  const letters = await getDeadLettersList();
  return reply.send({ data: letters });
}

export async function resolveDeadLetterHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await retryFromDeadLetter(Number(id));
  return reply.send({ success: true });
}

export async function presenceHandler(request: FastifyRequest, reply: FastifyReply) {
  const count = await getOnlineCount();
  return reply.send({ onlineCount: count });
}
