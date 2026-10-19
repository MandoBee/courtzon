import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { corsOriginCallback, buildCorsAllowlist } from '../cors-origin.js';

/**
 * MB-05 — the Socket.IO origin policy is the SAME shared callback used by HTTP
 * CORS. A disallowed origin must be rejected with `cb(null, false)` and never
 * with an Error (which would surface as a handshake failure). Mock-only.
 */

const PRODUCTION_ORIGINS = ['https://courtzon.cloud'];
const LOCAL_DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const prodList = buildCorsAllowlist({ productionOrigins: PRODUCTION_ORIGINS, localDevOrigins: LOCAL_DEV_ORIGINS, isDev: false });
const devList = buildCorsAllowlist({ productionOrigins: PRODUCTION_ORIGINS, localDevOrigins: LOCAL_DEV_ORIGINS, isDev: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const REALTIME_SRC = resolve(__dirname, '..', '..', '..', 'realtime', 'index.ts');

describe('corsOriginCallback — rejected-origin callback behaviour', () => {
  it('allowed origin → cb(null, true)', () => {
    const cb = vi.fn();
    corsOriginCallback(prodList, false)('https://courtzon.cloud', cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('disallowed origin → cb(null, false) and NEVER an Error', () => {
    const cb = vi.fn();
    corsOriginCallback(prodList, false)('http://localhost:5173', cb);
    expect(cb).toHaveBeenCalledWith(null, false);
    expect(cb.mock.calls[0][0]).toBeNull();
  });

  it('production rejects localhost, 127.0.0.1 and arbitrary origins without erroring', () => {
    const decide = corsOriginCallback(prodList, false);
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://evil.example']) {
      const cb = vi.fn();
      decide(origin, cb);
      expect(cb).toHaveBeenCalledWith(null, false);
      expect(cb.mock.calls[0][0]).toBeNull();
    }
  });

  it('development permits localhost (isDev permissive switch)', () => {
    const cb = vi.fn();
    corsOriginCallback(devList, true)('http://localhost:5173', cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('missing Origin → cb(null, true)', () => {
    const cb = vi.fn();
    corsOriginCallback(prodList, false)(undefined, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });
});

describe('realtime Socket.IO CORS wiring (MB-05)', () => {
  it('uses the shared production-safe callback and never raises a CORS Error', () => {
    const src = readFileSync(REALTIME_SRC, 'utf8');
    expect(src).toContain('corsOriginCallback(ALLOWED_ORIGINS, isDev)');
    expect(src).not.toContain("new Error('Not allowed by CORS')");
    expect(src).not.toContain('DOCKER_ENV');
  });
});
