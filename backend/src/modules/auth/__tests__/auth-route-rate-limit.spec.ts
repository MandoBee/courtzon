import { describe, it, expect, beforeAll, vi } from 'vitest';
import Fastify from 'fastify';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3004';
});

/**
 * P1-1 — Auth route rate limiting.
 *
 * Auth mutation endpoints previously relied only on the global @fastify/rate-limit
 * (100/min/IP). This spec proves the per-route `config.rateLimit` values are now
 * declared on every auth mutation route (overriding the global limit per route),
 * and that the policy values are conservative and consistent with the existing
 * temporary-reset precedent.
 *
 * We intercept `app.post` during authRoutes registration to capture each route's
 * `config.rateLimit` — this is how @fastify/rate-limit reads route-level config
 * (mergeParams over global params), so asserting the declared config proves the
 * per-route policy is wired.
 */
describe('P1-1 — Auth route rate limiting policy', () => {
  const captured = new Map<string, any>();

  beforeAll(async () => {
    const app = Fastify();
    // Intercept route registration to record (method+url → config.rateLimit).
    const origPost = app.post.bind(app);
    app.post = ((path: string, opts: any, ...rest: any[]) => {
      captured.set(`POST:${path}`, opts?.config?.rateLimit);
      return origPost(path, opts, ...rest);
    }) as any;
    const origGet = app.get.bind(app);
    app.get = ((path: string, opts: any, ...rest: any[]) => {
      captured.set(`GET:${path}`, opts?.config?.rateLimit);
      return origGet(path, opts, ...rest);
    }) as any;
    const origPatch = app.patch.bind(app);
    app.patch = ((path: string, opts: any, ...rest: any[]) => {
      captured.set(`PATCH:${path}`, opts?.config?.rateLimit);
      return origPatch(path, opts, ...rest);
    }) as any;

    const { authRoutes } = await import('../presentation/auth.routes.js');
    await app.register(authRoutes, { requireFeatureFlag: () => async () => {} });
    await app.close();
  });

  function rl(method: string, url: string): any {
    const value = captured.get(`${method}:${url}`);
    expect(value, `${method} ${url} rateLimit missing`).toBeDefined();
    return value;
  }

  it('login has a per-route rate limit (10/min)', () => {
    const cfg = rl('POST', '/auth/login');
    expect(cfg.max).toBe(10);
    expect(cfg.timeWindow).toBe('1 minute');
  });

  it('register endpoints have a per-route rate limit (10/min)', () => {
    for (const url of ['/auth/register', '/auth/register-player', '/auth/register-seller', '/auth/register-organization']) {
      const cfg = rl('POST', url);
      expect(cfg.max).toBe(10);
      expect(cfg.timeWindow).toBe('1 minute');
    }
  });

  it('forgot-password has a strict per-route rate limit (5/15min)', () => {
    const cfg = rl('POST', '/auth/forgot-password');
    expect(cfg.max).toBe(5);
    expect(cfg.timeWindow).toBe('15 minutes');
  });

  it('reset-password has a strict per-route rate limit (5/15min)', () => {
    const cfg = rl('POST', '/auth/reset-password');
    expect(cfg.max).toBe(5);
    expect(cfg.timeWindow).toBe('15 minutes');
  });

  it('check-uniqueness / refresh / logout have per-route rate limits (30/min)', () => {
    for (const url of ['/auth/check-uniqueness', '/auth/refresh', '/auth/logout']) {
      const cfg = rl('POST', url);
      expect(cfg.max).toBe(30);
    }
  });

  it('request-reactivation has a per-route rate limit (10/min)', () => {
    const cfg = rl('POST', '/auth/request-reactivation');
    expect(cfg.max).toBe(10);
  });

  it('temporary-reset routes keep their existing strict limits (5/15min, 3/15min)', () => {
    const verify = rl('POST', '/auth/temporary-reset/verify');
    expect(verify.max).toBe(5);
    const reset = rl('POST', '/auth/temporary-reset');
    expect(reset.max).toBe(3);
  });

  it('authenticated routes (profile/me) are NOT rate-limited (no per-route override)', () => {
    expect(captured.get('GET:/auth/me')).toBeUndefined();
    expect(captured.get('PATCH:/auth/profile')).toBeUndefined();
  });
});