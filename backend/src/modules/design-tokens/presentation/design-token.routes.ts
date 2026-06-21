import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './design-token.controller.js';

/** Public, unauthenticated theme endpoint consumed by the app on boot. */
export async function publicThemeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/public/theme', ctrl.getPublicThemeHandler);
}

/** Role-scoped appearance for users with appearance.role-customize */
export async function appearanceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  app.get(
    '/appearance/theme',
    { preHandler: [requirePermission(['appearance.role-customize'])] },
    ctrl.getMyThemeHandler,
  );
  app.put(
    '/appearance/my-theme',
    { preHandler: [requirePermission(['appearance.role-customize'])] },
    ctrl.saveMyThemeHandler,
  );
}

export async function designTokenRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);
  app.addHook('preHandler', requirePermission(['design-tokens.view']));

  // Appearance Studio (global theming)
  app.get('/design-tokens/studio', ctrl.getThemeStudioHandler);
  app.put(
    '/design-tokens/theme',
    { preHandler: [requirePermission(['design-tokens.edit'])] },
    ctrl.saveThemeDraftHandler,
  );
  app.post(
    '/design-tokens/publish',
    { preHandler: [requirePermission(['design-tokens.publish'])] },
    ctrl.publishThemeHandler,
  );
  app.post(
    '/design-tokens/rollback/:versionId',
    { preHandler: [requirePermission(['design-tokens.rollback'])] },
    ctrl.rollbackThemeHandler,
  );
  app.put(
    '/design-tokens/role-editable',
    { preHandler: [requirePermission(['design-tokens.edit'])] },
    ctrl.saveRoleEditableHandler,
  );
  app.post(
    '/design-tokens/reset-baseline',
    { preHandler: [requirePermission(['design-tokens.edit'])] },
    ctrl.saveResetBaselineHandler,
  );
  app.post(
    '/design-tokens/restore-baseline',
    { preHandler: [requirePermission(['design-tokens.edit'])] },
    ctrl.restoreResetBaselineHandler,
  );
  app.get(
    '/design-tokens/role-theme/:roleId',
    { preHandler: [requirePermission(['design-tokens.edit'])] },
    ctrl.getRoleThemeHandler,
  );
  app.put(
    '/design-tokens/role-theme/:roleId',
    { preHandler: [requirePermission(['design-tokens.edit'])] },
    ctrl.saveRoleThemeHandler,
  );

  // Legacy raw token CRUD
  app.get('/design-tokens', ctrl.listTokensHandler);
  app.get('/design-tokens/:id', ctrl.getTokenHandler);
  app.post('/design-tokens', { preHandler: [requirePermission(['design-tokens.create'])] }, ctrl.createTokenHandler);
  app.put('/design-tokens/:id', { preHandler: [requirePermission(['design-tokens.edit'])] }, ctrl.updateTokenHandler);
  app.delete('/design-tokens/:id', { preHandler: [requirePermission(['design-tokens.delete'])] }, ctrl.deleteTokenHandler);
}
