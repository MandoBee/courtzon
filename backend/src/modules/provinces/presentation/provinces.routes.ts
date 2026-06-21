import type { FastifyInstance } from 'fastify';
import { authMiddleware, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './provinces.controller.js';

export async function provincesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/provinces', ctrl.listProvincesHandler);
  app.get('/provinces/:id', ctrl.getProvinceHandler);
  app.get('/countries/:countryId/provinces', ctrl.listProvincesByCountryHandler);
  app.post('/provinces', { preHandler: [adminGuard] }, ctrl.createProvinceHandler);
  app.put('/provinces/:id', { preHandler: [adminGuard] }, ctrl.updateProvinceHandler);
  app.delete('/provinces/:id', { preHandler: [adminGuard] }, ctrl.deleteProvinceHandler);
}
