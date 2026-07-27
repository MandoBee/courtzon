import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './mobile.controller.js';

export async function mobileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // Push Tokens
  app.post('/mobile/push/register', ctrl.registerPushTokenHandler);
  app.delete('/mobile/push/unregister', ctrl.unregisterPushTokenHandler);
  app.get('/mobile/push/tokens', ctrl.listPushTokensHandler);

  // App Versions
  app.get('/mobile/versions', ctrl.getLatestVersionHandler);
  app.get('/admin/mobile/versions', { preHandler: [requirePermission(['mobile.versions.view'])] }, ctrl.listAppVersionsHandler);
  app.post('/admin/mobile/versions', { preHandler: [requirePermission(['mobile.versions.manage'])] }, ctrl.createAppVersionHandler);
  app.put('/admin/mobile/versions/:id', { preHandler: [requirePermission(['mobile.versions.manage'])] }, ctrl.updateAppVersionHandler);

  // App Settings (Remote Config)
  app.get('/mobile/config', ctrl.getAppConfigHandler);
  app.get('/admin/mobile/config', { preHandler: [requirePermission(['mobile.config.view'])] }, ctrl.listAppConfigHandler);
  app.put('/admin/mobile/config/:id', { preHandler: [requirePermission(['mobile.config.manage'])] }, ctrl.updateAppConfigHandler);
  app.post('/admin/mobile/config', { preHandler: [requirePermission(['mobile.config.manage'])] }, ctrl.createAppConfigHandler);

  // Push Log
  app.get('/admin/mobile/push-log', { preHandler: [requirePermission(['mobile.push.view'])] }, ctrl.getPushLogHandler);

  // Dashboard
  app.get('/admin/mobile/dashboard', { preHandler: [requirePermission(['mobile.dashboard.view'])] }, ctrl.getMobileDashboardHandler);
}
