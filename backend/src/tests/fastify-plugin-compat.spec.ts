import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

/**
 * Stage B compatibility tests — @fastify/static 10 + @fastify/swagger-ui 6.
 *
 * Mirrors the exact production registration options (app.ts) in a standalone
 * Fastify instance, so no DB, Redis, .env, or network is touched. Uses an OS
 * temp directory for static files and cleans it up.
 */
describe('Fastify plugin compatibility (static + swagger UI)', () => {
  let app: FastifyInstance;
  let root: string;

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'cz-static-'));
    writeFileSync(join(root, 'ok.txt'), 'static-ok', 'utf8');
    mkdirSync(join(root, 'nested'));
    writeFileSync(join(root, 'nested', 'ok2.txt'), 'nested-ok', 'utf8');

    app = Fastify({ logger: false });
    await app.register(fastifyStatic, {
      root,
      prefix: '/uploads/',
      decorateReply: false,
    });
    await app.register(swagger, {
      openapi: { info: { title: 'CourtZon test', version: '1.0.0' } },
    });
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: true, tryItOutEnabled: true },
    });
    app.get('/openapi.json', async (_request, reply) => reply.send((app as any).swagger()));
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('serves files from the configured /uploads/ prefix', async () => {
    const res = await app.inject({ method: 'GET', url: '/uploads/ok.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('static-ok');
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('serves nested files', async () => {
    const res = await app.inject({ method: 'GET', url: '/uploads/nested/ok2.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('nested-ok');
  });

  it('returns 404 for a missing upload', async () => {
    const res = await app.inject({ method: 'GET', url: '/uploads/missing.txt' });
    expect(res.statusCode).toBe(404);
  });

  it('does not allow path traversal outside the static root', async () => {
    for (const url of [
      '/uploads/../package.json',
      '/uploads/%2e%2e/package.json',
      '/uploads/..%2fpackage.json',
      '/uploads/....//package.json',
    ]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).not.toBe(200);
    }
  });

  it('does not decorate reply with sendFile (matches app.ts decorateReply:false)', () => {
    expect((app as any).sendFile).toBeUndefined();
  });

  it('serves Swagger UI at /docs and the OpenAPI document', async () => {
    const docs = await app.inject({ method: 'GET', url: '/docs' });
    expect(docs.statusCode).toBe(200);
    expect(docs.headers['content-type']).toContain('text/html');

    const spec = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(spec.statusCode).toBe(200);
    expect(spec.json().openapi).toMatch(/^3\./);
  });

  it('keeps production docs disabled by default and only enabled by the explicit gate', () => {
    const source = readFileSync(new URL('../app.ts', import.meta.url), 'utf8');
    expect(source).toContain(
      "const enableApiDocs = isDev || process.env.ENABLE_API_DOCS === 'true';",
    );
    expect(source).toMatch(/if \(enableApiDocs\) \{[\s\S]*app\.register\(swaggerUi/);
    // The exact production static registration is preserved.
    expect(source).toContain("prefix: '/uploads/'");
    expect(source).toContain('decorateReply: false');
    expect(source).toContain("root: join(import.meta.dirname, '..', 'uploads')");
  });
});
