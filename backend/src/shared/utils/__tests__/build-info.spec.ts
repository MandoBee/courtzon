import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBuildValue, getGitCommit } from '../build-info.js';

const originalEnv: Record<string, string | undefined> = {
  GIT_COMMIT: process.env.GIT_COMMIT,
  SOURCE_COMMIT: process.env.SOURCE_COMMIT,
  GITHUB_SHA: process.env.GITHUB_SHA,
  COMMIT_SHA: process.env.COMMIT_SHA,
};

afterEach(() => {
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function tempFile(content: string): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'build-info-'));
  const path = join(dir, 'meta.txt');
  writeFileSync(path, content);
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('readBuildValue — baked file vs runtime env', () => {
  it('prefers a real baked file value over env', () => {
    const f = tempFile('abcd1234\n');
    process.env.GIT_COMMIT = 'from-env';
    try {
      expect(readBuildValue(f.path, ['GIT_COMMIT'])).toBe('abcd1234');
    } finally {
      f.cleanup();
    }
  });

  it('treats baked "unknown" as absent and falls back to the runtime env', () => {
    const f = tempFile('unknown\n'); // exactly what the Dockerfile stamps without a build arg
    process.env.GIT_COMMIT = '03706505b666a0d23a6dea4651406ecdfa5bfe1d';
    try {
      expect(readBuildValue(f.path, ['GIT_COMMIT'])).toBe('03706505b666a0d23a6dea4651406ecdfa5bfe1d');
    } finally {
      f.cleanup();
    }
  });

  it('walks the env chain when the file is missing', () => {
    delete process.env.GIT_COMMIT;
    process.env.SOURCE_COMMIT = 'src-sha-9f1e';
    expect(readBuildValue('/definitely/not/a/real/file', ['GIT_COMMIT', 'SOURCE_COMMIT', 'GITHUB_SHA'])).toBe('src-sha-9f1e');
  });

  it('returns unknown when nothing is available', () => {
    delete process.env.GIT_COMMIT;
    delete process.env.SOURCE_COMMIT;
    delete process.env.GITHUB_SHA;
    delete process.env.COMMIT_SHA;
    expect(readBuildValue('/definitely/not/a/real/file', ['GIT_COMMIT', 'SOURCE_COMMIT'])).toBe('unknown');
  });

  it('trims whitespace around baked values', () => {
    const f = tempFile('  abc123  \n');
    try {
      expect(readBuildValue(f.path, ['GIT_COMMIT'])).toBe('abc123');
    } finally {
      f.cleanup();
    }
  });
});

describe('getGitCommit', () => {
  it('resolves from runtime SOURCE_COMMIT (Coolify) when no baked file exists', () => {
    delete process.env.GIT_COMMIT;
    process.env.SOURCE_COMMIT = '03706505b666a0d23a6dea4651406ecdfa5bfe1d';
    expect(getGitCommit()).toBe('03706505b666a0d23a6dea4651406ecdfa5bfe1d');
  });

  it('reports unknown when neither a file nor any commit env exists', () => {
    delete process.env.GIT_COMMIT;
    delete process.env.SOURCE_COMMIT;
    delete process.env.GITHUB_SHA;
    delete process.env.COMMIT_SHA;
    expect(getGitCommit()).toBe('unknown');
  });
});