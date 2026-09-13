// ============================================================================
// CourtZon — Baseline ↔ migration CONVERGENCE (integration, real SQL).
//
// Proves the Phase 0 / Group 3 model end-to-end against a THROWAWAY database
// (`courtzon_baseline_conv_*`) on the local Docker MySQL stack, faithful to the
// Docker entrypoint boot lifecycle:
//
//   BOOT 1 (fresh DB): import baseline + seed, then stamp migration_history for
//     every guard-eligible file (the entrypoint no longer relies on the DB being
//     empty on restart — stamps so the patch chain is never replayed over a
//     baseline-hydrated DB).
//   BOOT 2 (restart): the migration loop sees a full migration_history and must
//     apply NOTHING — the schema must be byte-identical after the restart run.
//
// Assertions:
//   A. Fresh hydration carries the full production-safe schema (through 162),
//      including Academy G2–G8 objects.
//   B. The hydrated table set == the chain-applied reference (`courtzon_v3`),
//      which == production (verified 2026-09-13): same story everywhere.
//   C. Academy + match-result columns match the reference column-for-column.
//   D. Restart lifecycle is idempotent: second loop run applies nothing and the
//      schema is unchanged (guards mig/n+061-style destructive replays).
//   E. History is full and consistent (169 rows; Academy 157–162 recorded).
//
// The development `courtzon_v3` database is only READ (information_schema).
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createConnection } from 'mysql2/promise';
import { findShell, shouldRun, projectRoot } from './migration-guard-test-helper';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'courtzon2026';

const DB_HOST = '127.0.0.1';
const DB_PORT = 3307;
const DB_USER = 'root';
const DB_PASSWORD = 'courtzon2026';
const REFERENCE_DB = 'courtzon_v3'; // chain-applied reference (read-only use)
const MYSQL_CONTAINER = 'courtzon-mysql';

const MIGRATIONS_DIR = join(projectRoot, 'database', 'migrations');
const BASELINE_PATH = join(projectRoot, 'database', 'baseline', '001_courtzon_v3.sql');
const SHELL = findShell();

const MIG_FILES: string[] = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

let admin: any;
let dbName: string;
let schemaHydrated: Record<string, string[]>;
let schemaAfterRestart: Record<string, string[]>;
let historyTotal: number;
let appliedOnRestart: string[];

/** Run SQL with the REAL mysql client inside the MySQL container. */
function mysqlImport(sql: string): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(
    'docker',
    ['exec', '-i', MYSQL_CONTAINER, 'mysql', '-N', '-B', '-h', '127.0.0.1', '-P', '3306', '-u', DB_USER, `-p${DB_PASSWORD}`, dbName],
    { input: sql, encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024 },
  );
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

async function conn(database?: string) {
  return createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database,
    timezone: 'Z',
  });
}

/** Map: table -> sorted list of "column TYPE NULL/NOT NULL" */
async function schemaSignature(db: string): Promise<Record<string, string[]>> {
  const c = await conn();
  try {
    const [cols] = await c.execute(
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [db],
    );
    const map: Record<string, string[]> = {};
    for (const row of cols as any[]) {
      const key = String(row.TABLE_NAME);
      (map[key] ??= []).push(`${row.COLUMN_NAME} ${row.COLUMN_TYPE} ${row.IS_NULLABLE}`);
    }
    for (const k of Object.keys(map)) map[k].sort();
    return map;
  } finally {
    await c.end();
  }
}

async function tableNames(db: string): Promise<string[]> {
  const s = await schemaSignature(db);
  return Object.keys(s).sort();
}

async function historyCount(db: string, filename: string): Promise<number> {
  const c = await conn();
  try {
    const [rows] = await c.execute('SELECT COUNT(*) AS c FROM `' + db + '`.migration_history WHERE filename = ?', [filename]);
    return Number((rows as any)[0].c);
  } finally {
    await c.end();
  }
}

async function tableExists(db: string, table: string): Promise<boolean> {
  const c = await conn();
  try {
    const [rows] = await c.execute(
      'SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
      [db, table],
    );
    return Number((rows as any)[0].c) > 0;
  } finally {
    await c.end();
  }
}

/**
 * BOOT 2 restart loop — mirror of docker-entrypoint.sh's else-branch: guard gate
 * → history dedup → apply → INSERT IGNORE stamp. Returns files actually applied.
 */
async function restartMigrationLoop(db: string): Promise<string[]> {
  const applied: string[] = [];
  for (const fname of MIG_FILES) {
    const file = join(MIGRATIONS_DIR, fname);
    if (!shouldRun(SHELL, file, 'local')) continue; // policy skip — never recorded
    if ((await historyCount(db, fname)) > 0) continue; // already applied
    const sql = readFileSync(file, 'utf8');
    mysqlImport(sql); // apply (errors tolerated — entrypoint semantics)
    const r = await conn();
    try {
      await r.query('INSERT IGNORE INTO `' + db + '`.migration_history (filename, hash) VALUES (?, SHA2(?, 256))', [
        fname,
        fname,
      ]);
    } finally {
      await r.end();
    }
    applied.push(fname);
  }
  return applied;
}

beforeAll(async () => {
  admin = await conn();
  dbName = `courtzon_baseline_conv_${Date.now()}`;
  await admin.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

  // ── BOOT 1: fresh baseline hydration exactly like the entrypoint ──
  const base = readFileSync(BASELINE_PATH, 'utf8');
  const imp = mysqlImport(base);
  expect(imp.status).toBe(0);
  const realErrors = imp.stderr.split('\n').filter((l) => l.trim() !== '' && !l.includes('Using a password on the command line'));
  expect(realErrors).toEqual([]);

  // Entrypoint fresh-branch stamping (post-fix): create history + stamp every
  // guard-eligible file so restarts never replay the patch chain.
  const cr = await conn();
  try {
    await cr.query(`CREATE TABLE \`${dbName}\`.migration_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      hash VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      execution_ms INT DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  } finally {
    await cr.end();
  }
  for (const fname of MIG_FILES) {
    if (!shouldRun(SHELL, join(MIGRATIONS_DIR, fname), 'local')) continue;
    const r = await conn();
    try {
      await r.query('INSERT IGNORE INTO `' + dbName + '`.migration_history (filename, hash) VALUES (?, SHA2(?, 256))', [
        fname,
        fname,
      ]);
    } finally {
      await r.end();
    }
  }
  const [h] = await admin.execute(`SELECT COUNT(*) AS c FROM \`${dbName}\`.migration_history`);
  historyTotal = Number((h as any)[0].c);

  schemaHydrated = await schemaSignature(dbName);

  // ── BOOT 2: restart migration loop must apply nothing ──
  appliedOnRestart = await restartMigrationLoop(dbName);
  schemaAfterRestart = await schemaSignature(dbName);
}, 900000);

afterAll(async () => {
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  } finally {
    await admin.end();
  }
}, 30000);

describe('A — fresh baseline hydration carries the full production-safe schema (through 162)', () => {
  it('Academy G2–G8 objects exist immediately after baseline import', async () => {
    expect(await tableExists(dbName, 'academy_schedules')).toBe(true);
    expect(await tableExists(dbName, 'academy_enrollment_payments')).toBe(true);
    expect(await tableExists(dbName, 'academy_group_sessions')).toBe(true);
    expect(await tableExists(dbName, 'match_result_records')).toBe(true);
    expect(await tableExists(dbName, 'academy_enrollments')).toBe(true);
  }, 60000);

  it('hydrated table set (incl. runtime migration_history) == chain-applied reference table set', async () => {
    const fresh = (await tableNames(dbName)).sort();
    const reference = (await tableNames(REFERENCE_DB)).sort();
    expect(fresh).toEqual(reference);
  }, 60000);
});

describe('B — restart lifecycle is idempotent (no migration replayed over the baseline)', () => {
  it('the restart migration loop applies NOTHING (history already stamped)', () => {
    expect(appliedOnRestart).toEqual([]);
  });

  it('schema after restart == schema at hydration (nothing duplicated, nothing lost)', () => {
    expect(Object.keys(schemaHydrated).length).toBeGreaterThan(290);
    for (const table of Object.keys(schemaHydrated)) {
      expect(schemaAfterRestart[table]).toEqual(schemaHydrated[table]);
    }
  }, 60000);

  it('the destructive 061 replay trap is neutralised: academy_enrollments survives the restart', () => {
    expect(schemaAfterRestart['academy_enrollments']).toEqual(schemaHydrated['academy_enrollments']);
    expect(schemaAfterRestart['academy_enrollments_legacy']).toBeUndefined();
  });
});

describe('C — hydrated schema structurally matches the chain-applied reference', () => {
  it('every Academy + match-result column matches the reference (column-for-column)', async () => {
    const fresh = await schemaSignature(dbName);
    const reference = await schemaSignature(REFERENCE_DB);
    for (const t of [
      'academy_schedules',
      'academy_enrollment_payments',
      'academy_group_sessions',
      'academy_programs',
      'academy_enrollments',
      'academy_groups',
      'match_result_records',
      'match_result_participants',
    ]) {
      expect(fresh[t]).toEqual(reference[t]);
    }
  }, 60000);
});

describe('D — migration history consistency', () => {
  it('history count equals the number of migration files (169)', () => {
    expect(historyTotal).toBe(MIG_FILES.length);
  });

  it('Academy migrations 157–162 are recorded (same story as production)', async () => {
    for (const f of [
      '157_match_result_system.sql',
      '158_academy_ownership_coach_setup.sql',
      '159_academy_scheduling.sql',
      '160_academy_confirmation.sql',
      '161_academy_capacity_waitlist.sql',
      '162_academy_enrollment_payments.sql',
    ]) {
      expect(await historyCount(dbName, f)).toBe(1);
    }
  }, 60000);
});