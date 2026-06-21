import type { FastifyRequest, FastifyReply } from 'fastify';
import { settlementService } from '../application/settlement.service.js';

export async function requestSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { organisationId, branchId } = request.body as any;
  const userId = (request as any).user?.id;
  const userRole = (request as any).user?.role || 'admin';
  const result = await settlementService.requestSettlement({
    organisationId,
    branchId,
    requestedBy: userId,
    requestedByRole: userRole,
  });
  return reply.status(201).send(result);
}

export async function approveSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { notes } = request.body as any || {};
  const userId = (request as any).user?.id;
  const result = await settlementService.approveSettlement(Number(id), userId, notes);
  return reply.send(result);
}

export async function markPaidHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { bankAccountId, transferReference } = request.body as any || {};
  const result = await settlementService.markPaid(Number(id), bankAccountId, transferReference);
  return reply.send(result);
}

export async function completeSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const result = await settlementService.completeSettlement(Number(id));
  return reply.send(result);
}

export async function rejectSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { reason } = request.body as any || {};
  const result = await settlementService.rejectSettlement(Number(id), reason || 'Rejected');
  return reply.send(result);
}

export async function cancelSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { reason } = request.body as any || {};
  const result = await settlementService.cancelSettlement(Number(id), reason);
  return reply.send(result);
}

export async function getSettlementHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const result = await settlementService.getSettlementDetail(Number(id));
  return reply.send(result);
}

export async function getSettlementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const result = await settlementService.getSettlements({
    status: query.status,
    orgId: query.orgId ? Number(query.orgId) : undefined,
    branchId: query.branchId ? Number(query.branchId) : undefined,
    from: query.from,
    to: query.to,
    page: Number(query.page || 1),
    limit: Number(query.limit || 20),
  });
  return reply.send(result);
}

export async function getOrgSettlementsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { organisationId } = request.params as any;
  const { page = 1, limit = 20 } = request.query as any;
  const result = await settlementService.getOrganisationSettlements(
    Number(organisationId), Number(page), Number(limit)
  );
  return reply.send(result);
}
