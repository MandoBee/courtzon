import type { FastifyRequest, FastifyReply } from 'fastify';
import { currenciesService } from '../application/currencies.service.js';
import { CreateCurrencySchema, UpdateCurrencySchema } from './currencies.dto.js';

export async function listCurrenciesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const currencies = await currenciesService.listAll();
  return reply.send({ data: currencies });
}

export async function getCurrencyHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const currency = await currenciesService.getById(Number(id));
  return reply.send(currency);
}

export async function createCurrencyHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateCurrencySchema.parse(request.body);
  const currency = await currenciesService.create(body);
  return reply.status(201).send(currency);
}

export async function updateCurrencyHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = UpdateCurrencySchema.parse(request.body);
  const currency = await currenciesService.update(Number(id), body);
  return reply.send(currency);
}

export async function deleteCurrencyHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await currenciesService.delete(Number(id));
  return reply.status(204).send();
}
