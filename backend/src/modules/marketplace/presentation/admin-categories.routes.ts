import type { FastifyInstance } from 'fastify';
import { authMiddleware, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './admin-categories.controller.js';

export async function adminCategoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/admin/product-categories', ctrl.listCategoriesHandler);
  app.get('/admin/product-categories/:id', ctrl.getCategoryHandler);
  app.post('/admin/product-categories', { preHandler: [adminGuard] }, ctrl.createCategoryHandler);
  app.put('/admin/product-categories/:id', { preHandler: [adminGuard] }, ctrl.updateCategoryHandler);
  app.delete('/admin/product-categories/:id', { preHandler: [adminGuard] }, ctrl.deleteCategoryHandler);
}
