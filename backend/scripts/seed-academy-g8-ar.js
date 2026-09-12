/**
 * Seed Arabic translations for Academy G8.4 UI keys (player self-service payment).
 * Uses the existing `translations` table exactly as the Translation Admin UI
 * writes them — idempotent upsert, EN untouched.
 *
 * Usage (dev/CI only; never point at production without review):
 *   node backend/scripts/seed-academy-g8-ar.js
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envPath = resolve(__dirname, '../.env');
const fileEnv = {};
try {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    fileEnv[key] = val;
  }
} catch { /* no .env */ }

function env(key, fallback) {
  return process.env[key] || fileEnv[key] || fallback;
}

const DB_NAME = env('DB_NAME', 'courtzon_v3');
const config = {
  host: env('DB_HOST', 'localhost'),
  port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'root'),
  password: env('DB_PASSWORD', ''),
};

const AR_TRANSLATIONS = {
  'player.academy.pay_now': 'ادفع الآن',
  'player.academy.payment_required': 'الدفع مطلوب',
  'player.academy.payment_success': 'تم تأكيد الدفع',
  'player.academy.payment_processing': 'الدفع قيد المعالجة',
  'player.academy.payment_processing_note': 'جارٍ تأكيد الدفع…',
  'player.academy.payment_processing_short': 'تم إرسال الدفع — قد يستغرق التأكيد لحظة',
  'player.academy.payment_failed': 'فشل الدفع',
  'player.academy.payment_unavailable': 'الدفع غير متاح',
  'player.academy.payment_cancelled': 'تم إلغاء الدفع',
  'player.academy.wallet': 'المحفظة',
  'player.academy.card': 'بطاقة',
  'player.academy.card_note': 'بطاقة مدين / ائتمان',
  'player.academy.insufficient_balance': 'رصيد غير كافٍ',
  'player.academy.try_again': 'حاول مرة أخرى',
  'player.academy.no_payment_required': 'لا يلزم الدفع',
};

async function main() {
  const conn = await mysql.createConnection(config);
  await conn.query(`USE \`${DB_NAME}\``);

  let inserted = 0;
  let updated = 0;
  for (const [key, value] of Object.entries(AR_TRANSLATIONS)) {
    const [result] = await conn.query(
      `INSERT INTO translations (\`key\`, locale, value, is_auto)
       VALUES (?, 'ar', ?, 0)
       ON DUPLICATE KEY UPDATE value = VALUES(value), is_auto = 0`,
      [key, value],
    );
    if (result.insertId) inserted++;
    else if (result.affectedRows > 0) updated++;
  }

  console.log(`G8.4 seed complete: ${inserted} AR rows inserted, ${updated} AR rows updated`);
  await conn.end();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});