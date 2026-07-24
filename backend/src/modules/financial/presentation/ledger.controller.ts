import type { FastifyRequest, FastifyReply } from 'fastify';
import { ledgerService } from '../application/ledger.service.js';
import { financialSettlementService } from '../application/settlement.service.js';
import { ledgerRepository } from '../infrastructure/repositories/ledger.repository.js';
import { RevenueQuerySchema, LedgerQuerySchema, CreateSettlementSchema } from './ledger.dto.js';

export async function getRevenueHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = RevenueQuerySchema.parse(request.query);
  const data = await ledgerService.getRevenue(query.from, query.to);
  return reply.send({ data });
}

export async function getLedgerHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = LedgerQuerySchema.parse(request.query);
  const data = await ledgerRepository.findByDateRange(query.from, query.to, query.accountType);
  return reply.send({ data });
}

export async function getSettlementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const data = await ledgerService.getSettlements({
    status: query.status,
    from: query.from,
    to: query.to,
  });
  return reply.send({ data });
}

export async function createSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateSettlementSchema.parse(request.body);
  const id = await financialSettlementService.generateBatch(
    body.batchType,
    body.periodStart,
    body.periodEnd,
    body.organisationId,
  );
  return reply.status(201).send({ data: { id } });
}

export async function getEntryHandler(request: FastifyRequest, reply: FastifyReply) {
  const { sourceType, sourceId } = request.params as any;
  const data = await ledgerRepository.findBySource(sourceType, Number(sourceId));
  return reply.send({ data });
}
