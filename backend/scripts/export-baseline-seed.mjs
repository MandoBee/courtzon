#!/usr/bin/env node
/**
 * Export current MySQL data to database/seed/003_baseline_snapshot.sql
 * for use with: node backend/scripts/migrate.js --fresh --seed
 *
 * Usage:
 *   node backend/scripts/export-baseline-seed.mjs
 *   node backend/scripts/export-baseline-seed.mjs --dry-run
 */
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { loadFileEnv, envFrom } from './load-file-env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const seedDir = resolve(projectRoot, 'database/seed');

const fileEnv = loadFileEnv([
  resolve(projectRoot, '.env'),
  resolve(__dirname, '../.env'),
]);

function resolveDbHost(host) {
  if (!host || host === 'host.docker.internal' || host === 'mysql') return '127.0.0.1';
  return host;
}

const config = {
  host: resolveDbHost(envFrom(fileEnv, 'DB_HOST', '127.0.0.1')),
  port: Number(envFrom(fileEnv, 'DB_PORT', '3306')),
  user: envFrom(fileEnv, 'DB_USER', 'root'),
  password: envFrom(fileEnv, 'DB_PASSWORD', ''),
  database: envFrom(fileEnv, 'DB_NAME', 'courtzon_v2'),
};

/** Tables that must not be snapshotted (volatile / security / rebuild on use). */
const EXCLUDED_TABLES = new Set([
  'user_sessions',
  'user_devices',
  'password_reset_tokens',
  'email_verification_tokens',
  'audit_logs',
  'activity_logs',
  'notification_queue',
  'notifications',
  'login_attempts',
  'brute_force_lockouts',
  'contact_submissions',
  'cron_job_runs',
  'booking_slots',
  'bookings',
  'booking_participants',
  'booking_invitations',
  'booking_invitation_applications',
  'orders',
  'order_items',
  'cart_items',
  'wishlist_items',
  'wallet_transactions',
  'payment_transactions',
  'withdrawal_requests',
  'settlements',
  'settlement_items',
  'financial_entries',
  'transactions',
  'coach_sessions',
  'coach_reviews',
  'tournament_registrations',
  'tournament_matches',
  'tournament_match_scores',
  'academy_session_attendance',
  'academy_sessions',
  'academy_enrollments',
  'academy_evaluations',
  'organisation_upgrade_requests',
  'user_follows',
  'friend_requests',
  'conversation_participants',
  'conversations',
  'messages',
  'community_event_participants',
  'ad_impressions',
  'ad_clicks',
  'media_uploads',
]);

function sqlEscape(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
  if (typeof val === 'bigint') return String(val);
  if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
  if (Buffer.isBuffer(val)) return `X'${val.toString('hex')}'`;
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  }
  return `'${String(val).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function rowToInsert(table, columns, row) {
  const vals = columns.map((c) => sqlEscape(row[c]));
  return `(${vals.join(', ')})`;
}

async function getTables(conn) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME AS name
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
     ORDER BY TABLE_NAME`,
    [config.database],
  );
  return rows.map((r) => r.name);
}

async function exportTable(conn, table, write) {
  const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
  const columns = cols.map((c) => c.Field);
  const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
  if (!rows.length) return { table, rows: 0, bytes: 0 };

  const colList = columns.map((c) => `\`${c}\``).join(', ');
  const batchSize = 25;
  let written = 0;

  write(`\n-- Table: ${table} (${rows.length} rows)\n`);

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const values = chunk.map((row) => rowToInsert(table, columns, row)).join(',\n');
    write(`INSERT IGNORE INTO \`${table}\` (${colList}) VALUES\n${values};\n`);
    written += chunk.length;
  }

  const maxId = columns.includes('id')
    ? rows.reduce((m, r) => (r.id != null && Number(r.id) > m ? Number(r.id) : m), 0)
    : 0;

  return { table, rows: written, maxId };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`Export baseline seed from ${config.host}:${config.port}/${config.database}`);

  const conn = await mysql.createConnection({ ...config, multipleStatements: true });
  const tables = (await getTables(conn)).filter((t) => !EXCLUDED_TABLES.has(t));

  const manifest = {
    exportedAt: new Date().toISOString(),
    database: config.database,
    excludedTables: [...EXCLUDED_TABLES].sort(),
    tables: [],
  };

  if (dryRun) {
    for (const table of tables) {
      const [[{ c }]] = await conn.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
      if (c > 0) manifest.tables.push({ table, rows: c });
    }
    console.log(JSON.stringify(manifest, null, 2));
    await conn.end();
    return;
  }

  mkdirSync(seedDir, { recursive: true });
  const outPath = resolve(seedDir, '003_baseline_snapshot.sql');
  const manifestPath = resolve(seedDir, 'baseline-manifest.json');

  const stream = createWriteStream(outPath, 'utf8');
  const write = (s) => stream.write(s);

  write('-- ============================================================================\n');
  write('-- COURTZON-V2 : BASELINE SNAPSHOT SEED (auto-generated — do not hand-edit)\n');
  write(`-- Generated: ${manifest.exportedAt}\n`);
  write('-- Regenerate: node backend/scripts/export-baseline-seed.mjs\n');
  write('-- Apply:      node backend/scripts/migrate.js --fresh --seed\n');
  write('-- ============================================================================\n\n');
  write('USE courtzon_v2;\n\n');
  write('SET NAMES utf8mb4;\n');
  write('SET FOREIGN_KEY_CHECKS = 0;\n');

  for (const table of tables) {
    try {
      const stats = await exportTable(conn, table, write);
      if (stats.rows > 0) {
        manifest.tables.push(stats);
        console.log(`  ${table}: ${stats.rows} rows`);
        if (stats.maxId > 0) {
          write(`ALTER TABLE \`${table}\` AUTO_INCREMENT = ${stats.maxId + 1};\n`);
        }
      }
    } catch (err) {
      console.warn(`  SKIP ${table}: ${err.message}`);
    }
  }

  write('\nSET FOREIGN_KEY_CHECKS = 1;\n');
  stream.end();

  await new Promise((resolvePromise, reject) => {
    stream.on('finish', resolvePromise);
    stream.on('error', reject);
  });

  manifest.totalRows = manifest.tables.reduce((s, t) => s + t.rows, 0);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  await conn.end();
  console.log(`\nWrote ${outPath}`);
  console.log(`Wrote ${manifestPath} (${manifest.tables.length} tables, ${manifest.totalRows} rows)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
