import type { FastifyInstance } from 'fastify';
import { authMiddleware, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './countries.controller.js';

export async function countriesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/countries', ctrl.listCountriesHandler);
  app.get('/countries/:id', ctrl.getCountryHandler);
  app.post('/countries', { preHandler: [adminGuard] }, ctrl.createCountryHandler);
  app.put('/countries/:id', { preHandler: [adminGuard] }, ctrl.updateCountryHandler);
  app.delete('/countries/:id', { preHandler: [adminGuard] }, ctrl.deleteCountryHandler);
}
