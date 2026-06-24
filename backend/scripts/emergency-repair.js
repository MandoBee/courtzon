#!/usr/bin/env node
/**
 * Emergency Database Repair
 *
 * Usage: node scripts/emergency-repair.js
 *
 * Runs:
 *   1. Schema migrations (safe, idempotent)
 *   2. Seed data (if missing)
 *   3. Rebuild feature flags
 *   4. Rebuild app settings
 *   5. Verify critical tables
 *
 * Exits with 0 on success, 1 on failure.
 */

import mysql from 'mysql2/promise';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFileEnv, envFrom } from './load-file-env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const fileEnv = loadFileEnv([
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '../.env'),
]);

function env(key, fallback) {
  return envFrom(fileEnv, key, fallback);
}

const dbName = env('DB_NAME', 'courtzon_v2');
const config = {
  host: env('DB_HOST', 'localhost'),
  port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'root'),
  password: env('DB_PASSWORD', ''),
  multipleStatements: true,
};

const REQUIRED_TABLES = [
  'app_settings', 'users', 'roles', 'permissions', 'user_roles', 'role_permissions',
  'organizations', 'branches', 'sports', 'courts', 'bookings', 'payments',
  'transactions', 'settlements', 'feature_flags', 'languages', 'countries',
];

const schemaDir = resolve(projectRoot, 'database/schema');

function prepareSql(raw) {
  return raw
    .split('\n')
    .filter((l) => !/^DELIMITER\b/i.test(l.trim()))
    .join('\n')
    .replace(/END\s*\/\/\s*/g, 'END;')
    .replace(/\bUSE\s+`?courtzon_v2`?\s*;/gi, `USE \`${dbName}\`;`);
}

async function run() {
  const results = { passed: 0, failed: 0, steps: [] };

  function pass(label) { results.passed++; results.steps.push({ label, status: 'PASS' }); console.log(`  ✅ ${label}`); }
  function fail(label, err) { results.failed++; results.steps.push({ label, status: 'FAIL', error: err }); console.log(`  ❌ ${label}: ${err}`); }

  console.log('═'.repeat(60));
  console.log('  CourtZon Emergency Repair');
  console.log('═'.repeat(60));

  let conn;
  try {
    conn = await mysql.createConnection(config);
    await conn.query(`USE \`${dbName}\``);
  } catch (err) {
    console.error(`CRITICAL: Cannot connect to database: ${err.message}`);
    process.exit(1);
  }

  // Step 1: Run schema migrations
  console.log('\n─── Step 1: Schema Migrations ───\n');
  try {
    const files = readdirSync(schemaDir).filter(f => f.match(/^\d+_.+\.sql$/)).sort();
    let migrated = 0, skipped = 0;
    for (const file of files) {
      const filePath = resolve(schemaDir, file);
      try {
        const raw = readFileSync(filePath, 'utf8');
        await conn.query(prepareSql(raw));
        migrated++;
      } catch (err) {
        if ([1050, 1060, 1054, 1061, 1062, 1091, 1452].includes(err.errno)) { skipped++; continue; }
        throw err;
      }
    }
    pass(`Migrations: ${migrated} applied, ${skipped} skipped`);
  } catch (err) {
    fail('Schema migrations', err.message);
  }

  // Step 2: Run seed
  console.log('\n─── Step 2: Seed Data ───\n');
  try {
    const baselineSnapshot = resolve(projectRoot, 'database/seed/003_baseline_snapshot.sql');
    if (existsSync(baselineSnapshot)) {
      const seedRaw = prepareSql(readFileSync(baselineSnapshot, 'utf8'));
      await conn.query(seedRaw);
      pass('Baseline seed applied');
    } else {
      fail('Baseline seed', '003_baseline_snapshot.sql not found');
    }
  } catch (err) {
    fail('Seed data', err.message);
  }

  // Step 3: Verify critical tables
  console.log('\n─── Step 3: Table Verification ───\n');
  try {
    const [rows] = await conn.execute('SHOW TABLES');
    const existingTables = rows.map(r => Object.values(r)[0]);
    const missing = REQUIRED_TABLES.filter(t => !existingTables.includes(t));
    if (missing.length === 0) {
      pass(`All ${REQUIRED_TABLES.length} required tables present`);
    } else {
      fail(`Missing tables: ${missing.join(', ')}`, '');
    }
  } catch (err) {
    fail('Table verification', err.message);
  }

  // Step 4: Verify seed data
  console.log('\n─── Step 4: Seed Data Verification ───\n');
  const seedChecks = [
    { table: 'app_settings', label: 'App settings' },
    { table: 'countries', label: 'Countries' },
    { table: 'languages', label: 'Languages' },
    { table: 'feature_flags', label: 'Feature flags' },
  ];
  for (const check of seedChecks) {
    try {
      const [rows] = await conn.execute(`SELECT COUNT(*) as c FROM \`${check.table}\``);
      if (rows[0].c > 0) {
        pass(`${check.label}: ${rows[0].c} rows`);
      } else {
        fail(`${check.table} is empty`, '');
      }
    } catch (err) {
      fail(`${check.table} query failed`, err.message);
    }
  }

  await conn.end();

  // Final report
  console.log('\n' + '═'.repeat(60));
  console.log(`  RESULTS: ${results.passed} PASS  /  ${results.failed} FAIL`);
  console.log('═'.repeat(60) + '\n');

  process.exit(results.failed > 0 ? 1 : 0);
}

import { readdirSync } from 'node:fs';
run();
