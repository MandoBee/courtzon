/**
 * Test helper for the CourtZon migration environment guard
 * (`backend/scripts/migration-guard.sh`). Executes the REAL guard script via a
 * discovered shell so the unit + integration tests exercise the exact policy
 * shipped to the Docker entrypoint and scripts/migrate.sh — never a re-
 * implementation.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repo root (…/backend/src/infrastructure/migrations/__tests__ → repo root). */
export const projectRoot = resolve(__dirname, '..', '..', '..', '..', '..');

export const GUARD_SCRIPT = join(projectRoot, 'backend', 'scripts', 'migration-guard.sh');

export const GIT_BASH_CANDIDATES = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
];

/** Shell path used for child-process probes (normalized for the shell). */
export function findShell(): string {
  const candidates = process.env.COURTZON_TEST_SHELL
    ? [process.env.COURTZON_TEST_SHELL]
    : ['bash', ...GIT_BASH_CANDIDATES, '/bin/bash', '/usr/bin/bash', 'sh'];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const r = spawnSync(c, ['-c', 'echo ok'], { encoding: 'utf8', timeout: 15000 });
      if (r.status === 0 && (r.stdout || '').includes('ok')) return c;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    'No usable shell found to execute the migration guard. Set COURTZON_TEST_SHELL to a bash/sh path.',
  );
}

export interface GuardProbe {
  env: string | null;
  cls: 'LOCAL_DOCKER_ONLY' | 'PRODUCTION_SAFE' | 'INVALID' | string;
  decision: 'RUN' | 'SKIP';
  reason: string;
}

/**
 * Run the real guard functions against `file` under the given
 * `COURTZON_MIGRATION_ENV` value (`null` = unset).
 */
export function probeGuard(shell: string, file: string, envValue: string | null): GuardProbe {
  const tmp = mkdtempSync(join(tmpdir(), 'cz-guard-'));
  const scriptFile = join(tmp, 'probe.sh');
  const fileArg = file.replace(/\\/g, '/');
  const lines = [
    `source "${GUARD_SCRIPT.replace(/\\/g, '/')}"`,
    envValue === null ? 'unset COURTZON_MIGRATION_ENV' : `export COURTZON_MIGRATION_ENV="${envValue}"`,
    `echo "ENV=$(courtzon_migration_env)"`,
    `echo "CLS=$(courtzon_migration_classify "${fileArg}")"`,
    `if courtzon_migration_should_run "${fileArg}"; then echo "DECISION=RUN"; else echo "DECISION=SKIP"; fi`,
    `echo "REASON=$(courtzon_migration_skip_reason "${fileArg}")"`,
  ];
  writeFileSync(scriptFile, lines.join('\n'), 'utf8');
  const r = spawnSync(shell, [scriptFile.replace(/\\/g, '/')], { encoding: 'utf8', timeout: 30000 });
  rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) {
    throw new Error(`guard probe failed (status ${r.status}): ${r.stderr}\n${r.stdout}`);
  }
  const pick = (key: string): string => {
    const m = r.stdout.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return m ? m[1] : '';
  };
  const env = pick('ENV');
  return {
    env: env === '' ? null : env,
    cls: pick('CLS'),
    decision: pick('DECISION') as GuardProbe['decision'],
    reason: pick('REASON'),
  };
}

/** Boolean form of the guard decision (true = eligible to run). */
export function shouldRun(shell: string, file: string, envValue: string | null): boolean {
  return probeGuard(shell, file, envValue).decision === 'RUN';
}

/** Write a synthetic migration fixture to a temp dir; returns its path. */
export function writeFixture(dir: string, name: string, content: string): string {
  const p = join(dir, name);
  writeFileSync(p, content, 'utf8');
  return p;
}

export function makeTempDir(prefix = 'cz-mig-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}