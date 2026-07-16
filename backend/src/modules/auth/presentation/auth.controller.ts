import type { FastifyRequest, FastifyReply } from 'fastify';
import { authService } from '../application/auth.service.js';
import { RegisterSchema, PlayerRegisterSchema, SellerRegisterSchema, OrganizationRegisterSchema, LoginSchema, RefreshSchema, LogoutSchema, UpdateProfileSchema, ForgotPasswordSchema, ResetPasswordSchema, CheckUniquenessSchema, RequestReactivationSchema } from './auth.dto.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { formatZodErrorDetails, isZodError } from '../../../shared/validation/zod-error.util.js';
import { AccountNotActiveError } from '../domain/auth.errors.js';
import { bruteForceService } from '../../brute-force/index.js';
import { recordAudit } from '../../audit-log/index.js';
import {
  setAuthCookies,
  clearAuthCookies,
  sanitizeAuthPayload,
  getRefreshToken,
  getSessionToken,
} from '../../../shared/utils/auth-cookies.js';
import { resolveSessionUserId } from '../../../shared/middleware/auth.middleware.js';

export async function registerHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = RegisterSchema.parse(request.body);
  const result = await authService.register(body, {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    deviceFingerprint: (request.headers['x-device-fingerprint'] as string) || undefined,
  });
  recordAudit({
    actorId: result.user.id,
    action: 'USER.REGISTER',
    entityType: 'user',
    entityId: result.user.id,
    afterState: { fullName: result.user.fullName, email: result.user.email },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(result);
}

export async function registerPlayerHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = PlayerRegisterSchema.parse(request.body);
  const result = await authService.registerPlayer(body, {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    deviceFingerprint: (request.headers['x-device-fingerprint'] as string) || undefined,
  });
  recordAudit({
    actorId: result.user.id,
    action: 'USER.REGISTER',
    entityType: 'player',
    entityId: result.user.id,
    afterState: { fullName: result.user.fullName, email: result.user.email },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(result);
}

export async function registerSellerHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = SellerRegisterSchema.parse(request.body);
  const result = await authService.registerSeller(body, {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    deviceFingerprint: (request.headers['x-device-fingerprint'] as string) || undefined,
  });
  recordAudit({
    actorId: result.user.id,
    action: 'USER.REGISTER',
    entityType: 'seller',
    entityId: result.user.id,
    afterState: { fullName: result.user.fullName, shopName: body.shopName },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(result);
}

export async function registerOrganizationHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = OrganizationRegisterSchema.parse(request.body);
  const result = await authService.registerOrganization(body, {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    deviceFingerprint: (request.headers['x-device-fingerprint'] as string) || undefined,
  });
  recordAudit({
    actorId: result.user.id,
    action: 'USER.REGISTER',
    entityType: 'organization',
    entityId: result.user.id,
    afterState: { fullName: result.user.fullName, orgName: body.orgName },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.status(201).send(result);
}

export async function loginHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = LoginSchema.parse(request.body);
  const identifier = request.ip || body.phoneNumber;

  const locked = await bruteForceService.isLockedOut(identifier);
  if (locked) {
    const ttl = await bruteForceService.getLockoutTTL(identifier);
    recordAudit({
      actorId: null,
      action: 'USER.LOGIN_FAILED',
      entityType: 'user',
      afterState: { reason: 'account_locked', identifier },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    return reply.status(429).send({
      error: 'TOO_MANY_ATTEMPTS',
      message: `Account temporarily locked. Try again in ${Math.ceil(ttl / 60)} minutes.`,
    });
  }

  try {
    const result = await authService.login(body, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      deviceFingerprint: (request.headers['x-device-fingerprint'] as string) || undefined,
      rememberMe: body.rememberMe,
    });
    await bruteForceService.clearAttempts(identifier);
    recordAudit({
      actorId: result.user.id,
      action: 'USER.LOGIN',
      entityType: 'user',
      entityId: result.user.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    setAuthCookies(reply, result.session.sessionToken, result.session.refreshToken, body.rememberMe);
    return reply.send(sanitizeAuthPayload(result));
  } catch (error: unknown) {
    if (error instanceof AccountNotActiveError) {
      recordAudit({
        actorId: null,
        action: 'USER.LOGIN_FAILED',
        entityType: 'user',
        afterState: { reason: 'account_not_active', status: error.details },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });
      return reply.status(error.statusCode).send({
        error: error.errorCode,
        message: error.message,
        details: error.details,
      });
    }
    await bruteForceService.recordFailedAttempt(identifier);
    const remaining = await bruteForceService.getRemainingAttempts(identifier);
    recordAudit({
      actorId: null,
      action: 'USER.LOGIN_FAILED',
      entityType: 'user',
      afterState: { reason: 'invalid_credentials', identifier, remainingAttempts: remaining },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
    if (remaining > 0) {
      return reply.status(401).send({
        error: 'INVALID_CREDENTIALS',
        message: `Invalid credentials. ${remaining} attempt(s) remaining.`,
      });
    }
    return reply.status(429).send({
      error: 'TOO_MANY_ATTEMPTS',
      message: 'Too many failed attempts. Account locked for 30 minutes.',
    });
  }
}

export async function refreshHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = RefreshSchema.parse(request.body ?? {});
  const refreshToken = getRefreshToken(request, body.refreshToken);
  if (!refreshToken) {
    return reply.status(401).send({ error: 'AUTHENTICATION_ERROR', message: 'Missing refresh token' });
  }
  const result = await authService.refresh(refreshToken);
  setAuthCookies(reply, result.session.sessionToken, result.session.refreshToken);
  return reply.send(sanitizeAuthPayload(result));
}

export async function logoutHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = LogoutSchema.parse(request.body ?? {});
  const userId = (request as any).userId;
  const refreshToken = getRefreshToken(request, body.refreshToken) ?? undefined;
  await authService.logout(refreshToken, body.allDevices, userId);
  clearAuthCookies(reply);
  if (userId) {
    recordAudit({
      actorId: userId,
      action: 'USER.LOGOUT',
      entityType: 'session',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }
  return reply.send({ success: true });
}

/** Session probe: always 200 — { user: null } when logged out or session invalid (clears stale cookies). */
export async function meHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = await resolveSessionUserId(request);
  if (!userId) {
    if (getSessionToken(request)) {
      clearAuthCookies(reply);
    }
    return reply.send({ user: null });
  }
  const user = await authService.getProfile(userId);
  return reply.send({ user });
}

export async function updateProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  if (!userId) {
    return reply.status(401).send({ error: 'Not authenticated' });
  }
  const body = UpdateProfileSchema.parse(request.body);
  const user = await authService.updateProfile(userId, body);
  return reply.send({ user });
}

export async function forgotPasswordHandler(request: FastifyRequest, reply: FastifyReply) {
  const { email } = ForgotPasswordSchema.parse(request.body);
  const result = await authService.forgotPassword(email);
  return reply.send(result);
}

export async function resetPasswordHandler(request: FastifyRequest, reply: FastifyReply) {
  const { token, newPassword } = ResetPasswordSchema.parse(request.body);
  await authService.resetPassword(token, newPassword);
  return reply.send({ message: 'Password reset successfully' });
}

export async function checkUniquenessHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = CheckUniquenessSchema.parse(request.body);
  const result = await authService.checkUniqueness(body);
  return reply.send(result);
}

export async function welcomeSeenHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  if (!userId) {
    return reply.status(401).send({ error: 'Not authenticated' });
  }
  await authService.markWelcomeSeen(userId);
  return reply.send({ success: true });
}

export async function getMyPlayerProfileHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).userId;
  if (!userId) {
    return reply.status(401).send({ error: 'Not authenticated' });
  }
  const profile = await authService.getPlayerProfileFull(userId);
  if (!profile) {
    return reply.status(404).send({ error: 'NOT_FOUND', message: 'Player profile not found' });
  }
  return reply.send(profile);
}

export async function requestReactivationHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = RequestReactivationSchema.parse(request.body);
  await authService.requestReactivation(body);
  recordAudit({
    actorId: 0,
    action: 'USER.REACTIVATION_REQUESTED',
    entityType: 'user',
    entityId: 0,
    afterState: { phoneNumber: body.phoneNumber, email: body.email },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });
  return reply.send({ success: true });
}

export async function errorHandler(error: Error, _request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.errorCode,
      message: error.message,
      details: error.details,
    });
  }
  if (isZodError(error)) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: formatZodErrorDetails(error),
    });
  }
  _request.log.error(error, 'Unhandled error in auth module');
  const statusCode = (error as any).statusCode ?? 500;
  const msg = error.message || 'Internal server error';
  return reply.status(statusCode).send({
    error: 'INTERNAL_ERROR',
    message: msg,
  });
}
