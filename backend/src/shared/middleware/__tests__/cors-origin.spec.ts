import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { isCorsOriginAllowed } from '../cors-origin.js';

/**
 * MB-02 — a rejected CORS origin must NOT become an HTTP 500.
 *
 * Exercises the REAL policy function plus `@fastify/cors` semantics on a minimal
 * app. No database, no Redis, no application bootstrap.
 */

const ALLOWED = ['https://courtzon.cloud', 'https://www.courtzon.cloud'];

async function buildApp(allowAll = false): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(cors, {
    origin: (origin, cb) => cb(null, isCorsOriginAllowed(origin, ALLOWED, allowAll)),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Fingerprint', 'X-Request-Id'],
  });
  app.get('/', async () => ({ ok: true }));
  await app.ready();
  return app;
}

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(false); });
afterAll(async () => { await app.close(); });

describe('isCorsOriginAllowed — policy', () => {
  it('allows listed origins and rejects others', () => {
    expect(isCorsOriginAllowed('https://courtzon.cloud', ALLOWED)).toBe(true);
    expect(isCorsOriginAllowed('https://www.courtzon.cloud', ALLOWED)).toBe(true);
    expect(isCorsOriginAllowed('https://evil.example', ALLOWED)).toBe(false);
  });

  it('always allows a missing Origin (non-browser callers unaffected)', () => {
    expect(isCorsOriginAllowed(undefined, ALLOWED)).toBe(true);
    expect(isCorsOriginAllowed('', ALLOWED)).toBe(true);
  });

  it('honours the dev/docker-local permissive flag without widening the allowlist', () => {
    expect(isCorsOriginAllowed('http://localhost:5173', ALLOWED, true)).toBe(true);
    expect(isCorsOriginAllowed('http://localhost:5173', ALLOWED, false)).toBe(false);
  });
});

describe('CORS responses (MB-02) — no HTTP 500 for disallowed origins', () => {
  it('allowed origin receives the expected CORS headers with credentials', async () => {
    const res = await app.inject({
      method: 'OPTIONS', url: '/',
      headers: { origin: 'https://courtzon.cloud', 'access-control-request-method': 'GET' },
    });
    expect(res.statusCode).toBeLessThan(500);
    expect(res.headers['access-control-allow-origin']).toBe('https://courtzon.cloud');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('disallowed origin does NOT receive Access-Control-Allow-Origin', async () => {
    const res = await app.inject({ method: 'GET', url: '/', headers: { origin: 'https://evil.example' } });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('disallowed origin does NOT cause HTTP 500 (preflight and simple request)', async () => {
    const pre = await app.inject({
      method: 'OPTIONS', url: '/',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
    });
    const simple = await app.inject({ method: 'GET', url: '/', headers: { origin: 'https://evil.example' } });

    expect(pre.statusCode).not.toBe(500);
    expect(pre.statusCode).toBeLessThan(500);
    expect(simple.statusCode).toBe(200);
    expect(simple.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('requests without an Origin header retain the intended behavior', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
  });

  it('an allowed origin still works via a simple (non-preflight) request', async () => {
    const res = await app.inject({ method: 'GET', url: '/', headers: { origin: 'https://courtzon.cloud' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://courtzon.cloud');
  });
});
