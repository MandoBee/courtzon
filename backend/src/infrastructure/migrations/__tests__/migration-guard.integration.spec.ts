// ============================================================================
// CourtZon Migration Environment Guard — integration (migration_history
// semantics) against the local Docker MySQL (127.0.0.1:3307).
//
// Uses a THROWAWAY database (`courtzon_mig_guard_test_*`) that is created in
// beforeAll and dropped in afterAll — the dev `courtzon_v3` database is never
// touched. The apply loop below mirrors the runner (docker-entrypoint.sh /
// scripts/migrate.sh) structure exactly:
//    1. policy gate  -> real guard script (fail-closed skip, never recorded)
//    2. history dedup -> skip if filename already recorded
//    3. apply SQL + record only on success
// The classification/selection logic under test is the REAL shared guard.
// ============================================================================
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { findShell, shouldRun, makeTempDir, projectRoot } from './migration-guard-test-helper';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'courtzon2026';

const SHELL = findShell();
let admin: mysql.Connection;
let pool: mysql.Pool;
let dbName: string;
let migrationsDir: string;

const FILES = [
  'guard_001_prod_safe.sql',
  'guard_002_local_only.sql',
  'guard_003_invalid.sql',
  'guard_004_unmarked.sql',
];

async function historyCount(filename: string): Promise<number> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    'SELECT COUNT(*) AS c FROM migration_history WHERE filename = ?',
    [filename],
  );
  return Number((rows[0] as any).c);
}

async function tableExists(name: string): Promise<boolean> {
  const [rows] = await pool.execute<mysql.RowDataPacket[]>(
    'SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [dbName, name],
  );
  return Number((rows[0] as any).c) > 0;
}

/**
 * Minimal runner harness. `envValue` is the COURTZON_MIGRATION_ENV value
 * (null = unset/unknown). Skips are never executed and never recorded.
 */
async function applyLoop(envValue: string | null): Promise<string[]> {
  const applied: string[] = [];
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const fname of files) {
    const file = join(migrationsDir, fname);
    if (!shouldRun(SHELL, file, envValue)) continue; // policy skip — never recorded
    if ((await historyCount(fname)) > 0) continue;   // already applied
    const sql = readFileSync(file, 'utf8');
    await pool.query(sql);
    await pool.execute(
      'INSERT INTO migration_history (filename, hash) VALUES (?, SHA2(?, 256))',
      [fname, fname],
    );
    applied.push(fname);
  }
  return applied;
}

async function resetDb(): Promise<void> {
  for (const t of ['guard_prod_safe', 'guard_local_only', 'guard_invalid', 'guard_unmarked']) {
    await pool.query(`DROP TABLE IF EXISTS \`${t}\``);
  }
  await pool.query(`TRUNCATE TABLE \`migration_history\``);
}

beforeAll(async () => {
  admin = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'courtzon2026',
  });
  dbName = `courtzon_mig_guard_test_${Date.now()}`;
  await admin.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();

  pool = mysql.createPool({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'courtzon2026',
    database: dbName,
    connectionLimit: 5,
  });
  await pool.query(
    `CREATE TABLE migration_history (
       id INT AUTO_INCREMENT PRIMARY KEY,
       filename VARCHAR(255) NOT NULL UNIQUE,
       hash VARCHAR(64) NOT NULL,
       applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       execution_ms INT DEFAULT 0
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  migrationsDir = makeTempDir('cz-mig-int-');
  writeFileSync(
    join(migrationsDir, 'guard_001_prod_safe.sql'),
    '-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE\nCREATE TABLE guard_prod_safe (id int primary key);\n',
  );
  writeFileSync(
    join(migrationsDir, 'guard_002_local_only.sql'),
    '-- COURTZON_MIGRATION_ENV: LOCAL_DOCKER_ONLY\nCREATE TABLE guard_local_only (id int primary key);\n',
  );
  writeFileSync(
    join(migrationsDir, 'guard_003_invalid.sql'),
    '-- COURTZON_MIGRATION_ENV: NOT_A_REAL_ENV\nCREATE TABLE guard_invalid (id int primary key);\n',
  );
  writeFileSync(
    join(migrationsDir, 'guard_004_unmarked.sql'),
    'CREATE TABLE guard_unmarked (id int primary key);\n',
  );
});

afterAll(async () => {
  try {
    await pool.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  } finally {
    rmSync(migrationsDir, { recursive: true, force: true });
    await pool.end();
  }
});

describe('migration guard — migration_history semantics', () => {
  it('CASE A/E + #6 — local executes LOCAL_DOCKER_ONLY and records it exactly once', async () => {
    await resetDb();
    const first = await applyLoop('local');
    expect(first).toContain('guard_002_local_only.sql');
    expect(await tableExists('guard_local_only')).toBe(true);
    expect(await historyCount('guard_002_local_only.sql')).toBe(1);

    // Second startup (local) — already recorded → no duplicate execution.
    const second = await applyLoop('local');
    expect(second).not.toContain('guard_002_local_only.sql');
    expect(await historyCount('guard_002_local_only.sql')).toBe(1);
    // Every eligible file applied+recorded once.
    expect(await historyCount('guard_001_prod_safe.sql')).toBe(1);
    expect(await historyCount('guard_004_unmarked.sql')).toBe(1);
  });

  it('CASE B + #4/#7 — production skips LOCAL_DOCKER_ONLY and NEVER records it', async () => {
    await resetDb();
    await applyLoop('production');
    expect(await tableExists('guard_local_only')).toBe(false);
    expect(await historyCount('guard_002_local_only.sql')).toBe(0);
    expect(await tableExists('guard_invalid')).toBe(false);
    expect(await historyCount('guard_003_invalid.sql')).toBe(0);

    // Repeated production startups keep it pending (still not recorded).
    await applyLoop('production');
    expect(await historyCount('guard_002_local_only.sql')).toBe(0);

    // Production-safe + unmarked migrations still apply + record in production.
    expect(await tableExists('guard_prod_safe')).toBe(true);
    expect(await historyCount('guard_001_prod_safe.sql')).toBe(1);
    expect(await tableExists('guard_unmarked')).toBe(true);
    expect(await historyCount('guard_004_unmarked.sql')).toBe(1);
  });

  it('CASE D + #3 — unknown env skips LOCAL_DOCKER_ONLY', async () => {
    await resetDb();
    await applyLoop(null);
    expect(await tableExists('guard_local_only')).toBe(false);
    expect(await historyCount('guard_002_local_only.sql')).toBe(0);
    // Unknown env still applies production-safe (backward compatibility).
    expect(await tableExists('guard_prod_safe')).toBe(true);
  });

  it('a migration skipped in production can later be applied in local (pending, not lost)', async () => {
    await resetDb();
    await applyLoop('production');
    expect(await historyCount('guard_002_local_only.sql')).toBe(0);
    await applyLoop('local');
    expect(await tableExists('guard_local_only')).toBe(true);
    expect(await historyCount('guard_002_local_only.sql')).toBe(1);
  });
});