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
//
// The committed `database/baseline/001_courtzon_v3.manifest.json` is generated
// from this exact file plus the migration chain. The count and index/FK checks
// below therefore assert manifest-derived facts instead of loose substrings or
// lower bounds.
// ============================================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { projectRoot } from './migration-guard-test-helper.js';
import { parseSql, type ParsedSql } from '../baseline/parse-baseline.js';
import { parseManifest, type Manifest } from '../baseline/baseline-manifest.js';

const baselinePath = resolve(projectRoot, 'database/baseline/001_courtzon_v3.sql');
const manifestPath = resolve(projectRoot, 'database/baseline/001_courtzon_v3.manifest.json');
const migrationsDir = join(projectRoot, 'database', 'migrations');

let baseline: string;
let baselineModel: ParsedSql;
let manifest: Manifest;

const tableOf = (name: string) => {
  const table = baselineModel.tables.find((candidate) => candidate.name === name);
  if (!table) throw new Error(`table '${name}' is missing from the baseline`);
  return table;
};

// The guard classifies by CONTENT. The exact marker token is what the guard
// regex-searches for, so a static content check is equivalent to a guard probe
// and avoids one bash spawn per file (~169).
const LOCAL_ONLY_MARKER_RE = /COURTZON_MIGRATION_ENV:\s*LOCAL_DOCKER_ONLY/;
const isLocalOnly = (sql: string): boolean => LOCAL_ONLY_MARKER_RE.test(sql);

beforeAll(() => {
  baseline = readFileSync(baselinePath, 'utf8');
  baselineModel = parseSql(baseline, 'baseline');
  manifest = parseManifest(readFileSync(manifestPath, 'utf8'));
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
  it('contains exactly the manifest-derived table count (no loose lower bound)', () => {
    // The manifest is generated from this same file and pinned by
    // baseline-manifest.spec.ts. A catastrophic truncation OR an accidental
    // duplicate now fails with an exact count, not `>= 290`.
    const names = baselineModel.tables.map((table) => table.name);
    expect(names).toHaveLength(manifest.schema.tableCount);
    expect(manifest.schema.tableCount).toBe(329);
    expect(new Set(names).size).toBe(329);
    expect(baselineModel.triggers).toHaveLength(manifest.schema.triggerCount);
    expect(manifest.schema.schemaHead).toBe('205');
  });

  it('contains required foundational tables', () => {
    for (const t of ['users', 'roles', 'permissions', 'bookings', 'general_ledger']) {
      expect(hasTable(t)).toBe(true);
    }
  });
});

describe('baseline converges the P1 schema gaps', () => {
  it('contains payment_allocations with exact columns, indexes and FK actions', () => {
    // Source of truth: database/migrations/178_payment_allocations.sql.
    const table = tableOf('payment_allocations');
    expect(table.columns.map((column) => column.name)).toEqual([
      'id',
      'payment_transaction_id',
      'series_id',
      'booking_id',
      'subtotal',
      'tax_amount',
      'commission_amount',
      'org_net_amount',
      'gross_amount',
      'currency',
      'refunded_amount',
      'status',
      'payment_method',
      'created_at',
      'updated_at',
    ]);

    const indexes = new Map(table.indexes.map((index) => [index.name, index]));
    expect([...indexes.keys()].sort()).toEqual([
      'idx_pa_booking',
      'idx_pa_payment',
      'idx_pa_series',
      'primary',
      'uk_pa_payment_booking',
    ]);
    expect(indexes.get('primary')).toMatchObject({
      unique: true,
      columns: [{ name: 'id' }],
    });
    expect(indexes.get('uk_pa_payment_booking')).toMatchObject({
      unique: true,
      columns: [{ name: 'payment_transaction_id' }, { name: 'booking_id' }],
    });
    expect(indexes.get('idx_pa_series')?.columns.map((column) => column.name)).toEqual(['series_id']);
    expect(indexes.get('idx_pa_booking')?.columns.map((column) => column.name)).toEqual(['booking_id']);
    expect(indexes.get('idx_pa_payment')?.columns.map((column) => column.name)).toEqual([
      'payment_transaction_id',
    ]);

    const fks = new Map(table.foreignKeys.map((fk) => [fk.name, fk]));
    expect(fks.get('fk_pa_payment_transaction')).toMatchObject({
      columns: ['payment_transaction_id'],
      referencedTable: 'payment_transactions',
      referencedColumns: ['id'],
      onDelete: 'RESTRICT',
      onUpdate: null,
    });
    expect(fks.get('fk_pa_booking_series')).toMatchObject({
      columns: ['series_id'],
      referencedTable: 'booking_series',
      referencedColumns: ['id'],
      onDelete: 'SET NULL',
      onUpdate: null,
    });
    expect(fks.get('fk_pa_booking')).toMatchObject({
      columns: ['booking_id'],
      referencedTable: 'bookings',
      referencedColumns: ['id'],
      onDelete: 'RESTRICT',
      onUpdate: null,
    });
  });

  it('contains the four convergence indexes with exact ordered columns', () => {
    // P1 adds the first three (migrations 005/038/083); idx_notifications_event
    // is the fourth convergence index and must stay present. Names alone are
    // not enough — an index moved to the wrong column must fail.
    const expected = [
      ['notifications', 'idx_notifications_event', ['event_name']],
      ['organisation_subscriptions', 'idx_status_enddate', ['subscription_status', 'end_date']],
      ['payment_transactions', 'idx_pt_status_created', ['payment_status', 'created_at']],
      ['professional_services', 'idx_ps_pp', ['professional_profile_id']],
    ] as const;
    for (const [tableName, indexName, columns] of expected) {
      const index = tableOf(tableName).indexes.find((candidate) => candidate.name === indexName);
      expect(index, `${tableName}.${indexName}`).toBeDefined();
      expect(index?.columns.map((column) => column.name)).toEqual([...columns]);
      expect(index?.unique).toBe(false);
      // The manifest must agree with the live parse for this exact index.
      const manifestIndex = manifest.schema.tables[tableName]?.signature.indexes.find(
        (candidate) => candidate.name === indexName,
      );
      expect(manifestIndex?.columns.map((column) => column.name)).toEqual([...columns]);
    }
  });
});

describe('baseline convergence decisions 1B/2A (P8.6.21)', () => {
  it('retains the academy FK + composite index and removes only the redundant named index', () => {
    const table = tableOf('academy_group_sessions');
    const indexNames = table.indexes.map((index) => index.name);
    expect(indexNames).not.toContain('fk_session_court');
    expect(indexNames).toContain('idx_academy_session_hold');
    const composite = table.indexes.find((index) => index.name === 'idx_academy_session_hold');
    expect(composite?.columns.map((column) => column.name)).toEqual([
      'court_id',
      'session_date',
      'reservation_status',
      'pending_expires_at',
    ]);
    const foreignKey = table.foreignKeys.find((fk) => fk.name === 'fk_session_court');
    expect(foreignKey).toMatchObject({
      columns: ['court_id'],
      referencedTable: 'resources',
      referencedColumns: ['id'],
      onDelete: 'SET NULL',
    });
  });

  it('contains the tournaments max-events CHECK in the authoritative baseline', () => {
    expect(baseline).toContain(
      'CONSTRAINT `chk_tournaments_max_events_per_player` CHECK ((max_events_per_player IS NULL) OR (max_events_per_player >= 1))',
    );
    const check = tableOf('tournaments').checks.find(
      (candidate) => candidate.name === 'chk_tournaments_max_events_per_player',
    );
    expect(check).toBeDefined();
  });

  it('registers migration 205 as the PRODUCTION_SAFE head with a guarded CHECK', () => {
    const path = join(migrationsDir, '205_tournaments_max_events_check.sql');
    const sql = readFileSync(path, 'utf8');
    expect(sql).toMatch(/^--\s*COURTZON_MIGRATION_ENV:\s*PRODUCTION_SAFE\s*$/m);
    expect(sql).toContain('information_schema.table_constraints');
    expect(sql).toContain('information_schema.check_constraints');
    expect(sql).toContain(
      'ADD CONSTRAINT `chk_tournaments_max_events_per_player` CHECK ((max_events_per_player IS NULL) OR (max_events_per_player >= 1))',
    );
    const executable = sql
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    expect(executable).not.toMatch(/DROP\s+(INDEX|TABLE|COLUMN|CONSTRAINT)/i);
    expect(manifest.schema.schemaHead).toBe('205');
    expect(manifest.migrations.count).toBe(212);
  });
});

describe('migration 204 restores the missing convergence index (roll-forward)', () => {
  const migrationPath = join(migrationsDir, '204_convergence_idx_status_enddate.sql');
  const readMigration = (): string => readFileSync(migrationPath, 'utf8');
  // Negative assertions must inspect executable SQL, not documentation comments.
  const executableSql = (sql: string): string =>
    sql
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');

  it('is production-safe, additive and guarded by information_schema', () => {
    const sql = readMigration();
    expect(sql).toMatch(/^--\s*COURTZON_MIGRATION_ENV:\s*PRODUCTION_SAFE\s*$/m);
    expect(sql).toContain('information_schema.statistics');
    expect(sql).toContain("table_name = 'organisation_subscriptions'");
    expect(sql).toContain("index_name = 'idx_status_enddate'");
    expect(sql).toContain('PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;');
    // MariaDB-only syntax must never be used on the MySQL chain.
    expect(executableSql(sql)).not.toMatch(/ADD\s+INDEX\s+IF\s+NOT\s+EXISTS/i);
  });

  it('creates the exact index definition and nothing else', () => {
    const sql = readMigration();
    expect(sql).toContain(
      'ALTER TABLE `organisation_subscriptions` ADD INDEX `idx_status_enddate` (`subscription_status`, `end_date`)',
    );
    const executable = executableSql(sql);
    expect(executable).not.toMatch(/DROP\s+(INDEX|TABLE|COLUMN)/i);
    expect(executable).not.toMatch(/\b(MODIFY|RENAME)\b/i);
    expect(executable).not.toMatch(/CHANGE\s+COLUMN/i);
  });

  it('matches migration 038 and the baseline definition', () => {
    const source = readFileSync(join(migrationsDir, '038_subscription_lifecycle.sql'), 'utf8');
    expect(source).toContain(
      'ADD INDEX `idx_status_enddate` (`subscription_status`, `end_date`)',
    );
    const index = tableOf('organisation_subscriptions').indexes.find(
      (candidate) => candidate.name === 'idx_status_enddate',
    );
    expect(index, 'organisation_subscriptions.idx_status_enddate').toBeDefined();
    expect(index?.columns.map((column) => column.name)).toEqual([
      'subscription_status',
      'end_date',
    ]);
    expect(index?.unique).toBe(false);
  });
});