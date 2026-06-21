import type { FastifyInstance } from 'fastify';
import { registerHandler, registerPlayerHandler, registerSellerHandler, registerOrganizationHandler, loginHandler, refreshHandler, logoutHandler, meHandler, updateProfileHandler, forgotPasswordHandler, resetPasswordHandler, checkUniquenessHandler, welcomeSeenHandler, getMyPlayerProfileHandler, requestReactivationHandler, errorHandler } from './auth.controller.js';
import { authMiddleware } from '../../../shared/middleware/auth.middleware.js';
import { requireFeatureFlag } from '../../../shared/middleware/feature-flag.middleware.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', { preHandler: [requireFeatureFlag('app.registration_enabled')], errorHandler }, registerHandler);
  app.post('/auth/register-player', { preHandler: [requireFeatureFlag('player.registration_enabled')], errorHandler }, registerPlayerHandler);
  app.post('/auth/register-seller', { preHandler: [requireFeatureFlag('seller.registration_enabled')], errorHandler }, registerSellerHandler);
  app.post('/auth/register-organization', { preHandler: [requireFeatureFlag('organization.registration_enabled')], errorHandler }, registerOrganizationHandler);
  app.post('/auth/check-uniqueness', { errorHandler }, checkUniquenessHandler);
  app.post('/auth/login', { errorHandler }, loginHandler);
  app.post('/auth/refresh', { errorHandler }, refreshHandler);
  app.post('/auth/logout', { errorHandler }, logoutHandler);
  app.get('/auth/me', { errorHandler }, meHandler);
  app.patch('/auth/profile', { preHandler: [authMiddleware], errorHandler }, updateProfileHandler);
  app.patch('/my/welcome-seen', { preHandler: [authMiddleware], errorHandler }, welcomeSeenHandler);
  app.get('/my/player-profile', { preHandler: [authMiddleware], errorHandler }, getMyPlayerProfileHandler);
  app.post('/auth/request-reactivation', { errorHandler }, requestReactivationHandler);
  app.post('/auth/forgot-password', { errorHandler }, forgotPasswordHandler);
  app.post('/auth/reset-password', { errorHandler }, resetPasswordHandler);
}
