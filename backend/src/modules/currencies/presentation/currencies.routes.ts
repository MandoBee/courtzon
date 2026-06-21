import type { FastifyInstance } from 'fastify';
import { authMiddleware, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './currencies.controller.js';

export async function currenciesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/currencies', ctrl.listCurrenciesHandler);
  app.get('/currencies/:id', ctrl.getCurrencyHandler);
  app.post('/currencies', { preHandler: [adminGuard] }, ctrl.createCurrencyHandler);
  app.put('/currencies/:id', { preHandler: [adminGuard] }, ctrl.updateCurrencyHandler);
  app.delete('/currencies/:id', { preHandler: [adminGuard] }, ctrl.deleteCurrencyHandler);
}
