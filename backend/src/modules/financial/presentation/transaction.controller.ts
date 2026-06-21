import type { FastifyRequest, FastifyReply } from 'fastify';
import { transactionService } from '../application/transaction.service.js';
import { TransactionQuerySchema } from './transaction.dto.js';

export async function getUserTransactions(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  const query = TransactionQuerySchema.parse(request.query);
  const result = await transactionService.getUserTransactions(userId, query.page, query.limit);
  return reply.send(result);
}

export async function getBranchTransactions(request: FastifyRequest, reply: FastifyReply) {
  const branchId = parseInt((request.params as any).branchId);
  const query = TransactionQuerySchema.parse(request.query);
  const result = await transactionService.getBranchTransactions(branchId, query.page, query.limit);
  return reply.send(result);
}

export async function getTransaction(request: FastifyRequest, reply: FastifyReply) {
  const id = parseInt((request.params as any).id);
  const txn = await transactionService.getTransaction(id);
  if (!txn) return reply.status(404).send({ error: 'Transaction not found' });
  return reply.send(txn);
}
