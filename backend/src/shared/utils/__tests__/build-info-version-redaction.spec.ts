import { describe, it, expect, vi } from 'vitest';

/**
 * MB-03 — `buildVersionPayload()` (used by `GET /health/version`) exposes build
 * metadata only; process details (uid `user`, `pid`, `ppid`) must never be
 * included. Mock-only: node:fs is mocked so the baked metadata files are treated
 * as absent (local/dev behaviour).
 */

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => { throw new Error('ENOENT'); }),
}));

import { buildVersionPayload } from '../build-info.js';

describe('buildVersionPayload — MB-03 redaction', () => {
  it('exposes build metadata but never process details', () => {
    const payload = buildVersionPayload();

    for (const key of [
      'buildTime', 'gitCommit', 'gitCommitSource', 'gitCommitConsistent',
      'gitCommitMismatch', 'imageGitCommit', 'platformGitCommit',
      'applicationVersion', 'expectedMigration', 'nodeVersion', 'storageProvider',
    ]) {
      expect(payload).toHaveProperty(key);
    }

    expect(payload).not.toHaveProperty('user');
    expect(payload).not.toHaveProperty('pid');
    expect(payload).not.toHaveProperty('ppid');
    expect(payload.nodeVersion).toBe(process.version);

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('"user"');
    expect(serialized).not.toContain('"pid"');
    expect(serialized).not.toContain('"ppid"');
  });
});
