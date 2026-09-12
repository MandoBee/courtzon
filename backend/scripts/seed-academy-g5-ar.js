/**
 * Seed Arabic translations for Academy G5 UI keys (session execution + roster +
 * attendance). Uses the existing `translations` table exactly as the Translation
 * Admin UI writes them — idempotent upsert, EN untouched.
 *
 * Usage (dev/CI only; never point at production without review):
 *   node backend/scripts/seed-academy-g5-ar.js
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
  'admin.academy.sessions_execution_title': 'الجلسات',
  'admin.academy.session_status_scheduled': 'مجدولة',
  'admin.academy.session_status_in_progress': 'قيد التنفيذ',
  'admin.academy.session_status_completed': 'مكتملة',
  'admin.academy.session_status_cancelled': 'ملغاة',
  'admin.academy.session_start': 'بدء',
  'admin.academy.session_complete': 'إكمال',
  'admin.academy.session_cancel': 'إلغاء الجلسة',
  'admin.academy.session_started': 'بدأت الجلسة',
  'admin.academy.session_completed': 'اكتملت الجلسة',
  'admin.academy.session_cancelled': 'أُلغيت الجلسة',
  'admin.academy.session_cancel_reason': 'سبب الإلغاء (اختياري)',
  'admin.academy.session_roster': 'القائمة',
  'admin.academy.session_summary': 'ملخص الحضور',
  'admin.academy.session_total': 'الإجمالي',
  'admin.academy.session_present': 'حاضر',
  'admin.academy.session_absent': 'غائب',
  'admin.academy.session_excused': 'معذور',
  'admin.academy.session_late': 'متأخر',
  'admin.academy.session_unmarked': 'غير مسجل',
  'admin.academy.session_progress': 'مسجل',
  'admin.academy.session_no_roster': 'لا يوجد لاعبون مؤكدون في هذه الجلسة',
  'admin.academy.session_select': 'اختر جلسة للإدارة',
  'admin.academy.session_attendance_locked': 'تم تثبيت الحضور لهذه الجلسة',
  'admin.sidebar.academy_sessions': 'الجلسات',
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

  console.log(`G5 seed complete: ${inserted} AR rows inserted, ${updated} AR rows updated`);
  await conn.end();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});