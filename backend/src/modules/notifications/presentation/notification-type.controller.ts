import type { FastifyRequest, FastifyReply } from 'fastify';
import { notificationTypeService } from '../application/notification-type.service.js';
import { CreateNotificationTypeSchema, UpdateNotificationTypeSchema, NotificationTypeFiltersSchema } from './notification-type.dto.js';
import { recordAudit } from '../../audit-log/index.js';
import { isZodError, formatZodErrorDetails } from '../../../shared/validation/zod-error.util.js';

function buildMeta(request: FastifyRequest, code?: string) {
  return {
    requestId: (request as any).id ?? request.id,
    timestamp: new Date().toISOString(),
    ...(code ? { code } : {}),
  };
}

export async function listHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const filters = NotificationTypeFiltersSchema.parse(request.query);
    const result = await notificationTypeService.list(filters);
    return reply.send({
      data: result.data,
      meta: buildMeta(request),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (err: unknown) {
    if (isZodError(err)) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: formatZodErrorDetails(err),
        meta: buildMeta(request),
      });
    }
    throw err;
  }
}

export async function getByIdHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const entity = await notificationTypeService.getById(Number(id));
  return reply.send({
    data: entity,
    meta: buildMeta(request),
  });
}

export async function createHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = CreateNotificationTypeSchema.parse(request.body);
    const userId = (request as any).userId ?? null;
    const entity = await notificationTypeService.create(body, userId);

    recordAudit({
      actorId: userId,
      action: 'NOTIFICATION_TYPE.CREATE',
      entityType: 'notification_type',
      entityId: entity.id,
      afterState: { code: entity.code, event_key: entity.event_key, name: entity.name },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({
      data: entity,
      meta: buildMeta(request, notificationTypeService.SuccessCodes.CREATED),
    });
  } catch (err: unknown) {
    if (isZodError(err)) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: formatZodErrorDetails(err),
        meta: buildMeta(request),
      });
    }
    throw err;
  }
}

export async function updateHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const body = UpdateNotificationTypeSchema.parse(request.body);
    const userId = (request as any).userId ?? null;

    const before = await notificationTypeService.getById(Number(id));
    const entity = await notificationTypeService.update(Number(id), body, userId);

    recordAudit({
      actorId: userId,
      action: 'NOTIFICATION_TYPE.UPDATE',
      entityType: 'notification_type',
      entityId: Number(id),
      beforeState: { code: before.code, event_key: before.event_key, name: before.name },
      afterState: { code: entity.code, event_key: entity.event_key, name: entity.name },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      data: entity,
      meta: buildMeta(request, notificationTypeService.SuccessCodes.UPDATED),
    });
  } catch (err: unknown) {
    if (isZodError(err)) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: formatZodErrorDetails(err),
        meta: buildMeta(request),
      });
    }
    throw err;
  }
}

export async function deleteHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const userId = (request as any).userId ?? null;

  const before = await notificationTypeService.getById(Number(id));
  await notificationTypeService.delete(Number(id), userId);

  recordAudit({
    actorId: userId,
    action: 'NOTIFICATION_TYPE.DELETE',
    entityType: 'notification_type',
    entityId: Number(id),
    beforeState: { code: before.code, event_key: before.event_key, name: before.name },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({
    data: null,
    meta: buildMeta(request, notificationTypeService.SuccessCodes.DELETED),
  });
}

export async function optionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const options = await notificationTypeService.getOptions();
  return reply.send({
    data: options,
    meta: buildMeta(request),
  });
}
