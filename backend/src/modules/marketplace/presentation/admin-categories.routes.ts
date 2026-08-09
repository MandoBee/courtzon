import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './admin-categories.controller.js';

export async function adminCategoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/admin/product-categories', { preHandler: [requirePermission(['product-categories.view'])] }, ctrl.listCategoriesHandler);
  app.get('/admin/product-categories/:id', { preHandler: [requirePermission(['product-categories.view'])] }, ctrl.getCategoryHandler);
  app.post('/admin/product-categories', { preHandler: [requirePermission(['product-categories.manage'])] }, ctrl.createCategoryHandler);
  app.put('/admin/product-categories/:id', { preHandler: [requirePermission(['product-categories.manage'])] }, ctrl.updateCategoryHandler);
  app.delete('/admin/product-categories/:id', { preHandler: [requirePermission(['product-categories.manage'])] }, ctrl.deleteCategoryHandler);
}
