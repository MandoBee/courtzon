import type { FastifyRequest, FastifyReply } from 'fastify';
import { citiesService } from '../application/cities.service.js';
import { CreateCitySchema, UpdateCitySchema } from './cities.dto.js';

export async function listCitiesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const cities = await citiesService.listAll();
  return reply.send({ data: cities });
}

export async function getCityHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const city = await citiesService.getById(Number(id));
  return reply.send(city);
}

export async function listCitiesByProvinceHandler(request: FastifyRequest, reply: FastifyReply) {
  const { provinceId } = request.params as any;
  const cities = await citiesService.listByProvince(Number(provinceId));
  return reply.send({ data: cities });
}

export async function createCityHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateCitySchema.parse(request.body);
  const city = await citiesService.create(body);
  return reply.status(201).send(city);
}

export async function updateCityHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = UpdateCitySchema.parse(request.body);
  const city = await citiesService.update(Number(id), body);
  return reply.send(city);
}

export async function deleteCityHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await citiesService.delete(Number(id));
  return reply.status(204).send();
}
