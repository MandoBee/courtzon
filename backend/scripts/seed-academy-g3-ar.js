/**
 * Seed Arabic translations for Academy G3 UI keys (confirmation lifecycle
 * modal: readiness, blockers, payment acknowledgment, overrides). Uses the
 * existing `translations` table exactly as the Translation Admin UI writes
 * them — idempotent upsert, EN untouched.
 *
 * Usage (dev/CI only; never point at production without review):
 *   node backend/scripts/seed-academy-g3-ar.js
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
  'admin.academy.confirmation_readiness_title': 'جاهزية التأكيد',
  'admin.academy.confirmation_not_ready': 'غير جاهز',
  'admin.academy.confirmation_ready': 'جاهز للتأكيد',
  'admin.academy.confirmation_blockers': 'لا يمكن تأكيد البرنامج حتى تُحلّ هذه المعوقات:',
  'admin.academy.confirmation_overview': 'نظرة عامة',
  'admin.academy.confirmation_stats_groups': 'المجموعات النشطة',
  'admin.academy.confirmation_stats_schedules': 'الجداول',
  'admin.academy.confirmation_stats_sessions': 'الجلسات القادمة',
  'admin.academy.confirmation_stats_finalizable': 'قيد التثبيت',
  'admin.academy.confirmation_stats_enrollments': 'التسجيلات المؤكدة',
  'admin.academy.confirmation_stats_unpaid': 'غير المدفوعة',
  'admin.academy.confirmation_blocker_ALREADY_CONFIRMED': 'مؤكد مسبقًا',
  'admin.academy.confirmation_blocker_MISSING_SCHEDULE': 'لا توجد جداول متكررة',
  'admin.academy.confirmation_blocker_MISSING_COACH': 'لا يوجد مدرب معيّن',
  'admin.academy.confirmation_blocker_INVALID_COACH': 'المدرب غير معتمد',
  'admin.academy.confirmation_blocker_MISSING_COMPENSATION': 'تعويض المدرب غير مضبوط',
  'admin.academy.confirmation_blocker_MISSING_COURT': 'الملعب مفقود أو غير نشط',
  'admin.academy.confirmation_blocker_UNRESOLVED_COURT_CONFLICT': 'تعارض الملعب غير محلول',
  'admin.academy.confirmation_blocker_UNRESOLVED_DST': 'فجوة/تداخل التوقيت الصيفي غير محلولة',
  'admin.academy.confirmation_blocker_UNRESOLVED_PENDING_HOLD': 'حجز منتهٍ بانتظار قرار',
  'admin.academy.confirmation_blocker_UNPAID_ENROLLMENT': 'الدفع غير مؤكد',
  'admin.academy.confirmation_blocker_BELOW_MINIMUM': 'أقل من الحد الأدنى للتسجيل',
  'admin.academy.confirmation_blocker_ABOVE_MAXIMUM': 'تجاوز السعة القصوى',
  'admin.academy.confirmation_blocker_CONCURRENT_MODIFICATION': 'تغيّر البرنامج — حدّث الصفحة وأعد المحاولة',
  'admin.academy.confirmation_mark_paid': 'تأكيد الدفع',
  'admin.academy.confirmation_paid': 'مدفوع',
  'admin.academy.confirmation_payment_acknowledged': 'تم تأكيد الدفع',
  'admin.academy.confirmation_override_below': 'تأكيد رغم نقص الحد الأدنى',
  'admin.academy.confirmation_override_above': 'تأكيد رغم تجاوز السعة',
  'admin.academy.confirmation_override_reason': 'سبب الاستثناء (مطلوب)',
  'admin.academy.confirmation_submit': 'تأكيد الأكاديمية',
  'admin.academy.confirmation_success': 'تم تأكيد الأكاديمية — تم تثبيت الجلسات',
  'admin.academy.confirmation_failed': 'فشل التأكيد',
  'admin.academy.confirmation_loading': 'جارٍ فحص الجاهزية…',
  'admin.academy.confirmation_no_blockers': 'نجحت جميع الفحوصات. أكّد لتثبيت الجلسات وتجميد الجداول وقفل تعويض المدرب.',
  'admin.academy.confirmation_sessions_finalized': 'الجلسات المثبتة',
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

  console.log(`G3 seed complete: ${inserted} AR rows inserted, ${updated} AR rows updated`);
  await conn.end();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});