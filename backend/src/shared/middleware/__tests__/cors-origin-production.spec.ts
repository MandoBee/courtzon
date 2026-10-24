import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { isCorsOriginAllowed, buildCorsAllowlist } from '../cors-origin.js';

/**
 * MB-04 — production CORS must not trust localhost / 127.0.0.1, must not allow
 * arbitrary origins, and must not be widened by a Docker-local flag.
 * Mock-only (minimal @fastify/cors app); no DB, no Redis.
 */

const PRODUCTION_ORIGINS = ['https://courtzon.cloud', 'https://www.courtzon.cloud'];
const LOCAL_DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

function prodList(): string[] {
  return buildCorsAllowlist({ productionOrigins: PRODUCTION_ORIGINS, localDevOrigins: LOCAL_DEV_ORIGINS, isDev: false });
}
function devList(): string[] {
  return buildCorsAllowlist({ productionOrigins: PRODUCTION_ORIGINS, localDevOrigins: LOCAL_DEV_ORIGINS, isDev: true });
}

async function buildApp(allowed: string[], allowAll: boolean): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(cors, {
    origin: (origin, cb) => cb(null, isCorsOriginAllowed(origin, allowed, allowAll)),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.get('/', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('buildCorsAllowlist — production vs development (MB-04)', () => {
  it('production EXCLUDES localhost and 127.0.0.1', () => {
    const list = prodList();
    expect(list).toContain('https://courtzon.cloud');
    expect(list).not.toContain('http://localhost:5173');
    expect(list).not.toContain('http://localhost:5174');
    expect(list).not.toContain('http://127.0.0.1:5173');
    expect(list).not.toContain('http://127.0.0.1:5174');
  });

  it('development INCLUDES localhost and 127.0.0.1', () => {
    const list = devList();
    expect(list).toContain('http://localhost:5173');
    expect(list).toContain('http://127.0.0.1:5173');
  });

  it('always includes explicitly configured extras (APP_URL / CORS_ORIGINS)', () => {
    const list = buildCorsAllowlist({
      productionOrigins: PRODUCTION_ORIGINS,
      localDevOrigins: LOCAL_DEV_ORIGINS,
      isDev: false,
      appUrl: 'https://api.courtzon.cloud',
      extraOrigins: ['https://admin.courtzon.cloud'],
    });
    expect(list).toContain('https://api.courtzon.cloud');
    expect(list).toContain('https://admin.courtzon.cloud');
  });
});

describe('isCorsOriginAllowed — production policy decisions', () => {
  const allowed = prodList();

  it('rejects localhost and 127.0.0.1 in production', () => {
    expect(isCorsOriginAllowed('http://localhost:5173', allowed, false)).toBe(false);
    expect(isCorsOriginAllowed('http://127.0.0.1:5173', allowed, false)).toBe(false);
  });

  it('allows an approved production origin', () => {
    expect(isCorsOriginAllowed('https://courtzon.cloud', allowed, false)).toBe(true);
  });

  it('rejects an arbitrary origin', () => {
    expect(isCorsOriginAllowed('https://evil.example', allowed, false)).toBe(false);
  });

  it('allows a missing Origin (non-browser callers)', () => {
    expect(isCorsOriginAllowed(undefined, allowed, false)).toBe(true);
  });

  it('development (isDev permissive switch) permits localhost', () => {
    expect(isCorsOriginAllowed('http://localhost:5173', devList(), true)).toBe(true);
  });
});

describe('CORS responses — production policy (MB-04)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(prodList(), false); });
  afterAll(async () => { await app.close(); });

  it('approved origin receives CORS headers with credentials', async () => {
    const res = await app.inject({ method: 'GET', url: '/', headers: { origin: 'https://courtzon.cloud' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://courtzon.cloud');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('localhost origin gets NO CORS headers and is not a 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/', headers: { origin: 'http://localhost:5173' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('127.0.0.1 origin gets NO CORS headers and is not a 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/', headers: { origin: 'http://127.0.0.1:5173' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('arbitrary origin gets NO CORS headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/', headers: { origin: 'https://evil.example' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
