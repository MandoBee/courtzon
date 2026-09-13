// ============================================================================
// CourtZon — Baseline ↔ Migration coherence (static, no DB touched).
//
// Phase 0 / Group 3 mandated: "Migration state and baseline state must tell the
// SAME STORY."
//
// After the 159–162 (Academy G2–G8) promotion to PRODUCTION_SAFE, the single
// authoritative baseline `database/baseline/001_courtzon_v3.sql` must contain
// every production-safe migrated object (including `academy_enrollment_payments`
// from migration 162) and must NOT contain any object owned by a migration that
// is still classified LOCAL_DOCKER_ONLY (fail-closed: local-only objects never
// ship through baseline hydration).
// ============================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { projectRoot } from './migration-guard-test-helper';

const baselinePath = resolve(projectRoot, 'database/baseline/001_courtzon_v3.sql');
const migrationsDir = join(projectRoot, 'database', 'migrations');

let baseline: string;

// The guard classifies by CONTENT. The exact marker token is what the guard
// regex-searches for, so a static content check is equivalent to a guard probe
// and avoids one bash spawn per file (~169).
const LOCAL_ONLY_MARKER_RE = /COURTZON_MIGRATION_ENV:\s*LOCAL_DOCKER_ONLY/;
const isLocalOnly = (sql: string): boolean => LOCAL_ONLY_MARKER_RE.test(sql);

beforeAll(() => {
  baseline = readFileSync(baselinePath, 'utf8');
});

const hasTable = (table: string): boolean => {
  return (
    baseline.includes('CREATE TABLE `' + table + '`') ||
    baseline.includes('CREATE TABLE IF NOT EXISTS `' + table + '`') ||
    baseline.includes('CREATE TABLE ' + table + ' (')
  );
};

const tableNamesIn = (sql: string): string[] => {
  const names: string[] = [];
  const re = /CREATE TABLE(?: IF NOT EXISTS)? `?([a-zA-Z0-9_]+)`? \(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) names.push(m[1]);
  return names;
};

describe('baseline contains the full production-safe schema (through migration 162)', () => {
  it('contains the Academy G2–G8 objects shipped by migrations 159–162', () => {
    // Migration 159 — academy_schedules + session scheduling/hold columns.
    expect(hasTable('academy_schedules')).toBe(true);
    expect(baseline).toContain('reservation_status');
    expect(baseline).toContain('uk_academy_session_generation');
    // Migration 160 — confirmation lifecycle columns.
    expect(baseline).toContain('confirmed_at');
    expect(baseline).toContain('payment_confirmed_at');
    // Migration 161 — capacity + waitlist columns.
    expect(baseline).toContain('original_capacity');
    expect(baseline).toContain('capacity_override_amount');
    // Migration 162 — enrollment payment snapshot table.
    expect(hasTable('academy_enrollment_payments')).toBe(true);
  });

  it('contains the earlier production-safe Academy + match-result objects (157/158)', () => {
    expect(hasTable('match_result_records')).toBe(true);
    expect(baseline).toContain('organisation_id'); // migration 158 on academy_programs
    expect(baseline).toContain('lifecycle_state');
  });
});

describe('baseline never leaks LOCAL_DOCKER_ONLY objects (fail-closed, future-proof)', () => {
  it('no object owned by a LOCAL_DOCKER_ONLY migration appears in the baseline', () => {
    // For every migration currently carrying a LOCAL_DOCKER_ONLY marker, none of
    // the tables it CREATEs may be present in the baseline. (Today every
    // migration is PRODUCTION_SAFE so the set is empty; if a dev later adds a
    // LOCAL_DOCKER_ONLY migration that CREATEs a table, this test fails unless
    // that table is kept out of the production baseline.)
    const offenders: string[] = [];
    for (const fname of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(migrationsDir, fname), 'utf8');
      if (!isLocalOnly(sql)) continue;
      for (const table of tableNamesIn(sql)) {
        if (hasTable(table)) offenders.push(`${fname} -> ${table}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the baseline file itself carries no LOCAL_DOCKER_ONLY migration marker', () => {
    // Promotional comments legitimately mention "promoted from LOCAL_DOCKER_ONLY";
    // what must never appear is the machine-readable MARKER the guard acts on.
    expect(LOCAL_ONLY_MARKER_RE.test(baseline)).toBe(false);
    expect(baseline).not.toContain('MUST NEVER be applied to');
  });

  it('baseline is portable (no DEFINER= SQL comments block fresh hydration)', () => {
    expect(baseline).not.toContain('DEFINER=');
  });

  it('the migration chain has no LOCAL_DOCKER_ONLY file remaining', () => {
    const localOnly = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => isLocalOnly(readFileSync(join(migrationsDir, f), 'utf8')));
    expect(localOnly).toEqual([]);
  });
});

describe('baseline sanity bounds', () => {
  it('contains the expected number of tables (>= 290 as of migration 162)', () => {
    // The baseline was pushed well past 280 by earlier enterprise tables; the
    // current repository holds ~305 tables in the live databases. Keep a loose
    // lower bound so a catastrophic truncation of the baseline is caught.
    const count = (baseline.match(/CREATE TABLE(?: IF NOT EXISTS)? `[a-zA-Z0-9_]+`/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(290);
  });

  it('contains required foundational tables', () => {
    for (const t of ['users', 'roles', 'permissions', 'bookings', 'general_ledger']) {
      expect(hasTable(t)).toBe(true);
    }
  });
});