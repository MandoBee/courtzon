import type { FastifyInstance } from 'fastify';
import { getUserTransactions, getBranchTransactions, getTransaction } from './transaction.controller.js';
import { authMiddleware } from '../../../shared/middleware/auth.middleware.js';

export async function transactionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/transactions', { preHandler: [authMiddleware] }, getUserTransactions);
  app.get('/transactions/:id', { preHandler: [authMiddleware] }, getTransaction);
  app.get('/branches/:branchId/transactions', { preHandler: [authMiddleware] }, getBranchTransactions);
}
