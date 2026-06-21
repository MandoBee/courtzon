import type { FastifyRequest, FastifyReply } from 'fastify';
import { provincesService } from '../application/provinces.service.js';
import { CreateProvinceSchema, UpdateProvinceSchema } from './provinces.dto.js';

export async function listProvincesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const provinces = await provincesService.listAll();
  return reply.send({ data: provinces });
}

export async function getProvinceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const province = await provincesService.getById(Number(id));
  return reply.send(province);
}

export async function listProvincesByCountryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { countryId } = request.params as any;
  const provinces = await provincesService.listByCountry(Number(countryId));
  return reply.send({ data: provinces });
}

export async function createProvinceHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateProvinceSchema.parse(request.body);
  const province = await provincesService.create(body);
  return reply.status(201).send(province);
}

export async function updateProvinceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = UpdateProvinceSchema.parse(request.body);
  const province = await provincesService.update(Number(id), body);
  return reply.send(province);
}

export async function deleteProvinceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await provincesService.delete(Number(id));
  return reply.status(204).send();
}
