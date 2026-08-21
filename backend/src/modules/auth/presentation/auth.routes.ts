import type { FastifyInstance } from 'fastify';
import { registerHandler, registerPlayerHandler, registerSellerHandler, registerOrganizationHandler, loginHandler, refreshHandler, logoutHandler, meHandler, updateProfileHandler, forgotPasswordHandler, resetPasswordHandler, checkUniquenessHandler, welcomeSeenHandler, getMyPlayerProfileHandler, requestReactivationHandler, temporaryVerifyEmailHandler, temporaryResetPasswordHandler, errorHandler } from './auth.controller.js';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { env } from '../../../config/env.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authRoutes(app: FastifyInstance, opts: { requireFeatureFlag: (key: string) => (req: FastifyRequest, reply: FastifyReply) => Promise<void> }): Promise<void> {
  app.post('/auth/register', { preHandler: [opts.requireFeatureFlag('app.registration_enabled')], errorHandler }, registerHandler);
  app.post('/auth/register-player', { preHandler: [opts.requireFeatureFlag('player.registration_enabled')], errorHandler }, registerPlayerHandler);
  app.post('/auth/register-seller', { preHandler: [opts.requireFeatureFlag('seller.registration_enabled')], errorHandler }, registerSellerHandler);
  app.post('/auth/register-organization', { preHandler: [opts.requireFeatureFlag('organization.registration_enabled')], errorHandler }, registerOrganizationHandler);
  app.post('/auth/check-uniqueness', { errorHandler }, checkUniquenessHandler);
  app.post('/auth/login', { errorHandler }, loginHandler);
  app.post('/auth/refresh', { errorHandler }, refreshHandler);
  app.post('/auth/logout', { errorHandler }, logoutHandler);
  app.get('/auth/me', { errorHandler }, meHandler);
  app.patch('/auth/profile', { preHandler: [authMiddleware, requirePermission(['profile.edit'])], errorHandler }, updateProfileHandler);
  app.patch('/my/welcome-seen', { preHandler: [authMiddleware, requirePermission(['profile.welcome-seen'])], errorHandler }, welcomeSeenHandler);
  app.get('/my/player-profile', { preHandler: [authMiddleware, requirePermission(['player.profile.view'])], errorHandler }, getMyPlayerProfileHandler);
  app.post('/auth/request-reactivation', { errorHandler }, requestReactivationHandler);
  app.post('/auth/forgot-password', { errorHandler }, forgotPasswordHandler);
  app.post('/auth/reset-password', { errorHandler }, resetPasswordHandler);

  /**
   * Temporary password reset routes.
   * TODO: Replace with email verification flow when email service is enabled.
   *
   * Secured by default: these routes are unauthenticated and reset a password by
   * email alone, so they require BOTH an explicit environment opt-in
   * (AUTH_TEMPORARY_RESET_ENABLED=true) AND the DB feature flag to be enabled.
   * In production the env opt-in is off by default, denying these routes regardless
   * of the DB flag value.
   */
  const requireTemporaryResetEnabled = async (_request: FastifyRequest, reply: FastifyReply) => {
    if (env.AUTH_TEMPORARY_RESET_ENABLED !== 'true') {
      throw new ForbiddenError('This feature is currently disabled');
    }
    await opts.requireFeatureFlag('auth.temporary_password_reset_enabled')(_request, reply);
  };

  app.post('/auth/temporary-reset/verify', {
    preHandler: [requireTemporaryResetEnabled],
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    errorHandler,
  }, temporaryVerifyEmailHandler);

  app.post('/auth/temporary-reset', {
    preHandler: [requireTemporaryResetEnabled],
    config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
    errorHandler,
  }, temporaryResetPasswordHandler);
}
