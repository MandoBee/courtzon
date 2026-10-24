import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../../../..');
const seedJs = resolve(projectRoot, 'backend/scripts/seed.js');

/**
 * Windows ships a `bash.exe` WSL launcher (C:\Windows\System32) that exits
 * non-zero when no WSL distribution is installed, while Git Bash may be
 * installed outside PATH. Resolve a genuinely working interpreter once and
 * hand it to every child process as BASH_BIN. The parent environment and PATH
 * are never modified.
 */
const WINDOWS_GIT_BASH_CANDIDATES = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
] as const;

function isWorkingBash(interpreter: string): boolean {
  const probe = spawnSync(interpreter, ['-c', 'exit 0'], { stdio: 'ignore', timeout: 15000 });
  return probe.error === undefined && probe.status === 0;
}

function resolveWorkingBash(): string {
  const configured = process.env.BASH_BIN;

  // 1. An explicitly configured interpreter always takes precedence.
  if (configured) {
    if (!isWorkingBash(configured)) {
      throw new Error(
        `BASH_BIN is set to "${configured}", but it is not a working bash interpreter. `
        + 'Point BASH_BIN at a functional bash executable '
        + '(for example "C:\\Program Files\\Git\\bin\\bash.exe").',
      );
    }
    return configured;
  }

  // 2. Probe whatever `bash` resolves to through PATH.
  if (isWorkingBash('bash')) {
    return 'bash';
  }

  // 3. On Windows only, fall back to the standard Git Bash locations.
  if (process.platform === 'win32') {
    for (const candidate of WINDOWS_GIT_BASH_CANDIDATES) {
      if (existsSync(candidate) && isWorkingBash(candidate)) {
        return candidate;
      }
    }
  }

  throw new Error(
    'No working bash interpreter found. The "bash" on PATH may be a non-functional '
    + 'WSL launcher. Install Git Bash or set BASH_BIN to a working bash executable '
    + '(for example "C:\\Program Files\\Git\\bin\\bash.exe").',
  );
}

const BASH_BIN = resolveWorkingBash();

describe('seed guard (fail-closed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects courtzon_v3 without explicit opt-in (full seed)', () => {
    const res = spawnSync(process.execPath, [seedJs], {
      env: { ...process.env, BASH_BIN, DB_NAME: 'courtzon_v3', ALLOW_PERSISTENT_SEED: 'false', NODE_ENV: 'development' },
      cwd: projectRoot,
    });
    expect(res.status).not.toBe(0);
    const out = (res.stderr?.toString() || res.stdout?.toString() || '');
    expect(out).toMatch(/Refusing to seed database 'courtzon_v3'/);
  });

  it('rejects courtzon_v3 without explicit opt-in (--seed-file)', () => {
    const res = spawnSync(process.execPath, [seedJs, '--seed-file', '001_baseline.sql'], {
      env: { ...process.env, BASH_BIN, DB_NAME: 'courtzon_v3', ALLOW_PERSISTENT_SEED: 'false', NODE_ENV: 'development' },
      cwd: projectRoot,
    });
    expect(res.status).not.toBe(0);
    const out = (res.stderr?.toString() || res.stdout?.toString() || '');
    expect(out).toMatch(/Refusing to seed database 'courtzon_v3'/);
  });

  it('NODE_ENV=test alone does not authorize persistent seeding', () => {
    const res = spawnSync(process.execPath, [seedJs], {
      env: { ...process.env, BASH_BIN, DB_NAME: 'courtzon_v3', ALLOW_PERSISTENT_SEED: 'false', NODE_ENV: 'test' },
      cwd: projectRoot,
    });
    expect(res.status).not.toBe(0);
  });

  it('CI=true alone does not authorize persistent seeding', () => {
    const res = spawnSync(process.execPath, [seedJs], {
      env: { ...process.env, BASH_BIN, DB_NAME: 'courtzon_v3', ALLOW_PERSISTENT_SEED: 'false', CI: 'true' },
      cwd: projectRoot,
    });
    expect(res.status).not.toBe(0);
  });

  it('rejects non-loopback host for courtzon_v3 even with opt-in', () => {
    const res = spawnSync(process.execPath, [seedJs], {
      env: { ...process.env, BASH_BIN, DB_NAME: 'courtzon_v3', DB_HOST: 'db.example.com', ALLOW_PERSISTENT_SEED: 'true' },
      cwd: projectRoot,
    });
    expect(res.status).not.toBe(0);
    const out = (res.stderr?.toString() || res.stdout?.toString() || '');
    expect(out).toMatch(/non-loopback/);
  });

  it('lists seed files with --list on a disposable target without contacting MySQL', () => {
    // DB_PORT points at a port nothing listens on. `--list` is a read-only mode
    // that must exit before the connection probe, so exit code 0 proves the
    // listing path never reaches the MySQL client. A regression that moved the
    // probe ahead of the listing would fail here with "Cannot connect to MySQL".
    const res = spawnSync(process.execPath, [seedJs, '--list'], {
      env: {
        ...process.env,
        BASH_BIN,
        DB_NAME: 'courtzon_test',
        DB_HOST: '127.0.0.1',
        DB_PORT: '1',
        ALLOW_PERSISTENT_SEED: 'false',
      },
      cwd: projectRoot,
      encoding: 'utf8',
    });

    expect(res.status).toBe(0);

    const out = String(res.stdout ?? '') + String(res.stderr ?? '');
    expect(out).toContain('Available seed files in');
    expect(out).toContain('001_baseline.sql');
    expect(out).not.toMatch(/Refusing to seed database/);
    expect(out).not.toMatch(/Cannot connect to MySQL/);
  });
});
