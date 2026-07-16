import type { FastifyReply, FastifyRequest } from 'fastify';

export const SESSION_COOKIE = 'session_token';
export const REFRESH_COOKIE = 'refresh_token';

const isProd = process.env.NODE_ENV === 'production' && process.env.RELAX_RATE_LIMIT !== 'true';

const cookieBase = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
};

function parseDurationSeconds(value: string | undefined, fallbackSeconds: number): number {
  if (!value) return fallbackSeconds;
  const match = value.match(/^(\d+)(m|h|d)$/);
  if (!match) return fallbackSeconds;
  const num = parseInt(match[1], 10);
  switch (match[2]) {
    case 'm': return num * 60;
    case 'h': return num * 60 * 60;
    case 'd': return num * 24 * 60 * 60;
    default: return fallbackSeconds;
  }
}

const SESSION_COOKIE_MAX_AGE = parseDurationSeconds(process.env.SESSION_ACCESS_TOKEN_EXPIRY, 15 * 60);
const REFRESH_COOKIE_REMEMBER_MAX_AGE = parseDurationSeconds(process.env.SESSION_REFRESH_TOKEN_EXPIRY, 30 * 24 * 60 * 60);
const REFRESH_COOKIE_SESSION_MAX_AGE = parseDurationSeconds(process.env.SESSION_REFRESH_TOKEN_SESSION_EXPIRY, 24 * 60 * 60);

export function setAuthCookies(reply: FastifyReply, sessionToken: string, refreshToken: string, rememberMe?: boolean): void {
  reply.setCookie(SESSION_COOKIE, sessionToken, {
    ...cookieBase,
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    ...cookieBase,
    maxAge: rememberMe ? REFRESH_COOKIE_REMEMBER_MAX_AGE : REFRESH_COOKIE_SESSION_MAX_AGE,
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
): Omit<T, 'session'> & { session: Record<string, unknown> } {
  const { sessionToken: _s, refreshToken: _r, ...sessionRest } = result.session;
  return { ...result, session: sessionRest };
}
