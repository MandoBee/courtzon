import type { FastifyRequest, FastifyReply } from 'fastify';
import { financialAdminService } from '../application/financial-admin.service.js';
import { WithdrawalRequestQuerySchema, WithdrawalActionSchema } from './financial-admin.dto.js';

export async function listWithdrawalRequestsHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = WithdrawalRequestQuerySchema.parse(request.query);
  const result = await financialAdminService.listWithdrawalRequests(query);
  return reply.send(result);
}

export async function getWithdrawalRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const result = await financialAdminService.getWithdrawalRequest(Number(id));
  return reply.send(result);
}

export async function approveWithdrawalRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = WithdrawalActionSchema.parse(request.body);
  const userId = (request as any).userId;
  const result = await financialAdminService.approveWithdrawalRequest(body.id, userId, body.notes);
  return reply.send(result);
}

export async function rejectWithdrawalRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = WithdrawalActionSchema.parse(request.body);
  const userId = (request as any).userId;
  const result = await financialAdminService.rejectWithdrawalRequest(body.id, userId, body.notes);
  return reply.send(result);
}

export async function completeWithdrawalRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = WithdrawalActionSchema.parse(request.body);
  const userId = (request as any).userId;
  const result = await financialAdminService.completeWithdrawalRequest(body.id, userId, body.notes);
  return reply.send(result);
}

export async function listTransactionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { page = 1, limit = 20, type, orgId, search, from, to } = request.query as any;
  const result = await financialAdminService.listTransactions({
    page: Number(page),
    limit: Number(limit),
    type: type || undefined,
    orgId: orgId ? Number(orgId) : undefined,
    search: search || undefined,
    from: from || undefined,
    to: to || undefined,
  });
  return reply.send(result);
}

export async function getTransactionHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const result = await financialAdminService.getTransaction(Number(id));
  return reply.send(result);
}

export async function listOrganisationsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { search } = request.query as any;
  const result = await financialAdminService.listOrganisations(search);
  return reply.send(result);
}
