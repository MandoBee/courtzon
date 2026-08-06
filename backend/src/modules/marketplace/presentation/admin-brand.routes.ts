import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './admin-brand.controller.js';

export async function adminBrandRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/admin/brands', { preHandler: [requirePermission(['brands.view'])] }, ctrl.listBrandsHandler);
  app.get('/admin/brands/:id', { preHandler: [requirePermission(['brands.view'])] }, ctrl.getBrandHandler);
  app.post('/admin/brands', { preHandler: [requirePermission(['brands.manage'])] }, ctrl.createBrandHandler);
  app.put('/admin/brands/:id', { preHandler: [requirePermission(['brands.manage'])] }, ctrl.updateBrandHandler);
  app.delete('/admin/brands/:id', { preHandler: [requirePermission(['brands.manage'])] }, ctrl.deleteBrandHandler);
}
