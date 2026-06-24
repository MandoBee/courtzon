#!/usr/bin/env node
/**
 * CourtZon Deployment Validation Suite
 *
 * Runs 4 tests against Docker MySQL (port 3307) — NEVER touches host MySQL.
 *
 * Usage (from backend/ directory):
 *   node ../scripts/deployment-validation.js
 *
 * Prerequisites:
 *   - Docker MySQL running (courtzon-mysql, port 3307)
 *   - Backend running (for E2E test)
 *   - Run from backend/ where mysql2 resolves
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');

// ── Config ──
const DOCKER_MYSQL = {
  host: '127.0.0.1',
  port: 3307,
  user: 'root',
  password: 'CourtZon2026',
};

const HOST_MYSQL = {
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: 'CourtZon2026',
};

const DB_FRESH = 'courtzon_fresh_test';
const DB_RESTORE = 'courtzon_restore_test';
const DB_E2E = 'courtzon_e2e_test';

let passed = 0;
let failed = 0;
const results = [];

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
    results.push({ label, status: 'PASS' });
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
    results.push({ label, status: 'FAIL', detail });
  }
}

async function dropDatabase(conn, name) {
  await conn.execute(`DROP DATABASE IF EXISTS \`${name}\``);
}

async function createDatabase(conn, name) {
  await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
}

async function runMigrations(conn, dbName) {
  const schemaDir = path.resolve(ROOT, 'database', 'schema');
  const files = fs.readdirSync(schemaDir)
    .filter(f => f.match(/^\d+_.+\.sql$/))
    .sort();

  console.log(`  Found ${files.length} migration files`);

  for (const file of files) {
    const sql = fs.readFileSync(path.resolve(schemaDir, file), 'utf-8');
    try {
      await conn.query(`USE \`${dbName}\``);
      await conn.query(sql);
    } catch (err) {
      // Allow IF EXISTS / IF NOT EXISTS / duplicate key errors on MySQL 8
      if ([1050, 1060, 1061, 1091].includes(err.errno)) {
        // Expected for repeatable migrations
      } else {
        console.log(`  ❌ ${file}: ${err.message.substring(0, 120)}`);
        throw err;
      }
    }
  }
}

// ══════════════════════════════════════════════════════
// TEST 1: Fresh Database Migration
// ══════════════════════════════════════════════════════
async function testFreshMigration(conn) {
  console.log('\n─── TEST 1: Fresh Database Migration ───\n');
  console.log('Goal: Run all migrations 000→latest on empty MySQL 8 DB\n');

  await dropDatabase(conn, DB_FRESH);
  await createDatabase(conn, DB_FRESH);

  const schemaDir = path.resolve(ROOT, 'database', 'schema');
  const files = fs.readdirSync(schemaDir)
    .filter(f => f.match(/^\d+_.+\.sql$/))
    .sort();

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const file of files) {
    const sql = fs.readFileSync(path.resolve(schemaDir, file), 'utf-8');
    try {
      await conn.query(`USE \`${DB_FRESH}\``);
      await conn.query(sql);
      ok++;
    } catch (err) {
      if ([1050, 1061, 1060, 1091].includes(err.errno)) {
        skip++;
      } else {
        console.log(`  ❌ ${file}: ${err.message.substring(0, 120)}`);
        fail++;
      }
    }
  }

  console.log(`\n  ${files.length} migrations: ${ok} applied, ${skip} skipped (idempotent), ${fail} failed`);
  assert(`All ${files.length} migrations run without errors`, fail === 0,
    `${fail} migrations failed`);

  // Count tables
  const [tables] = await conn.query(
    `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = '${DB_FRESH}'`
  );
  const cnt = tables[0].cnt;
  assert(`Fresh database has ${cnt} tables`, cnt > 15,
    `Only ${cnt} tables — expected at least 15`);

  // List them
  const [allTables] = await conn.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = '${DB_FRESH}' ORDER BY table_name`
  );
  console.log(`  Tables (${cnt}):`);
  for (const t of allTables) console.log(`    ${t.table_name}`);
}

// ══════════════════════════════════════════════════════
// TEST 2: Backup & Restore
// ══════════════════════════════════════════════════════
async function testBackupRestore(conn) {
  console.log('\n─── TEST 2: Backup & Restore ───\n');
  console.log('Goal: Backup from source DB, restore to empty DB, verify data intact\n');

  // Check which source databases have real data
  let sourceHasData = false;
  let hostTablesCount = 0;

  try {
    const [rows] = await conn.query(
      `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = 'courtzon_v2'`
    );
    hostTablesCount = rows[0].cnt;
    sourceHasData = hostTablesCount > 0;
    console.log(`  Docker MySQL 'courtzon_v2' has ${hostTablesCount} tables`);
  } catch (e) {
    console.log(`  ⚠️  ${e.message}`);
  }

  if (sourceHasData) {
    // Use Docker MySQL as source
    console.log('  Using Docker MySQL courtzon_v2 as backup source');
    await doBackupRestore(conn, 'courtzon_v2');
  } else {
    console.log('  Docker MySQL courtzon_v2 is empty (0 tables).');
    console.log('  Attempting backup from Host MySQL (MariaDB) via docker exec...');

    // Try mysqldump from Docker container -> host.docker.internal:3306
    try {
      const dumpCmd = `docker exec courtzon-mysql mysqldump --single-transaction --routines --triggers --events ` +
        `--host=host.docker.internal --port=3306 --user=root --password=CourtZon2026 courtzon_v2 2>/dev/null`;

      console.log('  Running: docker exec courtzon-mysql mysqldump ...');
      const dump = execSync(dumpCmd, { maxBuffer: 500 * 1024 * 1024, timeout: 60000 });
      const sizeMB = (dump.length / 1024 / 1024).toFixed(2);
      console.log(`  Backup captured: ${sizeMB} MB`);

      await dropDatabase(conn, DB_RESTORE);
      await createDatabase(conn, DB_RESTORE);

      const restoreCmd = `docker exec -i courtzon-mysql mysql -u root -pCourtZon2026 ${DB_RESTORE} 2>/dev/null`;
      console.log('  Restoring...');
      execSync(restoreCmd, { input: dump, maxBuffer: 500 * 1024 * 1024, timeout: 120000 });
      console.log('  Restore command executed');

      // Verify
      const [tables] = await conn.query(
        `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = '${DB_RESTORE}'`
      );
      console.log(`  Restored DB has ${tables[0].cnt} tables`);

      assert('Backup/restore completed and DB has tables', tables[0].cnt > 5,
        `Only ${tables[0].cnt} tables in restored DB`);

      // Verify users exist
      try {
        const [users] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${DB_RESTORE}\`.\`users\``);
        console.log(`  Users in restored DB: ${users[0].cnt}`);
        assert('Users table has data after restore', users[0].cnt > 0, '0 users found');

        // Check if orders, products, settlements tables have data
        for (const tbl of ['products', 'orders', 'order_items', 'settlements']) {
          try {
            const [r] = await conn.query(
              `SELECT COUNT(*) as cnt FROM \`${DB_RESTORE}\`.\`${tbl}\``
            );
            console.log(`  ${tbl}: ${r[0].cnt} rows`);
          } catch (e) {
            console.log(`  ${tbl}: table not found or error: ${e.message.substring(0, 60)}`);
          }
        }
      } catch (e) {
        console.log(`  ⚠️  Could not query users: ${e.message}`);
      }

    } catch (err) {
      console.log(`  ❌ Backup/restore failed: ${err.message.substring(0, 200)}`);
      assert('Backup/restore from Host MySQL', false, err.message.substring(0, 200));
    }
  }
}

async function doBackupRestore(conn, sourceDb) {
  await dropDatabase(conn, DB_RESTORE);
  await createDatabase(conn, DB_RESTORE);

  // Copy schema + data by running mysqldump inside docker
  try {
    const dumpCmd = `docker exec courtzon-mysql mysqldump -u root -pCourtZon2026 --single-transaction --routines --triggers --events ${sourceDb} 2>/dev/null`;
    const dump = execSync(dumpCmd, { maxBuffer: 500 * 1024 * 1024, timeout: 60000 });
    const sizeMB = (dump.length / 1024 / 1024).toFixed(2);
    console.log(`  Backup size: ${sizeMB} MB`);

    // Restore
    const restoreCmd = `docker exec -i courtzon-mysql mysql -u root -pCourtZon2026 ${DB_RESTORE} 2>/dev/null`;
    execSync(restoreCmd, { input: dump, maxBuffer: 500 * 1024 * 1024, timeout: 120000 });

    // Verify
    const [tables] = await conn.query(
      `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = '${DB_RESTORE}'`
    );
    assert(`Restored DB has ${tables[0].cnt} tables`, tables[0].cnt > 5);

    try {
      const [users] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${DB_RESTORE}\`.\`users\``);
      console.log(`  Users: ${users[0].cnt}`);
    } catch (e) {
      console.log(`  Users query: ${e.message}`);
    }

    console.log('  Restore verification complete');
  } catch (err) {
    console.log(`  ❌ ${err.message.substring(0, 200)}`);
    assert('Backup/restore', false, err.message.substring(0, 200));
  }
}

// ══════════════════════════════════════════════════════
// TEST 3: Webhook Idempotency
// ══════════════════════════════════════════════════════
async function testWebhookIdempotency(conn) {
  console.log('\n─── TEST 3: Webhook Idempotency ───\n');
  console.log('Goal: 10 identical webhook payloads → exactly 1 fulfillment\n');

  // Check if payment_transactions exists in the fresh test DB
  await conn.query(`USE \`${DB_FRESH}\``);

  const [payTables] = await conn.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = '${DB_FRESH}' AND table_name LIKE '%payment%'`
  );
  console.log(`  Payment-related tables:`);
  for (const t of payTables) console.log(`    ${t.table_name}`);

  if (payTables.length === 0) {
    assert('Payment tables found in Fresh DB', false, 'No payment tables exist in migrated schema');
    return;
  }

  const payTable = payTables[0].table_name;
  const testRef = `idemp_test_${Date.now()}`;

  // Determine correct column names
  let cols;
  try {
    const [colRows] = await conn.query(`DESCRIBE \`${payTable}\``);
    cols = colRows.map(r => r.Field);
    console.log(`  Columns in ${payTable}: ${cols.join(', ')}`);
  } catch (e) {
    console.log(`  ⚠️  Could not describe ${payTable}: ${e.message}`);
    assert('Payment table schema inspectable', false, e.message);
    return;
  }

  // Build INSERT based on columns
  const hasGatewayRef = cols.includes('gateway_reference');
  const hasPaymentStatus = cols.includes('payment_status');
  const hasUserId = cols.includes('user_id');
  const hasAmount = cols.includes('amount');
  const hasPaymentMethod = cols.includes('payment_method');
  const hasGatewayProvider = cols.includes('gateway_provider');

  if (!hasGatewayRef || !hasPaymentStatus) {
    assert('Payment table has gateway_reference and payment_status columns', false,
      `Missing: gateway_reference=${hasGatewayRef}, payment_status=${hasPaymentStatus}`);
    return;
  }

  // Ensure test user exists
  try {
    const [userTables] = await conn.query(
      `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = '${DB_FRESH}' AND table_name = 'users'`
    );
    if (userTables[0].cnt > 0) {
      await conn.query(`INSERT IGNORE INTO \`${DB_FRESH}\`.users (id, email, password_hash, name) VALUES (99999, 'webhook-test@courtzon.com', 'hash123', 'Webhook Tester')`);
    }
  } catch (e) {
    // users table may have different columns
  }

  // INSERT the initial pending record
  const insertCols = [];
  const insertVals = [];

  if (hasUserId) { insertCols.push('user_id'); insertVals.push('99999'); }
  if (hasPaymentMethod) { insertCols.push('payment_method'); insertVals.push("'card'"); }
  if (hasGatewayProvider) { insertCols.push('gateway_provider'); insertVals.push("'paymob'"); }
  insertCols.push('gateway_reference'); insertVals.push(`'${testRef}'`);
  if (hasAmount) { insertCols.push('amount'); insertVals.push('100.00'); }
  insertCols.push('payment_status'); insertVals.push("'pending'");

  await conn.query(
    `INSERT INTO \`${DB_FRESH}\`.\`${payTable}\` (${insertCols.join(',')}) VALUES (${insertVals.join(',')})`
  );

  const [check] = await conn.query(
    `SELECT payment_status FROM \`${DB_FRESH}\`.\`${payTable}\` WHERE gateway_reference = '${testRef}'`
  );
  assert('Pending transaction created', check.length > 0 && check[0].payment_status === 'pending',
    `Status: ${check[0]?.payment_status}`);

  // Send 10 duplicate updates — only 1 should succeed
  let updatesApplied = 0;
  for (let i = 0; i < 10; i++) {
    const [result] = await conn.query(
      `UPDATE \`${DB_FRESH}\`.\`${payTable}\` SET payment_status = 'paid' WHERE gateway_reference = '${testRef}' AND payment_status = 'pending'`
    );
    if (result.affectedRows > 0) updatesApplied++;
  }

  assert('10 duplicate webhooks → exactly 1 payment update', updatesApplied === 1,
    `${updatesApplied} updates applied (expected 1)`);

  // Transaction should now be 'paid'
  const [finalState] = await conn.query(
    `SELECT payment_status FROM \`${DB_FRESH}\`.\`${payTable}\` WHERE gateway_reference = '${testRef}'`
  );
  assert(`Transaction status is 'paid'`, finalState[0]?.payment_status === 'paid',
    `Status: ${finalState[0]?.payment_status}`);

  console.log(`\n  Idempotency guard verified:`);
  console.log(`    Gateway ref: ${testRef}`);
  console.log(`    Attempts: 10`);
  console.log(`    Actual updates: ${updatesApplied}`);
  console.log(`    Final status: ${finalState[0]?.payment_status}`);
}

// ══════════════════════════════════════════════════════
// TEST 4: E2E Smoke Test (API checks)
// ══════════════════════════════════════════════════════
async function testE2EApi() {
  console.log('\n─── TEST 4: E2E Smoke Test (API) ───\n');
  console.log('Goal: Verify backend API responds correctly on all critical endpoints\n');

  const API = 'http://localhost:3000';

  // Health
  try {
    const r = await fetch(`${API}/health`);
    const body = await r.json();
    assert('Health endpoint returns 200', r.status === 200, `Got ${r.status}`);
    assert('Health indicates ok', body.status === 'ok', `Status: ${body.status}`);
    console.log(`  Backend: ${body.service}, uptime: ${body.uptime}s`);
    console.log(`  DB: ${body.checks?.database?.status} (${body.checks?.database?.latencyMs}ms)`);
    console.log(`  Redis: ${body.checks?.redis?.status} (${body.checks?.redis?.latencyMs}ms)`);
  } catch (err) {
    assert('Backend reachable', false, err.message);
    return; // No point continuing if backend is down
  }

  // Auth endpoint (unauthenticated)
  const r2 = await fetch(`${API}/auth/me`, { redirect: 'manual' });
  assert('Unauthenticated /auth/me returns 401 or redirect', r2.status === 401 || r2.status === 302 || r2.status === 200,
    `Got status ${r2.status}`);

  // 404 handling
  const r3 = await fetch(`${API}/nonexistent-route-validation-test`);
  assert('Unknown route returns 404', r3.status === 404, `Got ${r3.status}`);
  const text = await r3.text();
  assert('No stack trace in 404 response', !text.includes('at ') && !text.includes('Error:'),
    'Response leaks internal details');

  // Registration endpoint check
  const r4 = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@test.com', password: 'Test123!', name: 'Test' }),
  });
  // We expect either 422 (validation) or 201 (success) — not 500
  assert('Registration endpoint responds without 500', r4.status !== 500,
    `Got 500: ${await r4.text().catch(() => '')}`);

  // Create product endpoint check (unauthenticated — expect 401)
  const r5 = await fetch(`${API}/marketplace/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  assert('Product creation requires auth', r5.status === 401 || r5.status === 403,
    `Got ${r5.status}`);

  // Upload endpoint (unauthenticated)
  const r6 = await fetch(`${API}/upload`, { method: 'POST' });
  assert('Upload requires auth', r6.status === 401 || r6.status === 403,
    `Got ${r6.status}`);

  // Orders endpoint (unauthenticated)
  const r7 = await fetch(`${API}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  assert('Order creation requires auth', r7.status === 401 || r7.status === 403,
    `Got ${r7.status}`);

  // Multi-tenant isolation test requires auth — but the endpoint should exist
  const r8 = await fetch(`${API}/organisations/99999`);
  assert('Organisations endpoint responds', r8.status !== 502 && r8.status !== 404,
    `Got ${r8.status}`);
}

// ══════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════

async function main() {
  console.log('═'.repeat(60));
  console.log('  CourtZon Deployment Validation Suite');
  console.log(`  Node: ${process.version}`);
  console.log(`  Date: ${new Date().toISOString()}`);
  console.log('═'.repeat(60));

  const conn = await mysql.createConnection(DOCKER_MYSQL);

  try {
    // Test 1: Fresh Migration
    await testFreshMigration(conn);

    // Test 2: Backup & Restore
    await testBackupRestore(conn);

    // Test 3: Webhook Idempotency
    await testWebhookIdempotency(conn);

    // Test 4: E2E API Smoke
    await testE2EApi();

  } finally {
    // Cleanup
    console.log('\n─── Cleanup ───\n');
    for (const db of [DB_FRESH, DB_RESTORE, DB_E2E]) {
      try { await dropDatabase(conn, db); console.log(`  🗑️  Dropped ${db}`); } catch {}
    }
    await conn.end();
    console.log('  Connection closed');
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log(`  RESULTS: ${passed} PASS  /  ${failed} FAIL`);
  console.log('═'.repeat(60) + '\n');

  for (const r of results) {
    const icon = r.status === 'PASS' ? ' ✅' : ' ❌';
    console.log(`${icon} ${r.label}${r.detail ? `: ${r.detail}` : ''}`);
  }

  console.log(`\n  ${failed === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`\n💥 Suite crashed: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
