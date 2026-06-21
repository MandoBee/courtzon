import type { FastifyRequest, FastifyReply } from 'fastify';
import { amenitiesService } from '../application/amenities.service.js';
import { CreateAmenitySchema, UpdateAmenitySchema } from './amenities.dto.js';
import { recordAudit } from '../../audit-log/index.js';

export async function getAmenityHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const amenity = await amenitiesService.getById(Number(id));
  return reply.send(amenity);
}

export async function createAmenityHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateAmenitySchema.parse(request.body);
  const amenity = await amenitiesService.create(body);
  recordAudit({
    actorId: (request as any).user?.id || null,
    action: 'AMENITY.CREATE',
    entityType: 'court_amenity',
    entityId: amenity.id,
    afterState: { nameEn: body.nameEn, nameAr: body.nameAr, category: body.category },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(amenity);
}

export async function updateAmenityHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = UpdateAmenitySchema.parse(request.body);
  const before = await amenitiesService.getById(Number(id));
  const amenity = await amenitiesService.update(Number(id), body);
  recordAudit({
    actorId: (request as any).user?.id || null,
    action: 'AMENITY.UPDATE',
    entityType: 'court_amenity',
    entityId: Number(id),
    beforeState: before ? { nameEn: before.name_en, nameAr: before.name_ar } : null,
    afterState: { nameEn: body.nameEn, nameAr: body.nameAr, category: body.category },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(amenity);
}

export async function deleteAmenityHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const before = await amenitiesService.getById(Number(id));
  await amenitiesService.delete(Number(id));
  recordAudit({
    actorId: (request as any).user?.id || null,
    action: 'AMENITY.DELETE',
    entityType: 'court_amenity',
    entityId: Number(id),
    beforeState: before ? { nameEn: before.name_en, nameAr: before.name_ar } : null,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(204).send();
}
