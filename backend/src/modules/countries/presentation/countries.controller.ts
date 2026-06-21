import type { FastifyRequest, FastifyReply } from 'fastify';
import { countriesService } from '../application/countries.service.js';
import { CreateCountrySchema, UpdateCountrySchema } from './countries.dto.js';

export async function listCountriesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const countries = await countriesService.listAll();
  return reply.send({ data: countries });
}

export async function getCountryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const country = await countriesService.getById(Number(id));
  return reply.send(country);
}

export async function createCountryHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateCountrySchema.parse(request.body);
  const country = await countriesService.create(body);
  return reply.status(201).send(country);
}

export async function updateCountryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = UpdateCountrySchema.parse(request.body);
  const country = await countriesService.update(Number(id), body);
  return reply.send(country);
}

export async function deleteCountryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await countriesService.delete(Number(id));
  return reply.status(204).send();
}
