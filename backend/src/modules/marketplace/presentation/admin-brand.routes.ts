import type { FastifyInstance } from 'fastify';
import { authMiddleware, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './admin-brand.controller.js';

export async function adminBrandRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/admin/brands', ctrl.listBrandsHandler);
  app.get('/admin/brands/:id', ctrl.getBrandHandler);
  app.post('/admin/brands', { preHandler: [adminGuard] }, ctrl.createBrandHandler);
  app.put('/admin/brands/:id', { preHandler: [adminGuard] }, ctrl.updateBrandHandler);
  app.delete('/admin/brands/:id', { preHandler: [adminGuard] }, ctrl.deleteBrandHandler);
}
