import type { FastifyInstance } from 'fastify';
import { getUserTransactions, getBranchTransactions, getTransaction } from './transaction.controller.js';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';

export async function transactionRoutes(app: FastifyInstance): Promise<void> {
  app.get('/transactions', { preHandler: [authMiddleware, requirePermission(['financial.wallet.view'])] }, getUserTransactions);
  app.get('/transactions/:id', { preHandler: [authMiddleware, requirePermission(['financial.wallet.view'])] }, getTransaction);
  app.get('/branches/:branchId/transactions', { preHandler: [authMiddleware, requirePermission(['financial.reconcile'])] }, getBranchTransactions);
}
