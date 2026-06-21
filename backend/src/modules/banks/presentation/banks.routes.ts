import type { FastifyInstance } from 'fastify';
import { authMiddleware, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './banks.controller.js';

export async function banksRoutes(app: FastifyInstance) {
  app.get('/banks', { preHandler: [authMiddleware] }, ctrl.listBanksHandler);
  app.get('/banks/:id', { preHandler: [authMiddleware] }, ctrl.getBankHandler);
  app.post('/banks', { preHandler: [authMiddleware, adminGuard] }, ctrl.createBankHandler);
  app.put('/banks/:id', { preHandler: [authMiddleware, adminGuard] }, ctrl.updateBankHandler);
  app.delete('/banks/:id', { preHandler: [authMiddleware, adminGuard] }, ctrl.deleteBankHandler);

  app.get('/bank-branches', { preHandler: [authMiddleware] }, ctrl.listBranchesHandler);
  app.get('/bank-branches/:id', { preHandler: [authMiddleware] }, ctrl.getBranchHandler);
  app.post('/bank-branches', { preHandler: [authMiddleware, adminGuard] }, ctrl.createBranchHandler);
  app.put('/bank-branches/:id', { preHandler: [authMiddleware, adminGuard] }, ctrl.updateBranchHandler);
  app.delete('/bank-branches/:id', { preHandler: [authMiddleware, adminGuard] }, ctrl.deleteBranchHandler);
}
