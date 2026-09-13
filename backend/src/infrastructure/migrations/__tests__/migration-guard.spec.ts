// ============================================================================
// CourtZon Migration Environment Guard — unit tests
//
// Executes the REAL shared guard (`backend/scripts/migration-guard.sh`) via a
// discovered shell and asserts the fail-closed classification policy:
//   local      -> LOCAL_DOCKER_ONLY runs
//   production -> LOCAL_DOCKER_ONLY skipped (never executed, never recorded)
//   unknown    -> LOCAL_DOCKER_ONLY skipped (never executed, never recorded)
//   PRODUCTION_SAFE / unmarked -> runs in every environment (backward compat)
//   malformed marker (INVALID) -> fail-closed outside explicit local
// ============================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  findShell,
  probeGuard,
  writeFixture,
  makeTempDir,
  projectRoot,
  GUARD_SCRIPT,
} from './migration-guard-test-helper';

const LOCAL_MARKER = '-- COURTZON_MIGRATION_ENV: LOCAL_DOCKER_ONLY\nCREATE TABLE t(id int);';
const PROD_MARKER = '-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE\nCREATE TABLE t(id int);';
const NO_MARKER = 'CREATE TABLE t(id int);';
const INVALID_MARKER = '-- COURTZON_MIGRATION_ENV: NOT_A_REAL_ENV\nCREATE TABLE t(id int);';
const LOWERCASE_MARKER = '-- COURTZON_MIGRATION_ENV: local_docker_only\nCREATE TABLE t(id int);';
const MARKER_IN_MIDDLE = 'CREATE TABLE t(id int);\n-- COURTZON_MIGRATION_ENV: LOCAL_DOCKER_ONLY\n';

describe('migration guard — environment detection (explicit signal only)', () => {
  const shell = findShell();
  const dir = makeTempDir();

  it('resolves COURTZON_MIGRATION_ENV=local to local', () => {
    const f = writeFixture(dir, 'x.sql', LOCAL_MARKER);
    expect(probeGuard(shell, f, 'local').env).toBe('local');
  });

  it('resolves COURTZON_MIGRATION_ENV=production to production', () => {
    const f = writeFixture(dir, 'x.sql', LOCAL_MARKER);
    expect(probeGuard(shell, f, 'production').env).toBe('production');
  });

  it('treats an unset variable as unknown (never local)', () => {
    const f = writeFixture(dir, 'x.sql', LOCAL_MARKER);
    expect(probeGuard(shell, f, null).env).toBe('unknown');
  });

  it('treats an unrecognized variable value as unknown (fail-closed)', () => {
    const f = writeFixture(dir, 'x.sql', LOCAL_MARKER);
    expect(probeGuard(shell, f, 'anything-else').env).toBe('unknown');
  });
}, 60000);

describe('migration guard — decision matrix', () => {
  const shell = findShell();
  const dir = makeTempDir();
  let localFile: string;
  let prodFile: string;
  let noneFile: string;
  let invalidFile: string;
  let middleFile: string;

  beforeAll(() => {
    localFile = writeFixture(dir, 'local.sql', LOCAL_MARKER);
    prodFile = writeFixture(dir, 'prod.sql', PROD_MARKER);
    noneFile = writeFixture(dir, 'none.sql', NO_MARKER);
    invalidFile = writeFixture(dir, 'invalid.sql', INVALID_MARKER);
    middleFile = writeFixture(dir, 'middle.sql', MARKER_IN_MIDDLE);
  });

  it('CASE A / #1 — local executes LOCAL_DOCKER_ONLY', () => {
    const p = probeGuard(shell, localFile, 'local');
    expect(p.cls).toBe('LOCAL_DOCKER_ONLY');
    expect(p.decision).toBe('RUN');
  });

  it('CASE B / #2 — production skips LOCAL_DOCKER_ONLY', () => {
    const p = probeGuard(shell, localFile, 'production');
    expect(p.decision).toBe('SKIP');
    expect(p.reason).toContain('LOCAL_DOCKER_ONLY');
  });

  it('CASE D / #3 — unknown env skips LOCAL_DOCKER_ONLY', () => {
    expect(probeGuard(shell, localFile, null).decision).toBe('SKIP');
    expect(probeGuard(shell, localFile, 'garbage').decision).toBe('SKIP');
  });

  it('CASE C / #5 — PRODUCTION_SAFE + unmarked still execute in production', () => {
    expect(probeGuard(shell, prodFile, 'production').decision).toBe('RUN');
    expect(probeGuard(shell, noneFile, 'production').decision).toBe('RUN');
    expect(probeGuard(shell, prodFile, null).decision).toBe('RUN');
    expect(probeGuard(shell, noneFile, null).decision).toBe('RUN');
  });

  it('#6/#E — local migration stays eligible when not yet recorded (runner dedups by history)', () => {
    // The guard has no history awareness; it must report RUN so the runner's
    // history-dedup branch is what prevents duplicates (verified by the
    // integration spec). Repeated probes are deterministic.
    expect(probeGuard(shell, localFile, 'local').decision).toBe('RUN');
    expect(probeGuard(shell, localFile, 'local').decision).toBe('RUN');
  });

  it('#7/#F — repeated production startup keeps local-only migration pending', () => {
    // Repeated production probes consistently SKIP (never recorded).
    expect(probeGuard(shell, localFile, 'production').decision).toBe('SKIP');
    expect(probeGuard(shell, localFile, 'production').decision).toBe('SKIP');
  });

  it('#8 — classification parsing is deterministic and content-based', () => {
    for (let i = 0; i < 3; i++) {
      expect(probeGuard(shell, localFile, 'local').cls).toBe('LOCAL_DOCKER_ONLY');
      expect(probeGuard(shell, prodFile, 'production').cls).toBe('PRODUCTION_SAFE');
      expect(probeGuard(shell, noneFile, 'production').cls).toBe('PRODUCTION_SAFE');
    }
    // Marker found anywhere in the file, not just the header.
    expect(probeGuard(shell, middleFile, 'local').cls).toBe('LOCAL_DOCKER_ONLY');
    expect(probeGuard(shell, middleFile, 'production').decision).toBe('SKIP');
  }, 60000);

  it('#9 — malformed metadata fails safely (INVALID only runs in explicit local)', () => {
    const p = probeGuard(shell, invalidFile, 'production');
    expect(p.cls).toBe('INVALID');
    expect(p.decision).toBe('SKIP');
    expect(p.reason).toContain('fail-closed');
    expect(probeGuard(shell, invalidFile, null).decision).toBe('SKIP');
    // Lowercase (non-canonical) marker value is not a recognized token → INVALID.
    expect(probeGuard(shell, writeFixture(dir, 'lower.sql', LOWERCASE_MARKER), 'production').cls).toBe('INVALID');
  });

  it('#10 — ordering is unchanged: classification is a pure function of content', () => {
    // Same content, different filename → identical classification + decision.
    const a = writeFixture(dir, 'aaa.sql', PROD_MARKER);
    const b = writeFixture(dir, 'zzz.sql', PROD_MARKER);
    expect(probeGuard(shell, a, 'production').cls).toBe(probeGuard(shell, b, 'production').cls);
    expect(probeGuard(shell, a, 'production').decision).toBe(probeGuard(shell, b, 'production').decision);
    // The runners still iterate the lexicographic `*.sql` glob (no reordering
    // was introduced); the guard never sorts or mutates the file list.
  });
}, 60000);

describe('migration guard — real migration files classified as intended', () => {
  const shell = findShell();

  it('157 and 158 are PRODUCTION_SAFE', () => {
    for (const f of ['157_match_result_system.sql', '158_academy_ownership_coach_setup.sql']) {
      const p = probeGuard(shell, join(projectRoot, 'database', 'migrations', f), 'production');
      expect(p.cls).toBe('PRODUCTION_SAFE');
      expect(p.decision).toBe('RUN');
    }
  });

  it('159–162 (Academy G2–G8) are PRODUCTION_SAFE — promoted from LOCAL_DOCKER_ONLY (Phase 0 / Group 3)', () => {
    // Direct verification of the live Hostinger DB (2026-09-13) confirmed
    // migrations 159–162 are applied and recorded in production migration_history
    // (production is at migration 162). The Academy G2–G8 schema is current
    // production state, so the baseline and migration history must tell the same
    // story: these migrations run in every environment.
    for (const f of [
      '159_academy_scheduling.sql',
      '160_academy_confirmation.sql',
      '161_academy_capacity_waitlist.sql',
      '162_academy_enrollment_payments.sql',
    ]) {
      const path = join(projectRoot, 'database', 'migrations', f);
      for (const env of ['production', null, 'local']) {
        const p = probeGuard(shell, path, env);
        expect(p.cls).toBe('PRODUCTION_SAFE');
        expect(p.decision).toBe('RUN');
      }
    }
  });

  it('no migration file in database/migrations is currently LOCAL_DOCKER_ONLY (baseline must equal production state)', () => {
    // Static content check — the guard classifies by marker token in the file
    // content, so this is equivalent to a per-file guard probe without one bash
    // spawn per file. Deep guard semantics are exercised on specific files above.
    const dir = join(projectRoot, 'database', 'migrations');
    const localOnly = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => /COURTZON_MIGRATION_ENV:\s*LOCAL_DOCKER_ONLY/.test(readFileSync(join(dir, f), 'utf8')));
    expect(localOnly).toEqual([]);
  });

  it('the pre-existing production chain (e.g. 156) remains unmarked → PRODUCTION_SAFE', () => {
    const p = probeGuard(
      shell,
      join(projectRoot, 'database', 'migrations', '156_coach_service_locations_and_branch_policy.sql'),
      'production',
    );
    expect(p.cls).toBe('PRODUCTION_SAFE');
    expect(p.decision).toBe('RUN');
  });
}, 60000);

describe('migration guard — enforced in BOTH execution paths', () => {
  it('docker-entrypoint.sh sources the guard and gates the loop with it', () => {
    const ep = readFileSync(join(projectRoot, 'backend', 'docker-entrypoint.sh'), 'utf8');
    expect(ep).toContain('migration-guard.sh');
    expect(ep).toContain('courtzon_migration_should_run');
    // The policy gate must appear before the migration_history INSERT (skip is
    // never recorded).
    const gateIdx = ep.indexOf('courtzon_migration_should_run');
    const insertIdx = ep.indexOf('INSERT IGNORE INTO migration_history');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(gateIdx);
  });

  it('scripts/migrate.sh sources the guard and gates the loop with it', () => {
    const ms = readFileSync(join(projectRoot, 'scripts', 'migrate.sh'), 'utf8');
    expect(ms).toContain('migration-guard.sh');
    expect(ms).toContain('courtzon_migration_should_run');
    const gateIdx = ms.indexOf('courtzon_migration_should_run');
    // lastIndexOf targets the apply_migrations INSERT (apply_baseline has an
    // earlier identical literal).
    const insertIdx = ms.lastIndexOf('INSERT IGNORE INTO $TRACKING_TABLE');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(gateIdx);
  });

  it('the fresh-baseline branch stamps migration_history (restart never replays the patch chain)', () => {
    const ep = readFileSync(join(projectRoot, 'backend', 'docker-entrypoint.sh'), 'utf8');
    // BOOT 1 (fresh DB) must stamp history for guard-eligible files right after
    // the baseline/seed import, so BOOT 2 (restart) sees a full history and
    // never replays the additive 001-162 chain over a baseline-hydrated DB.
    const stampMarker = 'Stamping migration_history';
    const stampIdx = ep.indexOf(stampMarker);
    const seedIdx = ep.indexOf('Importing seed data');
    const stampSection = ep.slice(stampIdx, stampIdx + 1400);
    expect(seedIdx).toBeGreaterThan(-1);
    expect(stampIdx).toBeGreaterThan(seedIdx);
    expect(stampSection).toContain('INSERT IGNORE INTO migration_history');
    expect(stampSection).toContain('courtzon_migration_should_run');
    expect(stampSection).toContain('SHA2');
  });

  it('the guard script itself is present and parseable', () => {
    const g = readFileSync(GUARD_SCRIPT, 'utf8');
    expect(g).toContain('COURTZON_MIGRATION_ENV');
    expect(g).toContain('LOCAL_DOCKER_ONLY');
    expect(g).toContain('PRODUCTION_SAFE');
  });
});