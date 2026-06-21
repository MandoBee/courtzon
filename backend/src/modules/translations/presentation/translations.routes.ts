import type { FastifyInstance } from 'fastify';
import { authMiddleware, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './translations.controller.js';

export async function translationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/public/translations/:locale', ctrl.getPublicTranslationsHandler);

  app.addHook('preHandler', authMiddleware);

  app.get('/translations/grid', { preHandler: [adminGuard] }, ctrl.listTranslationsGridHandler);
  app.get('/translations/modules', { preHandler: [adminGuard] }, ctrl.listTranslationModulesHandler);
  app.get('/translations/element-types', { preHandler: [adminGuard] }, ctrl.listTranslationElementTypesHandler);
  app.post('/translations/sync-keys', { preHandler: [adminGuard] }, ctrl.syncTranslationKeysHandler);
  app.post('/translations/locale-pack', { preHandler: [adminGuard] }, ctrl.createLocalePackHandler);
  app.post('/translations/locale-pack/sync', { preHandler: [adminGuard] }, ctrl.syncLocalePackHandler);
  app.get('/translations/locale-pack/:locale', { preHandler: [adminGuard] }, ctrl.getLocalePackHandler);
  app.get('/translations', { preHandler: [adminGuard] }, ctrl.listTranslationsHandler);
  app.get('/translations/export', { preHandler: [adminGuard] }, ctrl.exportTranslationsHandler);
  app.get('/translations/locales', { preHandler: [adminGuard] }, ctrl.listLocalesHandler);
  app.get('/translations/keys', { preHandler: [adminGuard] }, ctrl.listKeysHandler);
  app.get('/translations/:id', { preHandler: [adminGuard] }, ctrl.getTranslationHandler);
  app.post('/translations', { preHandler: [adminGuard] }, ctrl.createTranslationHandler);
  app.post('/translations/upsert', { preHandler: [adminGuard] }, ctrl.upsertTranslationHandler);
  app.put('/translations/:id', { preHandler: [adminGuard] }, ctrl.updateTranslationHandler);
  app.delete('/translations/:id', { preHandler: [adminGuard] }, ctrl.deleteTranslationHandler);
}
