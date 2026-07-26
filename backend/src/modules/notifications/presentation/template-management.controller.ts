import type { FastifyRequest, FastifyReply } from 'fastify';
import { templateManagementService } from '../application/template-management.service.js';
import { CreateTemplateSchema, UpdateTemplateSchema, TemplateFiltersSchema, PreviewTemplateSchema } from './template-management.dto.js';
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
    const filters = TemplateFiltersSchema.parse(request.query);
    const result = await templateManagementService.list(filters);
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
  const entity = await templateManagementService.getById(Number(id));
  return reply.send({
    data: entity,
    meta: buildMeta(request),
  });
}

export async function createHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = CreateTemplateSchema.parse(request.body);
    const userId = (request as any).userId ?? null;
    const entity = await templateManagementService.create(body, userId);

    recordAudit({
      actorId: userId,
      action: 'TEMPLATE.CREATE',
      entityType: 'notification_template',
      entityId: entity.id,
      afterState: { code: entity.code, name: entity.name, notification_type_id: entity.notification_type_id },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({
      data: entity,
      meta: buildMeta(request, templateManagementService.SuccessCodes.CREATED),
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
    const body = UpdateTemplateSchema.parse(request.body);
    const userId = (request as any).userId ?? null;

    const before = await templateManagementService.getById(Number(id));
    const entity = await templateManagementService.update(Number(id), body, userId);

    recordAudit({
      actorId: userId,
      action: 'TEMPLATE.UPDATE',
      entityType: 'notification_template',
      entityId: Number(id),
      beforeState: { code: before.code, name: before.name, status: before.status },
      afterState: { code: entity.code, name: entity.name, status: entity.status },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({
      data: entity,
      meta: buildMeta(request, templateManagementService.SuccessCodes.UPDATED),
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

  const before = await templateManagementService.getById(Number(id));
  await templateManagementService.delete(Number(id), userId);

  recordAudit({
    actorId: userId,
    action: 'TEMPLATE.DELETE',
    entityType: 'notification_template',
    entityId: Number(id),
    beforeState: { code: before.code, name: before.name, status: before.status },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({
    data: null,
    meta: buildMeta(request, templateManagementService.SuccessCodes.DELETED),
  });
}

export async function publishHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const userId = (request as any).userId ?? null;

  const before = await templateManagementService.getById(Number(id));
  const entity = await templateManagementService.publish(Number(id), userId);

  recordAudit({
    actorId: userId,
    action: 'TEMPLATE.PUBLISH',
    entityType: 'notification_template',
    entityId: Number(id),
    beforeState: { code: before.code, name: before.name, status: before.status, version: before.version },
    afterState: { code: entity.code, name: entity.name, status: entity.status, version: entity.version },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({
    data: entity,
    meta: buildMeta(request, templateManagementService.SuccessCodes.PUBLISHED),
  });
}

export async function archiveHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const userId = (request as any).userId ?? null;

  const before = await templateManagementService.getById(Number(id));
  const entity = await templateManagementService.archive(Number(id), userId);

  recordAudit({
    actorId: userId,
    action: 'TEMPLATE.ARCHIVE',
    entityType: 'notification_template',
    entityId: Number(id),
    beforeState: { code: before.code, name: before.name, status: before.status },
    afterState: { code: entity.code, name: entity.name, status: entity.status },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({
    data: entity,
    meta: buildMeta(request, templateManagementService.SuccessCodes.ARCHIVED),
  });
}

export async function duplicateHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const userId = (request as any).userId ?? null;

  const entity = await templateManagementService.duplicate(Number(id), userId);

  recordAudit({
    actorId: userId,
    action: 'TEMPLATE.DUPLICATE',
    entityType: 'notification_template',
    entityId: entity.id,
    afterState: { code: entity.code, name: entity.name, original_id: Number(id) },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({
    data: entity,
    meta: buildMeta(request, templateManagementService.SuccessCodes.DUPLICATED),
  });
}

export async function previewHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string };
    const body = PreviewTemplateSchema.parse(request.body);
    const result = await templateManagementService.preview(Number(id), body.sampleData);
    return reply.send({
      data: result,
      meta: buildMeta(request),
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

export async function optionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const options = await templateManagementService.getOptions();
  return reply.send({
    data: options,
    meta: buildMeta(request),
  });
}

export async function variablesHandler(request: FastifyRequest, reply: FastifyReply) {
  const { typeId } = request.params as { typeId: string };
  const variables = await templateManagementService.getVariables(Number(typeId));
  return reply.send({
    data: variables,
    meta: buildMeta(request),
  });
}
