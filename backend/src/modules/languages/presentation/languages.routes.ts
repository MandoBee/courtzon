import type { FastifyInstance } from 'fastify';
import { authMiddleware, adminGuard } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './languages.controller.js';

export async function languagesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/public/languages', ctrl.listPublicLanguagesHandler);

  app.addHook('preHandler', authMiddleware);

  app.get('/languages', ctrl.listLanguagesHandler);
  app.get('/languages/:id', ctrl.getLanguageHandler);
  app.post('/languages', { preHandler: [adminGuard] }, ctrl.createLanguageHandler);
  app.put('/languages/:id', { preHandler: [adminGuard] }, ctrl.updateLanguageHandler);
  app.delete('/languages/:id', { preHandler: [adminGuard] }, ctrl.deleteLanguageHandler);
}
