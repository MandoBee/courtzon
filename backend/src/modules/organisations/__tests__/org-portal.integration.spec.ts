import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  startContainers,
  runSchema,
  stopContainers,
  applyTestProcessEnv,
  type TestContext,
} from '../../../tests/helpers/integration-setup.js';
import { createPool, getPool } from '../../../database/mysql.js';

let ctx: TestContext;
let app: FastifyInstance;

function sessionCookie(res: { cookies: { name: string; value: string }[] }): string {
  const c = res.cookies.find((x) => x.name === 'session_token');
  if (!c) throw new Error('session_token cookie missing');
  return c.value;
}

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

  const mod = await import('../../../app.js');
  app = mod.app;
  await app.ready();
}, 120000);

afterAll(async () => {
  if (app) await app.close();
  const { closeRedisClient } = await import('../../../infrastructure/redis/redis.client.js');
  await closeRedisClient();
  await stopContainers();
}, 30000);

describe('Org portal IDOR', () => {
  it('returns 401 for unauthenticated org portal access', async () => {
    const res = await app.inject({ method: 'GET', url: '/org/1/info' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when player accesses an org they do not belong to', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        phoneNumber: '05000000001',
        countryCode: '+971',
        password: 'test123456',
      },
    });

    if (loginRes.statusCode !== 200) {
      await app.inject({
        method: 'POST',
        url: '/auth/register-player',
        payload: {
          countryId: 1,
          phoneNumber: '05000000001',
          password: 'test123456',
          fullName: 'IDOR Player',
          email: 'idor-player@example.com',
          gender: 'male',
          timezone: 'UTC',
          darkMode: 'system',
        },
      });
    }

    const loginRes2 = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        phoneNumber: '05000000001',
        countryCode: '+971',
        password: 'test123456',
      },
    });
    expect(loginRes2.statusCode).toBe(200);

    const token = sessionCookie(loginRes2);
    const res = await app.inject({
      method: 'GET',
      url: '/org/99999/info',
      cookies: { session_token: token },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('Payment webhook', () => {
  it('accepts mock gateway webhook and updates transaction status', async () => {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO payment_transactions (user_id, payment_method, gateway_provider, gateway_reference, amount, payment_status)
       VALUES (1, 'card', 'mock', 'mock_webhook_txn_001', 100.00, 'pending')`,
    );

    const res = await app.inject({
      method: 'POST',
      url: '/payments/webhook',
      headers: { 'x-paymob-signature': 'test-sig' },
      payload: {
        success: true,
        order: { id: 'mock_webhook_txn_001' },
      },
    });

    expect(res.statusCode).toBe(200);

    const [rows] = await pool.execute(
      'SELECT payment_status FROM payment_transactions WHERE gateway_reference = ?',
      ['mock_webhook_txn_001'],
    );
    expect((rows as { payment_status: string }[])[0]?.payment_status).toBe('paid');
  });

  it('rejects webhook for unknown gateway reference', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/payments/webhook',
      headers: { 'x-paymob-signature': 'test-sig' },
      payload: {
        success: true,
        order: { id: 'nonexistent_ref_xyz' },
      },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
