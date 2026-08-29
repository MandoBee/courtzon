import type { FastifyInstance } from 'fastify';
import { registerHandler, registerPlayerHandler, registerSellerHandler, registerOrganizationHandler, loginHandler, refreshHandler, logoutHandler, meHandler, updateProfileHandler, forgotPasswordHandler, resetPasswordHandler, checkUniquenessHandler, welcomeSeenHandler, getMyPlayerProfileHandler, requestReactivationHandler, temporaryVerifyEmailHandler, temporaryResetPasswordHandler, errorHandler } from './auth.controller.js';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { env } from '../../../config/env.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

export async function authRoutes(app: FastifyInstance, opts: { requireFeatureFlag: (key: string) => (req: FastifyRequest, reply: FastifyReply) => Promise<void> }): Promise<void> {
  // P1-1: auth mutation routes get per-route rate limits (config.rateLimit
  // overrides the global 100/min/IP limit for that route only). Chosen
  // conservatively from the existing temporary-reset precedent (5/15min) and
  // the brute-force lockout on login (max 5 attempts/identifier). Login keeps
  // the per-identifier brute-force lockout; the route limit adds a per-IP cap.
  app.post('/auth/register', { preHandler: [opts.requireFeatureFlag('app.registration_enabled')], config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, errorHandler }, registerHandler);
  app.post('/auth/register-player', { preHandler: [opts.requireFeatureFlag('player.registration_enabled')], config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, errorHandler }, registerPlayerHandler);
  app.post('/auth/register-seller', { preHandler: [opts.requireFeatureFlag('seller.registration_enabled')], config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, errorHandler }, registerSellerHandler);
  app.post('/auth/register-organization', { preHandler: [opts.requireFeatureFlag('organization.registration_enabled')], config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, errorHandler }, registerOrganizationHandler);
  app.post('/auth/check-uniqueness', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, errorHandler }, checkUniquenessHandler);
  app.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, errorHandler }, loginHandler);
  app.post('/auth/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, errorHandler }, refreshHandler);
  app.post('/auth/logout', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } }, errorHandler }, logoutHandler);
  app.get('/auth/me', { errorHandler }, meHandler);
  app.patch('/auth/profile', { preHandler: [authMiddleware, requirePermission(['profile.edit'])], errorHandler }, updateProfileHandler);
  app.patch('/my/welcome-seen', { preHandler: [authMiddleware, requirePermission(['profile.welcome-seen'])], errorHandler }, welcomeSeenHandler);
  app.get('/my/player-profile', { preHandler: [authMiddleware, requirePermission(['player.profile.view'])], errorHandler }, getMyPlayerProfileHandler);
  app.post('/auth/request-reactivation', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, errorHandler }, requestReactivationHandler);
  app.post('/auth/forgot-password', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } }, errorHandler }, forgotPasswordHandler);
  app.post('/auth/reset-password', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } }, errorHandler }, resetPasswordHandler);

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
