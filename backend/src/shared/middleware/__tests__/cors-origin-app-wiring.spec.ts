import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * MB-04 — HTTP CORS *wiring* in `app.ts`.
 *
 * Unlike `cors-origin*.spec.ts` (which exercise the pure helper on a local
 * Fastify app), this spec imports the REAL `app.ts` and asserts the behaviour
 * produced by the actual `app.register(cors, { origin: corsOriginCallback(...) })`
 * call via `app.inject`.
 *
 * `app.ts` has no factory, so the infrastructure modules that would connect to
 * MySQL/Redis are mocked (no real connections). `NODE_ENV=production` is set so
 * the app takes the production, non-permissive branch (`isDev === false`);
 * `RELAX_RATE_LIMIT=true` intentionally mirrors a "local Docker" style env to
 * prove that flag no longer widens the CORS policy.
 */

const mocks = vi.hoisted(() => {
  process.env.NODE_ENV = 'production';
  process.env.RELAX_RATE_LIMIT = 'true';
  // env.ts requires these in production (SESSION_SECRET >= 32 chars, not the dev default).
  process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'test';
  process.env.DB_NAME = 'test';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  // env.ts forbids the 'mock' gateway in production; 'fawry' maps to MockGateway.
  process.env.PAYMENT_GATEWAY_PROVIDER = 'fawry';
  process.env.APP_URL = 'https://courtzon.cloud';
  // Keep the suite output clean; the app logger honours LOG_LEVEL.
  process.env.LOG_LEVEL = 'silent';

  const pool = {
    execute: vi.fn(async () => [[], []]),
    query: vi.fn(async () => [[], []]),
    getConnection: vi.fn(),
  };
  return { pool };
});

vi.mock('../../../database/mysql.js', () => ({
  createPool: vi.fn(),
  getPool: () => mocks.pool,
  acquireConnection: vi.fn(),
}));

vi.mock('../../../infrastructure/redis/redis.client.js', () => ({
  getRedisClient: () => ({}),
  closeRedisClient: vi.fn(),
}));

const ALLOWED = 'https://courtzon.cloud';
const DISALLOWED = 'https://evil.example';
const LOCALHOST = 'http://localhost:5173';

let app: FastifyInstance | undefined;

beforeAll(async () => {
  const mod = await import('../../../app.js');
  app = mod.app as FastifyInstance;
  await app.ready();
}, 120_000);

afterAll(async () => {
  if (app) await app.close();
}, 30_000);

describe('HTTP CORS wiring in app.ts (production branch)', () => {
  it('accepts a preflight from an allowed origin', async () => {
    const res = await app!.inject({
      method: 'OPTIONS',
      url: '/health/live',
      headers: { origin: ALLOWED, 'access-control-request-method': 'GET' },
    });

    expect(res.statusCode).toBeLessThan(500);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rejects a preflight from a disallowed origin WITHOUT a CORS error / HTTP 500', async () => {
    const res = await app!.inject({
      method: 'OPTIONS',
      url: '/health/live',
      headers: { origin: DISALLOWED, 'access-control-request-method': 'GET' },
    });

    expect(res.statusCode).not.toBe(500);
    expect(res.statusCode).toBeLessThan(500);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('serves a simple request with CORS headers for an allowed origin', async () => {
    const res = await app!.inject({ method: 'GET', url: '/health/live', headers: { origin: ALLOWED } });

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
  });

  it('serves a simple request from a disallowed origin with NO CORS headers and no 500', async () => {
    const res = await app!.inject({ method: 'GET', url: '/health/live', headers: { origin: DISALLOWED } });

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not widen CORS for a localhost origin even with RELAX_RATE_LIMIT=true', async () => {
    const res = await app!.inject({
      method: 'OPTIONS',
      url: '/health/live',
      headers: { origin: LOCALHOST, 'access-control-request-method': 'GET' },
    });

    expect(res.statusCode).toBeLessThan(500);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
