import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './wallet.controller.js';

export async function walletRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/wallets/me', ctrl.getMyWalletHandler);
  app.post('/wallets/deposit', ctrl.depositHandler);
  app.post('/wallets/withdraw', { preHandler: [requirePermission(['financial.withdraw'])] }, ctrl.withdrawHandler);
  app.get('/wallets/transactions', ctrl.getTransactionsHandler);
}
