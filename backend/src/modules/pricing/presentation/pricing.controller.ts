import type { FastifyRequest, FastifyReply } from 'fastify';
import { pricingService } from '../application/pricing.service.js';
import { pricingRepository } from '../infrastructure/repositories/pricing.repository.js';
import { PricePreviewSchema, CreatePricingRuleSchema, CreateSeasonSchema } from './pricing.dto.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';

export async function previewPriceHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = PricePreviewSchema.parse(request.body);
  const result = await pricingService.previewPrice(body);
  return reply.send({ data: result });
}

export async function getRulesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const rules = await pricingRepository.findRules();
  return reply.send({ data: rules });
}

export async function getRuleHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const rule = await pricingRepository.findRuleById(Number(id));
  if (!rule) throw new NotFoundError('Pricing rule');
  return reply.send({ data: rule });
}

export async function createRuleHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreatePricingRuleSchema.parse(request.body);
  const id = await pricingRepository.createRule(body);
  eventBusV2.emit('pricing.rule.created', { ruleId: id, name: body.name } as Record<string, unknown>, {
    aggregateType: 'pricing', aggregateId: String(id), aggregateVersion: 1,
  });
  return reply.status(201).send({ data: { id } });
}

export async function updateRuleHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const existing = await pricingRepository.findRuleById(Number(id));
  if (!existing) throw new NotFoundError('Pricing rule');
  await pricingRepository.updateRule(Number(id), request.body as any);
  eventBusV2.emit('pricing.rule.updated', { ruleId: Number(id) } as Record<string, unknown>, {
    aggregateType: 'pricing', aggregateId: String(id), aggregateVersion: 1,
  });
  return reply.send({ success: true });
}

export async function deleteRuleHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await pricingRepository.deleteRule(Number(id));
  eventBusV2.emit('pricing.rule.deleted', { ruleId: Number(id) } as Record<string, unknown>, {
    aggregateType: 'pricing', aggregateId: String(id), aggregateVersion: 1,
  });
  return reply.send({ success: true });
}

export async function getSeasonsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const seasons = await pricingRepository.findSeasons();
  return reply.send({ data: seasons });
}

export async function createSeasonHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateSeasonSchema.parse(request.body);
  const id = await pricingRepository.createSeason(body);
  return reply.status(201).send({ data: { id } });
}

export async function deleteSeasonHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  await pricingRepository.deleteSeason(Number(id));
  return reply.send({ success: true });
}
