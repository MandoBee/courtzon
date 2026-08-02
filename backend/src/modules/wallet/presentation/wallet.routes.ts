import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './wallet.controller.js';

export async function walletRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/wallets/me', { preHandler: [requirePermission(['financial.wallet.view'])] }, ctrl.getMyWalletHandler);
  app.get('/wallets/my', { preHandler: [requirePermission(['financial.wallet.view'])] }, ctrl.getMyWalletHandler);
  app.post('/wallets/deposit', { preHandler: [requirePermission(['financial.wallet.deposit'])] }, ctrl.depositHandler);
  app.post('/wallets/withdraw', { preHandler: [requirePermission(['financial.withdraw'])] }, ctrl.withdrawHandler);
  app.get('/wallets/transactions', { preHandler: [requirePermission(['financial.wallet.view'])] }, ctrl.getTransactionsHandler);
  app.get('/wallets/my/transactions', { preHandler: [requirePermission(['financial.wallet.view'])] }, ctrl.getTransactionsHandler);
}
