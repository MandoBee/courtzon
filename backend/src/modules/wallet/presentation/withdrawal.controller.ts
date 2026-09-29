import type { FastifyRequest, FastifyReply } from 'fastify';
import { withdrawalService } from '../application/withdrawal.service.js';
import { walletWithdrawalReconciliationService } from '../../financial/application/wallet-withdrawal-reconciliation.service.js';
import { z } from 'zod';

// G11.6 — validated payout channel captured at submission (default bank_transfer
// so the legacy POST /wallets/withdraw path remains compatible).
const SubmitSchema = z.object({ amount: z.number().positive(), reason: z.string().min(1).max(500), playerNotes: z.string().optional(), method: z.enum(['bank_transfer', 'cash']).default('bank_transfer') });
const TransitionSchema = z.object({ resolutionNotes: z.string().optional(), rejectionReason: z.string().optional(), executionMethod: z.string().optional(), referenceNumber: z.string().optional() });

export async function submitWithdrawalHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const body = SubmitSchema.parse(request.body);
  const result = await withdrawalService.submit(userId, body.amount, body.reason, body.playerNotes, body.method);
  return reply.status(201).send({ data: result });
}

export async function listMyWithdrawalsHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const rows = await withdrawalService.listByUser(userId);
  return reply.send({ data: rows });
}

export async function getMyWithdrawalHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const { id } = request.params as any;
  const row = await withdrawalService.getById(Number(id));
  if (row.user_id !== userId) return reply.status(404).send({ error: 'NOT_FOUND' });
  return reply.send({ data: row });
}

export async function adminListWithdrawalsHandler(request: FastifyRequest, reply: FastifyReply) {
  const { status, search, page, limit } = request.query as any;
  const result = await withdrawalService.list({ status, search, page: Number(page)||1, limit: Number(limit)||20 });
  return reply.send(result);
}

export async function adminGetWithdrawalHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const row = await withdrawalService.getById(Number(id));
  return reply.send({ data: row });
}

export async function adminTransitionWithdrawalHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { toStatus } = request.body as any;
  const actorId = (request as any).userId;
  const body = TransitionSchema.parse(request.body);
  const result = await withdrawalService.transition(Number(id), toStatus, actorId, body);
  return reply.send({ data: result });
}

export async function withdrawalStatsHandler(request: FastifyRequest, reply: FastifyReply) {
  const stats = await withdrawalService.getStats();
  return reply.send({ data: stats });
}

export async function assignWithdrawalHandler(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as any;
  const { assignedTo } = request.body as any;
  const actorId = (request as any).userId;
  await withdrawalService.assign(Number(id), Number(assignedTo), actorId);
  return reply.send({ data: { success: true } });
}

export async function listAssignableAdminsHandler(request: FastifyRequest, reply: FastifyReply) {
  const admins = await withdrawalService.listAssignableAdmins();
  return reply.send({ data: admins });
}

// G11.6 — READ-ONLY wallet/withdrawal reconciliation report (financial.reconcile).
export async function withdrawalReconciliationHandler(request: FastifyRequest, reply: FastifyReply) {
  const report = await walletWithdrawalReconciliationService.run();
  return reply.send({ data: report });
}
