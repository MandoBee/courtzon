import type { FastifyRequest, FastifyReply } from 'fastify';
import { adminCategoryService as svc } from '../application/admin-category.service.js';
import { recordAudit } from '../../audit-log/index.js';

export async function listCategoriesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const categories = await svc.listCategories();
  return reply.send({ data: categories });
}

export async function getCategoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const category = await svc.getCategory(Number(id));
  if (!category) return reply.status(404).send({ error: 'Category not found' });
  return reply.send(category);
}

export async function createCategoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const id = await svc.createCategory({
    name: body.name,
    slug: body.slug,
    parentId: body.parentId ? Number(body.parentId) : undefined,
    description: body.description,
    imageUrl: body.imageUrl,
    sortOrder: body.sortOrder ? Number(body.sortOrder) : undefined,
  });
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PRODUCT_CATEGORY.CREATE',
    entityType: 'product_category',
    entityId: Number(id),
    afterState: { name: body.name, slug: body.slug },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send({ id });
}

export async function updateCategoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  const updated = await svc.updateCategory(Number(id), {
    name: body.name,
    slug: body.slug,
    parentId: body.parentId !== undefined ? (body.parentId ? Number(body.parentId) : null) : undefined,
    description: body.description,
    imageUrl: body.imageUrl,
    sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
    isActive: body.isActive !== undefined ? !!body.isActive : undefined,
  });
  if (!updated) return reply.status(404).send({ error: 'Category not found' });
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PRODUCT_CATEGORY.UPDATE',
    entityType: 'product_category',
    entityId: Number(id),
    afterState: { name: body.name, slug: body.slug, isActive: body.isActive },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function deleteCategoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const deleted = await svc.deleteCategory(Number(id));
  if (!deleted) return reply.status(404).send({ error: 'Category not found' });
  recordAudit({
    actorId: (request as any).userId ?? null,
    action: 'PRODUCT_CATEGORY.DELETE',
    entityType: 'product_category',
    entityId: Number(id),
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}
