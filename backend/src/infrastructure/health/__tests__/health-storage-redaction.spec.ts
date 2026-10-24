import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * MB-03 — the public `GET /health/storage` response must not disclose the
 * internal upload path or free-disk capacity. Mock-only (node:fs mocked).
 */

const mocks = vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  return { accessSync: vi.fn() };
});

vi.mock('node:fs', () => ({
  accessSync: mocks.accessSync,
  constants: { F_OK: 0, W_OK: 2 },
}));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => ({ execute: vi.fn(async () => [[]]) }) }));
vi.mock('../../redis/redis.client.js', () => ({ getRedisClient: () => ({ ping: vi.fn(async () => 'PONG') }) }));
vi.mock('../../../shared/utils/logger.js', () => ({ createModuleLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }) }));

import { healthStorage } from '../health.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('healthStorage — MB-03 redaction', () => {
  it('does NOT expose uploadDir or freeDiskMb when healthy', async () => {
    mocks.accessSync.mockReturnValue(undefined);

    const res = await healthStorage();

    expect(res).not.toHaveProperty('uploadDir');
    expect(res).not.toHaveProperty('freeDiskMb');
    expect(Object.keys(res).sort()).toEqual(['status', 'writable']);
    expect(res.status).toBe('ok');
    expect(res.writable).toBe(true);
  });

  it('reports degraded (not writable) without extra fields', async () => {
    mocks.accessSync
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => { throw new Error('EACCES'); });

    const res = await healthStorage();

    expect(res.status).toBe('degraded');
    expect(res.writable).toBe(false);
    expect(res).not.toHaveProperty('uploadDir');
    expect(res).not.toHaveProperty('freeDiskMb');
  });

  it('a filesystem failure returns a generic message without the internal path', async () => {
    mocks.accessSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory, access '/app/uploads'");
    });

    const res = await healthStorage();

    expect(res.status).toBe('down');
    expect(res.writable).toBe(false);
    expect(res).not.toHaveProperty('uploadDir');
    expect(res).not.toHaveProperty('freeDiskMb');
    expect((res as any).error).toBe('upload directory check failed');
    expect(JSON.stringify(res)).not.toContain('/app/');
    expect(JSON.stringify(res)).not.toContain('ENOENT');
  });
});
