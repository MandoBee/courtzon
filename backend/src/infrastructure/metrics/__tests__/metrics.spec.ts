import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

/**
 * Module logger is mocked so the tests can assert log content without touching
 * pino. `metrics.ts` only calls `warn` (missing-token, once) and must never log
 * the token value.
 */
const log = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('../../../shared/utils/logger.js', () => ({
  createModuleLogger: () => log,
}));

/**
 * CZ-F26 — fail-closed protection for GET /metrics.
 *
 * Mock-only / isolated: a minimal Fastify instance with only `registerMetrics`
 * is used (no DB, no Redis, no Docker). `metrics.ts` reads `process.env` lazily
 * inside the route handler, so NODE_ENV / METRICS_TOKEN are set per test.
 *
 * Expected model:
 *   production + token missing/empty  → 404 (never served)
 *   production + token set            → 401 without a valid Bearer; 200 with it
 *   development/test + token missing  → 200 (historical open behavior)
 *   `?token=` query auth is NOT supported
 */

const ORIGINAL = {
  NODE_ENV: process.env.NODE_ENV,
  METRICS_TOKEN: process.env.METRICS_TOKEN,
};

function setEnv(nodeEnv: string | undefined, token: string | undefined): void {
  if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
  if (token === undefined) delete process.env.METRICS_TOKEN; else process.env.METRICS_TOKEN = token;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  const { registerMetrics } = await import('../metrics.js');
  registerMetrics(app);
  await app.ready();
  return app;
}

describe('CZ-F26 — credential edge cases and token leakage', () => {
  const SYNTHETIC_TOKEN = 'cz-synthetic-metrics-token-for-tests-only';
  let app: FastifyInstance | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = undefined;
    app = await buildApp();
  });

  afterEach(async () => {
    try {
      if (app) await app.close();
    } catch {
      // ignore teardown failures
    } finally {
      app = undefined;
      setEnv(ORIGINAL.NODE_ENV, ORIGINAL.METRICS_TOKEN);
    }
  });

  it('missing-token warning contains no token or secret material', async () => {
    // This test runs before any other missing-token request, so the one-time
    // production warning is emitted here.
    setEnv('production', undefined);

    const res = await app!.inject({ method: 'GET', url: '/metrics' });

    expect(res.statusCode).toBe(404);
    expect(log.warn).toHaveBeenCalled();
    const logged = JSON.stringify(log.warn.mock.calls);
    expect(logged).not.toContain(SYNTHETIC_TOKEN);
    expect(logged.toLowerCase()).not.toContain('secret');
    expect(logged).toContain('disabled (404)');
  });

  it('rejects every missing/malformed/edge Authorization header with 401', async () => {
    setEnv('production', SYNTHETIC_TOKEN);

    const headersList: Array<Record<string, string>> = [
      {}, // missing header
      { authorization: `Basic ${SYNTHETIC_TOKEN}` }, // Basic scheme
      { authorization: 'Bearer' }, // scheme with no token
      { authorization: 'Bearer ' }, // empty Bearer value
      { authorization: `bearer ${SYNTHETIC_TOKEN}` }, // lowercase scheme
      { authorization: SYNTHETIC_TOKEN }, // value with no recognised scheme
    ];

    for (const headers of headersList) {
      const res = await app!.inject({ method: 'GET', url: '/metrics', headers });
      expect(res.statusCode, JSON.stringify(headers)).toBe(401);
      expect(res.body).not.toContain(SYNTHETIC_TOKEN);
    }
  });

  it('401 response and logs never contain the token value', async () => {
    setEnv('production', SYNTHETIC_TOKEN);

    const res = await app!.inject({
      method: 'GET', url: '/metrics',
      headers: { authorization: 'Bearer wrong-token' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain(SYNTHETIC_TOKEN);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(SYNTHETIC_TOKEN);
    expect(JSON.stringify(log.error.mock.calls)).not.toContain(SYNTHETIC_TOKEN);
    // The authentication-failure path must not log credentials at all.
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('404 body never reflects a query-string token', async () => {
    setEnv('production', undefined);

    const res = await app!.inject({
      method: 'GET',
      url: `/metrics?token=${encodeURIComponent(SYNTHETIC_TOKEN)}`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain(SYNTHETIC_TOKEN);
  });
});

describe('CZ-F26 — /metrics fail-closed protection', () => {
  let app: FastifyInstance | undefined;

  beforeEach(async () => {
    // Reset first so a failed buildApp() never leaves a stale/closed instance
    // for the teardown to touch.
    app = undefined;
    app = await buildApp();
  });

  afterEach(async () => {
    // Environment restoration MUST happen even if app creation/closing fails.
    // A teardown error is swallowed (never an unhandled rejection) so it cannot
    // mask the test result or skip the restore.
    try {
      if (app) await app.close();
    } catch {
      // ignore teardown failures
    } finally {
      app = undefined;
      setEnv(ORIGINAL.NODE_ENV, ORIGINAL.METRICS_TOKEN);
    }
  });

  it('production + missing token → 404 (metrics never exposed)', async () => {
    setEnv('production', undefined);
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('courtzon_');
  });

  it('production + empty token → 404', async () => {
    setEnv('production', '');
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('courtzon_');
  });

  it('production + token set + no Authorization → 401', async () => {
    setEnv('production', 'secret-token-value');
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain('courtzon_');
  });

  it('production + token set + wrong Bearer → 401', async () => {
    setEnv('production', 'secret-token-value');
    const res = await app.inject({
      method: 'GET', url: '/metrics',
      headers: { authorization: 'Bearer wrong-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('production + token set + correct Bearer → 200 with metrics content type', async () => {
    setEnv('production', 'secret-token-value');
    const res = await app.inject({
      method: 'GET', url: '/metrics',
      headers: { authorization: 'Bearer secret-token-value' },
    });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toContain('text/plain');
    expect(res.body).toContain('courtzon_');
  });

  it('production + token set + non-Bearer scheme → 401', async () => {
    setEnv('production', 'secret-token-value');
    const res = await app.inject({
      method: 'GET', url: '/metrics',
      headers: { authorization: 'Basic secret-token-value' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('query-string token (?token=) is NOT accepted', async () => {
    setEnv('production', 'secret-token-value');
    const res = await app.inject({ method: 'GET', url: '/metrics?token=secret-token-value' });
    expect(res.statusCode).toBe(401);
  });

  it('test environment + missing token → 200 (historical open behavior preserved)', async () => {
    setEnv('test', undefined);
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toContain('text/plain');
    expect(res.body).toContain('courtzon_');
  });

  it('development + missing token → 200 (open)', async () => {
    setEnv('development', undefined);
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
  });

  it('non-production + token configured → token still required (401 without it)', async () => {
    setEnv('test', 'secret-token-value');
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(401);
  });
});
