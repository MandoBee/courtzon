import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './app-settings.controller.js';

export async function appSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get(
    '/admin/app-settings',
    { preHandler: [adminGuard, requirePermission(['app-settings.view'])] },
    ctrl.listAppSettingsHandler,
  );

  app.get('/public/app-settings', ctrl.getPublicAppSettingsHandler);

  app.put(
    '/admin/app-settings',
    { preHandler: [adminGuard, requirePermission(['app-settings.edit'])] },
    ctrl.updateAppSettingsHandler,
  );

  app.get(
    '/admin/app-settings/image-specs/:assetType',
    { preHandler: [adminGuard, requirePermission(['app-settings.view'])] },
    ctrl.getBrandImageSpecHandler,
  );

  app.post(
    '/admin/app-settings/upload/:assetType',
    { preHandler: [adminGuard, requirePermission(['app-settings.edit'])] },
    ctrl.uploadBrandImageHandler,
  );
}
