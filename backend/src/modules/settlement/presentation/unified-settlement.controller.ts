import type { FastifyRequest, FastifyReply } from 'fastify';
import { unifiedSettlementService as svc } from '../application/unified-settlement.service.js';
import { recordAudit } from '../../audit-log/index.js';
import {
  SettlementPreviewQuerySchema, CreateSettlementSchema, RecordPaymentSchema,
  CancelSettlementSchema, SettlementListQuerySchema,
} from './unified-settlement.dto.js';

export async function previewSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = SettlementPreviewQuerySchema.parse(request.query);
  const result = await svc.preview(query.orgId, query.exclude);
  return reply.send(result);
}

export async function createSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CreateSettlementSchema.parse(request.body);
  const userId = (request as any).userId;
  const detail = await svc.create({
    orgId: body.orgId,
    excludeEntitlementIds: body.excludeEntitlementIds,
    selectedEntitlementIds: body.selectedEntitlementIds,
    batchCode: body.batchCode,
    requestedBy: userId,
    requestedByRole: 'admin',
    notes: body.notes,
  });
  recordAudit({ actorId: userId, action: 'SETTLEMENT.CREATE', entityType: 'settlement', entityId: detail.settlement.id, afterState: { orgId: body.orgId, net: detail.settlement.net_amount, direction: detail.settlement.settlement_direction } });
  return reply.status(201).send(detail);
}

export async function getSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const detail = await svc.get(Number(id));
  return reply.send(detail);
}

export async function recordSettlementPaymentHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = RecordPaymentSchema.parse(request.body ?? {});
  const userId = (request as any).userId;
  const detail = await svc.recordPayment(Number(id), { ...body, paidBy: userId });
  recordAudit({ actorId: userId, action: 'SETTLEMENT.PAY', entityType: 'settlement', entityId: detail.settlement.id, afterState: { status: detail.settlement.settlement_status } });
  return reply.send(detail);
}

export async function cancelSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const body = CancelSettlementSchema.parse(request.body ?? {});
  const userId = (request as any).userId;
  const detail = await svc.cancel(Number(id), userId, body.reason);
  recordAudit({ actorId: userId, action: 'SETTLEMENT.CANCEL', entityType: 'settlement', entityId: detail.settlement.id, afterState: { status: detail.settlement.settlement_status } });
  return reply.send(detail);
}

export async function listSettlementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = SettlementListQuerySchema.parse(request.query);
  const result = await svc.list(query);
  return reply.send(result);
}