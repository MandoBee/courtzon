/**
 * Seed Arabic translations for Academy G4 UI keys (capacity override + waitlist
 * promotion/replacement). Uses the existing `translations` table exactly as the
 * Translation Admin UI writes them — idempotent upsert, EN untouched.
 *
 * Usage (dev/CI only; never point at production without review):
 *   node backend/scripts/seed-academy-g4-ar.js
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
  'admin.academy.capacity_title': 'السعة',
  'admin.academy.capacity_original': 'الحد الأقصى الأصلي',
  'admin.academy.capacity_effective': 'الحد الأقصى الفعلي',
  'admin.academy.capacity_confirmed': 'المؤكد',
  'admin.academy.capacity_available': 'المتاح',
  'admin.academy.capacity_unlimited': 'غير محدود',
  'admin.academy.capacity_override_active': 'الاستثناء نشط',
  'admin.academy.capacity_override_expiry': 'ينتهي',
  'admin.academy.capacity_override_button': 'تجاوز الحد الأقصى',
  'admin.academy.capacity_override_amount': 'المقاعد الإضافية',
  'admin.academy.capacity_override_until': 'ينتهي (اختياري)',
  'admin.academy.capacity_override_reason': 'السبب (مطلوب)',
  'admin.academy.capacity_override_save': 'حفظ الاستثناء',
  'admin.academy.capacity_override_remove': 'إزالة الاستثناء',
  'admin.academy.capacity_override_remove_reason': 'سبب الإزالة (مطلوب)',
  'admin.academy.capacity_override_saved': 'تم حفظ استثناء السعة',
  'admin.academy.capacity_override_removed': 'تمت إزالة استثناء السعة',
  'admin.academy.waitlist_promote': 'ترقية',
  'admin.academy.waitlist_replace': 'استبدال',
  'admin.academy.waitlist_replace_reason': 'سبب الاستبدال خارج الترتيب (مطلوب)',
  'admin.academy.waitlist_promoted': 'تمت ترقية اللاعب من قائمة الانتظار',
  'admin.academy.waitlist_replaced': 'تم استبدال اللاعب',
  'admin.academy.capacity_started': 'بدأ',
  'admin.academy.capacity_not_started': 'لم يبدأ',
  'admin.academy.capacity_waiting': 'بانتظار',
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

  console.log(`G4 seed complete: ${inserted} AR rows inserted, ${updated} AR rows updated`);
  await conn.end();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});