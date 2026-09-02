import type { FastifyRequest, FastifyReply } from 'fastify';
import { gatewaySettlementService as svc } from '../application/gateway-settlement.service.js';
import { recordAudit } from '../../audit-log/index.js';
import { ConflictError } from '../../../shared/errors/app-error.js';

export async function listEligibleGatewaySettlementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const eligible = await svc.listEligible();
  return reply.send({ data: eligible });
}

export async function createGatewaySettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const userId = (request as any).userId;
  const ids = Array.isArray(body?.paymentTransactionIds) ? body.paymentTransactionIds.map(Number) : [];
  if (ids.length === 0) {
    throw new ConflictError('Select at least one eligible payment transaction to settle');
  }
  const detail = await svc.create({
    paymentTransactionIds: ids,
    settledBy: userId,
    notes: body?.notes || null,
  });
  recordAudit({
    actorId: userId,
    action: 'GATEWAY_SETTLEMENT.CREATE',
    entityType: 'gateway_settlement',
    entityId: detail.settlement.id,
    afterState: {
      batchCode: detail.settlement.batch_code,
      gross: detail.settlement.gross_amount,
      gatewayFee: detail.settlement.gateway_fee_amount,
      net: detail.settlement.net_amount,
      transactionCount: detail.transactions.length,
    },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(detail);
}

export async function listGatewaySettlementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const result = await svc.list({
    page: Number(query.page) || 1,
    limit: Number(query.limit) || 20,
    status: query.status || undefined,
  });
  return reply.send(result);
}

export async function getGatewaySettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const detail = await svc.get(Number(id));
  return reply.send(detail);
}

export async function reverseGatewaySettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason) {
    throw new ConflictError('A reversal reason is required');
  }
  const detail = await svc.reverse({
    settlementId: Number(id),
    reversedBy: userId,
    reason,
  });
  recordAudit({
    actorId: userId,
    action: 'GATEWAY_SETTLEMENT.REVERSE',
    entityType: 'gateway_settlement',
    entityId: detail.settlement.id,
    afterState: {
      batchCode: detail.settlement.batch_code,
      status: detail.settlement.settlement_status,
      gross: detail.settlement.gross_amount,
      gatewayFee: detail.settlement.gateway_fee_amount,
      net: detail.settlement.net_amount,
      reversalReference: detail.settlement.reversal_reference,
      reversalReason: detail.settlement.reversal_reason,
      transactionCount: detail.transactions.length,
      originalJournalPreserved: true,
    },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send(detail);
}