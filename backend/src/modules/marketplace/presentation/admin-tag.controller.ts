import type { FastifyRequest, FastifyReply } from 'fastify';
import { adminTagService as svc } from '../application/admin-tag.service.js';
import { recordAudit } from '../../audit-log/index.js';

export async function listTagsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const tags = await svc.list();
  return reply.send({ data: tags });
}

export async function getTagHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const tag = await svc.getById(Number(id));
  if (!tag) return reply.status(404).send({ error: 'Tag not found' });
  return reply.send(tag);
}

export async function createTagHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const id = await svc.create({ name: body.name, slug: body.slug });
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'TAG.CREATE',
    entityType: 'tag',
    entityId: Number(id),
    afterState: { name: body.name, slug: body.slug },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ id });
}

export async function updateTagHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  const updated = await svc.update(Number(id), {
    name: body.name, slug: body.slug,
    isActive: body.isActive !== undefined ? !!body.isActive : undefined,
  });
  if (!updated) return reply.status(404).send({ error: 'Tag not found' });
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'TAG.UPDATE',
    entityType: 'tag',
    entityId: Number(id),
    afterState: { name: body.name, slug: body.slug, isActive: body.isActive },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function deleteTagHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await svc.delete(Number(id));
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'TAG.DELETE',
    entityType: 'tag',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}
