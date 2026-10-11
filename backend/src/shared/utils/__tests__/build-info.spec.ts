import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBuildValue, getGitCommit, getGitCommitInfo } from '../build-info.js';

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

describe('getGitCommit / getGitCommitInfo — revision provenance', () => {
  it('prefers the platform runtime commit (SOURCE_COMMIT) over a stale baked image value', () => {
    const f = tempFile('504f6866b2865bc62e931cd5ef4e689321c04417');
    delete process.env.GIT_COMMIT;
    process.env.SOURCE_COMMIT = '798d75c6440452742584664ba6b444ebe3869160';
    try {
      const info = getGitCommitInfo(f.path);
      expect(info.commit).toBe('798d75c6440452742584664ba6b444ebe3869160');
      expect(info.source).toBe('platform');
      expect(info.platformCommit).toBe('798d75c6440452742584664ba6b444ebe3869160');
      expect(info.imageCommit).toBe('504f6866b2865bc62e931cd5ef4e689321c04417');
      expect(info.mismatch).toBe(true);
      expect(info.consistent).toBe(false);
      expect(getGitCommit()).toBe(info.commit);
    } finally {
      f.cleanup();
    }
  });

  it('resolves from runtime SOURCE_COMMIT (Coolify) when no baked file exists', () => {
    delete process.env.GIT_COMMIT;
    process.env.SOURCE_COMMIT = '03706505b666a0d23a6dea4651406ecdfa5bfe1d';
    expect(getGitCommit()).toBe('03706505b666a0d23a6dea4651406ecdfa5bfe1d');
  });

  it('uses the baked image commit when the platform exposes nothing', () => {
    const f = tempFile('abc123\n');
    delete process.env.SOURCE_COMMIT;
    delete process.env.GIT_COMMIT;
    delete process.env.GITHUB_SHA;
    delete process.env.COMMIT_SHA;
    try {
      const info = getGitCommitInfo(f.path);
      expect(info.commit).toBe('abc123');
      expect(info.source).toBe('image');
      expect(info.mismatch).toBe(false);
      expect(info.consistent).toBe(true);
    } finally {
      f.cleanup();
    }
  });

  it('treats a mismatched legacy GIT_COMMIT as inconsistent when only the image is authoritative', () => {
    const f = tempFile('abc123\n');
    delete process.env.SOURCE_COMMIT;
    delete process.env.GITHUB_SHA;
    delete process.env.COMMIT_SHA;
    process.env.GIT_COMMIT = 'other-sha';
    try {
      const info = getGitCommitInfo(f.path);
      expect(info.commit).toBe('abc123');
      expect(info.source).toBe('image');
      expect(info.mismatch).toBe(true);
      expect(info.consistent).toBe(false);
    } finally {
      f.cleanup();
    }
  });

  it('treats a legacy GIT_COMMIT as an uncorroborated last resort', () => {
    delete process.env.SOURCE_COMMIT;
    delete process.env.GITHUB_SHA;
    delete process.env.COMMIT_SHA;
    process.env.GIT_COMMIT = 'legacy-sha';
    const info = getGitCommitInfo('/definitely/not/a/real/file');
    expect(info.commit).toBe('legacy-sha');
    expect(info.source).toBe('legacy-env');
    expect(info.consistent).toBe(false);
  });

  it('reports unknown (never a stale match) when neither a file nor any commit env exists', () => {
    delete process.env.GIT_COMMIT;
    delete process.env.SOURCE_COMMIT;
    delete process.env.GITHUB_SHA;
    delete process.env.COMMIT_SHA;
    const info = getGitCommitInfo('/definitely/not/a/real/file');
    expect(info.commit).toBe('unknown');
    expect(info.source).toBe('unknown');
    expect(info.consistent).toBe(false);
    expect(info.mismatch).toBe(false);
    expect(getGitCommit()).toBe('unknown');
  });
});