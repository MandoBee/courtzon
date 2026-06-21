import type { FastifyInstance } from 'fastify';
import { authMiddleware, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './cities.controller.js';

export async function citiesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/cities', ctrl.listCitiesHandler);
  app.get('/cities/:id', ctrl.getCityHandler);
  app.get('/provinces/:provinceId/cities', ctrl.listCitiesByProvinceHandler);
  app.post('/cities', { preHandler: [adminGuard] }, ctrl.createCityHandler);
  app.put('/cities/:id', { preHandler: [adminGuard] }, ctrl.updateCityHandler);
  app.delete('/cities/:id', { preHandler: [adminGuard] }, ctrl.deleteCityHandler);
}
