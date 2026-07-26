import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './communication-preference.controller.js';

export async function communicationPreferenceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get('/communication/preferences', ctrl.getHandler);
  app.put('/communication/preferences', ctrl.updateHandler);
  app.get('/communication/quiet-hours', ctrl.getQuietHoursHandler);
  app.put('/communication/quiet-hours', ctrl.upsertQuietHoursHandler);
}
