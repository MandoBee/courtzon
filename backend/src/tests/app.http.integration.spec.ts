import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  startContainers,
  runSchema,
  stopContainers,
  applyTestProcessEnv,
  type TestContext,
} from './helpers/integration-setup.js';
import { createPool } from '../database/mysql.js';

let ctx: TestContext;
let app: FastifyInstance;

beforeAll(async () => {
  ctx = await startContainers();
  await runSchema(ctx.mysqlPort);
  applyTestProcessEnv(ctx);
  vi.resetModules();

  createPool({
    host: '127.0.0.1',
    port: ctx.mysqlPort,
    user: 'root',
    password: 'test',
    database: 'courtzon_test',
  });

  const mod = await import('../app.js');
  app = mod.app;
  await app.ready();
}, 120000);

afterAll(async () => {
  if (app) await app.close();
  const { closeRedisClient } = await import('../infrastructure/redis/redis.client.js');
  await closeRedisClient();
  await stopContainers();
}, 30000);

describe('HTTP /health', () => {
  it('returns service health with database and redis ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.service).toBe('courtzon-v2-backend');
    expect(body.checks.database.status).toBe('ok');
    expect(body.checks.redis.status).toBe('ok');
  });
});

describe('HTTP auth', () => {
  it('rejects unauthenticated access to protected routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/bookings' });
    expect(res.statusCode).toBe(401);
  });

  it('sets HttpOnly session cookie on login and authenticates via cookie', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/register-player',
      payload: {
        countryId: 1,
        phoneNumber: '05000000099',
        password: 'test123456',
        fullName: 'Cookie Test Player',
        email: 'cookie-test@example.com',
        gender: 'male',
        timezone: 'UTC',
        darkMode: 'system',
      },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        phoneNumber: '05000000099',
        countryCode: '+971',
        password: 'test123456',
      },
    });
    expect(loginRes.statusCode).toBe(200);

    const sessionCookie = loginRes.cookies.find((c) => c.name === 'session_token');
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);

    const body = loginRes.json();
    expect(body.session?.sessionToken).toBeUndefined();
    expect(body.session?.refreshToken).toBeUndefined();
    expect(body.session?.expiresAt).toBeDefined();

    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { session_token: sessionCookie!.value },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user.fullName).toBe('Cookie Test Player');
  });

  it('returns 200 with null user when not logged in (no console 401 probe)', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toBeNull();
  });

  it('clears stale session cookies and returns null user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { session_token: 'invalid-stale-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toBeNull();
    const cleared = res.cookies.filter((c) => c.value === '' && (c.name === 'session_token' || c.name === 'refresh_token'));
    expect(cleared.length).toBeGreaterThanOrEqual(1);
  });
});
