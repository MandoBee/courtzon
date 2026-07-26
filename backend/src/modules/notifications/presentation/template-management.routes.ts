import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './template-management.controller.js';

export async function templateManagementRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  app.get(
    '/admin/templates/options',
    { preHandler: [requirePermission(['notification_templates.view'])] },
    ctrl.optionsHandler,
  );

  app.get(
    '/admin/templates/variables/:typeId',
    { preHandler: [requirePermission(['notification_templates.view'])] },
    ctrl.variablesHandler,
  );

  app.get(
    '/admin/templates',
    { preHandler: [requirePermission(['notification_templates.view'])] },
    ctrl.listHandler,
  );

  app.get(
    '/admin/templates/:id',
    { preHandler: [requirePermission(['notification_templates.view'])] },
    ctrl.getByIdHandler,
  );

  app.post(
    '/admin/templates',
    { preHandler: [requirePermission(['notification_templates.create'])] },
    ctrl.createHandler,
  );

  app.put(
    '/admin/templates/:id',
    { preHandler: [requirePermission(['notification_templates.update'])] },
    ctrl.updateHandler,
  );

  app.delete(
    '/admin/templates/:id',
    { preHandler: [requirePermission(['notification_templates.delete'])] },
    ctrl.deleteHandler,
  );

  app.post(
    '/admin/templates/:id/publish',
    { preHandler: [requirePermission(['notification_templates.publish'])] },
    ctrl.publishHandler,
  );

  app.post(
    '/admin/templates/:id/archive',
    { preHandler: [requirePermission(['notification_templates.update'])] },
    ctrl.archiveHandler,
  );

  app.post(
    '/admin/templates/:id/duplicate',
    { preHandler: [requirePermission(['notification_templates.create'])] },
    ctrl.duplicateHandler,
  );

  app.post(
    '/admin/templates/:id/preview',
    { preHandler: [requirePermission(['notification_templates.view'])] },
    ctrl.previewHandler,
  );
}
