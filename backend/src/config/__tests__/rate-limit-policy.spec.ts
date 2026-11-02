import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {
  API_RATE_LIMIT_MAX,
  PUBLIC_REFERENCE_RATE_LIMIT_MAX,
  isPublicReferencePath,
  resolveRateLimitKey,
  resolveRateLimitMax,
} from '../rate-limit-policy.js';

/**
 * Regression coverage for the live 429 incident: rapid navigation drained the
 * single global bucket because read-only `/public/*` calls shared it with the
 * authenticated API, and `/auth/me` then answered 429 (→ user bounced to login).
 */
describe('rate-limit policy', () => {
  it('treats /public and /public/* as public reference reads', () => {
    expect(isPublicReferencePath('/public')).toBe(true);
    expect(isPublicReferencePath('/public/')).toBe(true);
    expect(isPublicReferencePath('/public/countries')).toBe(true);
    expect(isPublicReferencePath('/public/translations/en?locale=en')).toBe(true);
    expect(isPublicReferencePath('/public?t=1')).toBe(true);
  });

  it('does not treat lookalike paths as public', () => {
    expect(isPublicReferencePath('/publicity')).toBe(false);
    expect(isPublicReferencePath('/api/public/countries')).toBe(false);
    expect(isPublicReferencePath('/auth/me')).toBe(false);
    expect(isPublicReferencePath('/bookings')).toBe(false);
    expect(isPublicReferencePath('')).toBe(false);
  });

  it('keeps the strict budget for authenticated/sensitive endpoints', () => {
    expect(resolveRateLimitMax('/auth/me')).toBe(API_RATE_LIMIT_MAX);
    expect(resolveRateLimitMax('/auth/refresh')).toBe(API_RATE_LIMIT_MAX);
    expect(resolveRateLimitMax('/bookings')).toBe(API_RATE_LIMIT_MAX);
    expect(API_RATE_LIMIT_MAX).toBe(100);
  });

  it('gives public reference reads a separate, still bounded budget', () => {
    expect(resolveRateLimitMax('/public/countries')).toBe(PUBLIC_REFERENCE_RATE_LIMIT_MAX);
    expect(PUBLIC_REFERENCE_RATE_LIMIT_MAX).toBeGreaterThan(API_RATE_LIMIT_MAX);
    expect(PUBLIC_REFERENCE_RATE_LIMIT_MAX).toBeLessThanOrEqual(1000);
  });

  it('buckets public reads separately from authenticated traffic for the same IP', () => {
    const ip = '203.0.113.7';
    expect(resolveRateLimitKey(ip, '/public/countries')).toBe(`${ip}|public`);
    expect(resolveRateLimitKey(ip, '/public/theme?x=1')).toBe(`${ip}|public`);
    expect(resolveRateLimitKey(ip, '/auth/me')).toBe(`${ip}|api`);
    expect(resolveRateLimitKey(ip, '/bookings')).toBe(`${ip}|api`);
    expect(resolveRateLimitKey(ip, '/public/countries')).not.toBe(resolveRateLimitKey(ip, '/auth/me'));
  });

  it('keeps different client IPs in different buckets', () => {
    expect(resolveRateLimitKey('198.51.100.1', '/auth/me')).not.toBe(resolveRateLimitKey('198.51.100.2', '/auth/me'));
  });
});

/**
 * Wiring check: the helper above must be applied exactly the way app.ts applies
 * it, otherwise the split buckets are theoretical. Uses the real plugin with an
 * in-memory store and Fastify's `inject` (no ports, no network).
 */
describe('global rate-limit wiring (public reads vs authenticated API)', () => {
  async function buildApp() {
    const app = Fastify();
    await app.register(rateLimit, {
      max: (request) => resolveRateLimitMax(request.url),
      timeWindow: '1 minute',
      keyGenerator: (request) => resolveRateLimitKey(request.ip, request.url),
    });
    app.get('/public/countries', async () => ({ ok: true }));
    app.get('/auth/me', async () => ({ ok: true }));
    await app.ready();
    return app;
  }

  it('does not let a normal page-load burst of public reads consume the API budget', async () => {
    const app = await buildApp();
    // ~10x the authenticated budget, as produced by rapid page navigation.
    for (let i = 0; i < 150; i++) {
      const res = await app.inject({ method: 'GET', url: '/public/countries?i=' + i });
      expect(res.statusCode).toBe(200);
    }
    const api = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(api.statusCode).toBe(200);
    await app.close();
  });

  it('still enforces the strict 100/min budget on authenticated endpoints', async () => {
    const app = await buildApp();
    const statuses: number[] = [];
    for (let i = 0; i < API_RATE_LIMIT_MAX + 1; i++) {
      statuses.push((await app.inject({ method: 'GET', url: '/auth/me' })).statusCode);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(API_RATE_LIMIT_MAX);
    expect(statuses[statuses.length - 1]).toBe(429);
    await app.close();
  });

  it('keeps the public bucket bounded (not unlimited)', async () => {
    const app = await buildApp();
    let last = 200;
    for (let i = 0; i < PUBLIC_REFERENCE_RATE_LIMIT_MAX + 1; i++) {
      last = (await app.inject({ method: 'GET', url: '/public/countries?i=' + i })).statusCode;
    }
    expect(last).toBe(429);
    await app.close();
  });
});
