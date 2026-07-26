import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './notification-type.controller.js';

export async function notificationTypeRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get(
    '/admin/notification-types',
    { preHandler: [requirePermission(['notification_types.view'])] },
    ctrl.listHandler,
  );

  app.get(
    '/admin/notification-types/options',
    { preHandler: [requirePermission(['notification_types.view'])] },
    ctrl.optionsHandler,
  );

  app.get(
    '/admin/notification-types/:id',
    { preHandler: [requirePermission(['notification_types.view'])] },
    ctrl.getByIdHandler,
  );

  app.post(
    '/admin/notification-types',
    { preHandler: [requirePermission(['notification_types.create'])] },
    ctrl.createHandler,
  );

  app.put(
    '/admin/notification-types/:id',
    { preHandler: [requirePermission(['notification_types.update'])] },
    ctrl.updateHandler,
  );

  app.delete(
    '/admin/notification-types/:id',
    { preHandler: [requirePermission(['notification_types.delete'])] },
    ctrl.deleteHandler,
  );
}
