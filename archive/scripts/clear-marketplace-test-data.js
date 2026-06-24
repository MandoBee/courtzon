/**
 * Clear all marketplace sales + settlement data for fresh testing.
 * Keeps: products, users, organisations, subscriptions, branches.
 * Deletes: settlements, orders, cart, marketplace/settlement transactions, ledger.
 *
 * Usage: node backend/scripts/clear-marketplace-test-data.js
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envPath = resolve(__dirname, '../.env');
const envContent = readFileSync(envPath, 'utf8');
const fileEnv = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  fileEnv[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
}

function env(key, fallback) {
  return process.env[key] || fileEnv[key] || fallback;
}

const config = {
  host: env('DB_HOST', 'localhost'),
  port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'root'),
  password: env('DB_PASSWORD', ''),
  database: env('DB_NAME', 'courtzon_v2'),
  multipleStatements: true,
};

async function main() {
  const conn = await mysql.createConnection(config);
  console.log('Connected to', config.database);

  // Show counts before
  const countsBefore = {};
  for (const table of ['settlements','settlement_orders','settlement_transfers','settlements_v1','settlement_items_v1',
                        'orders','order_items','cart_items','marketplace_ledger_entries',
                        'transactions','transaction_entries']) {
    try {
      const [r] = await conn.execute(`SELECT COUNT(*) as cnt FROM ${table}`);
      countsBefore[table] = r[0].cnt;
      console.log(`  ${table}: ${r[0].cnt} rows`);
    } catch { /* table may not exist */ }
  }

  console.log('\nClearing marketplace + settlement data...\n');

  // ── Order matters (FK dependencies) ──

  // 1. Settlement child tables
  await conn.execute('DELETE FROM settlement_transfers');
  console.log('  ✓ settlement_transfers');

  await conn.execute('DELETE FROM settlement_orders');
  console.log('  ✓ settlement_orders');

  // 2. Main settlement tables
  await conn.execute('DELETE FROM settlements');
  await conn.execute('ALTER TABLE settlements AUTO_INCREMENT = 1');
  console.log('  ✓ settlements');

  // 3. Old (v1) settlement tables
  await conn.execute('DELETE FROM settlement_items_v1');
  await conn.execute('DELETE FROM settlements_v1');
  await conn.execute('ALTER TABLE settlements_v1 AUTO_INCREMENT = 1');
  console.log('  ✓ settlements_v1 + settlement_items_v1');

  // 4. Marketplace ledger
  await conn.execute('DELETE FROM marketplace_ledger_entries');
  await conn.execute('ALTER TABLE marketplace_ledger_entries AUTO_INCREMENT = 1');
  console.log('  ✓ marketplace_ledger_entries');

  // 5. Order child tables
  await conn.execute('DELETE FROM order_status_history');
  console.log('  ✓ order_status_history');

  await conn.execute('DELETE FROM order_items');
  await conn.execute('ALTER TABLE order_items AUTO_INCREMENT = 1');
  console.log('  ✓ order_items');

  // 6. Coupon usage linked to orders (or all coupon usage)
  await conn.execute('DELETE FROM coupon_usage');
  console.log('  ✓ coupon_usage');

  // 7. Transaction entries for marketplace + settlement transactions
  const [txnIds] = await conn.execute(
    `SELECT id FROM transactions WHERE source_type IN ('marketplace', 'settlement') OR type IN ('marketplace_order', 'settlement_payout', 'payout')`
  );
  const ids = txnIds.map((r) => r.id);
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    await conn.execute(`DELETE FROM transaction_entries WHERE transaction_id IN (${placeholders})`, ids);
    console.log(`  ✓ transaction_entries (${ids.length} transactions)`);

    await conn.execute(`DELETE FROM transactions WHERE id IN (${placeholders})`, ids);
    console.log(`  ✓ transactions (${ids.length} rows)`);
  } else {
    console.log('  ✓ no marketplace/settlement transactions to delete');
  }

  // 8. Orders
  await conn.execute('DELETE FROM orders');
  await conn.execute('ALTER TABLE orders AUTO_INCREMENT = 1');
  console.log('  ✓ orders');

  // 9. Cart items
  await conn.execute('DELETE FROM cart_items');
  await conn.execute('ALTER TABLE cart_items AUTO_INCREMENT = 1');
  console.log('  ✓ cart_items');

  // ── Show counts after ──
  console.log('\nVerification:');
  for (const [table, before] of Object.entries(countsBefore)) {
    try {
      const [r] = await conn.execute(`SELECT COUNT(*) as cnt FROM ${table}`);
      console.log(`  ${table}: ${r[0].cnt} rows (was ${before})`);
    } catch { /* table may not exist */ }
  }

  console.log('\n✅ Marketplace + settlement test data cleared.');
  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
