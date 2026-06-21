import type { FastifyReply, FastifyRequest } from 'fastify';

export const SESSION_COOKIE = 'session_token';
export const REFRESH_COOKIE = 'refresh_token';

const isProd = process.env.NODE_ENV === 'production';

const cookieBase = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
};

export function setAuthCookies(reply: FastifyReply, sessionToken: string, refreshToken: string): void {
  reply.setCookie(SESSION_COOKIE, sessionToken, {
    ...cookieBase,
    maxAge: 30 * 24 * 60 * 60,
  });
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    ...cookieBase,
    maxAge: 90 * 24 * 60 * 60,
  });
}

export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
  reply.clearCookie(REFRESH_COOKIE, { path: '/' });
}

export function getSessionToken(request: FastifyRequest): string | null {
  const fromCookie = request.cookies?.[SESSION_COOKIE];
  if (fromCookie) return fromCookie;

  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);

  return null;
}

export function getRefreshToken(request: FastifyRequest, bodyToken?: string | null): string | null {
  if (bodyToken) return bodyToken;
  return request.cookies?.[REFRESH_COOKIE] ?? null;
}

/** Strip tokens from JSON body — they are delivered only via HttpOnly cookies. */
export function sanitizeAuthPayload<T extends { session: { sessionToken: string; refreshToken: string; expiresAt: string } }>(
  result: T,
): Omit<T, 'session'> & { session: { expiresAt: string } } {
  const { sessionToken: _s, refreshToken: _r, ...sessionRest } = result.session;
  return { ...result, session: sessionRest };
}
