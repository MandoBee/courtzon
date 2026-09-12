/**
 * Seed Arabic translations for Academy G6 UI keys (player-facing self-service).
 * Uses the existing `translations` table exactly as the Translation Admin UI
 * writes them — idempotent upsert, EN untouched.
 *
 * Usage (dev/CI only; never point at production without review):
 *   node backend/scripts/seed-academy-g6-ar.js
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
  'nav.academy': 'الأكاديمية',
  'nav.my_academy': 'أكاديميتي',
  'player.academy.title': 'الأكاديميات',
  'player.academy.browse_title': 'برامج الأكاديمية',
  'player.academy.empty': 'لا توجد برامج أكاديمية متاحة حالياً',
  'player.academy.loading': 'جارٍ تحميل الأكاديميات…',
  'player.academy.category': 'الفئة',
  'player.academy.level': 'المستوى',
  'player.academy.season': 'الموسم',
  'player.academy.price': 'السعر',
  'player.academy.free': 'مجاني',
  'player.academy.enroll': 'تسجيل',
  'player.academy.full': 'ممتلئ',
  'player.academy.at_capacity': 'بالسعة الكاملة',
  'player.academy.seats_available': 'مقاعد متاحة',
  'player.academy.unlimited': 'غير محدود',
  'player.academy.enrolled': 'مسجل',
  'player.academy.waitlist_position': 'أنت في المرتبة #{n} على قائمة الانتظار',
  'player.academy.enrollment_success': 'تم التسجيل بنجاح',
  'player.academy.enrollment_waitlisted': 'أنت في قائمة الانتظار',
  'player.academy.enrollment_failed': 'فشل التسجيل',
  'player.academy.already_enrolled': 'أنت مسجل بالفعل في هذه الأكاديمية',
  'player.academy.enrollment_closed': 'التسجيل مغلق — بدأت الأكاديمية',
  'player.academy.not_found': 'الأكاديمية غير موجودة',
  'player.academy.back_to_browse': 'العودة إلى الأكاديميات',
  'player.academy.payment_pending': 'الدفع قيد الانتظار — بانتظار تأكيد الإدارة',
  'player.academy.payment_confirmed': 'تم تأكيد الدفع من قبل الإدارة',
  'player.academy.my_academy': 'أكاديميتي',
  'player.academy.my_enrollments': 'تسجيلاتي',
  'player.academy.my_sessions': 'جلساتي',
  'player.academy.my_attendance': 'حضوري',
  'player.academy.no_enrollments': 'لا توجد لديك تسجيلات أكاديمية',
  'player.academy.no_sessions': 'لا توجد جلسات أكاديمية بعد',
  'player.academy.no_attendance': 'لا توجد سجلات حضور بعد',
  'player.academy.status_confirmed': 'مؤكد',
  'player.academy.status_waiting': 'بانتظار',
  'player.academy.status_cancelled': 'ملغى',
  'player.academy.status_completed': 'مكتمل',
  'player.academy.session_scheduled': 'مجدولة',
  'player.academy.session_in_progress': 'قيد التنفيذ',
  'player.academy.session_completed': 'مكتملة',
  'player.academy.session_cancelled': 'ملغاة',
  'player.academy.attendance_present': 'حاضر',
  'player.academy.attendance_absent': 'غائب',
  'player.academy.attendance_excused': 'معذور',
  'player.academy.attendance_late': 'متأخر',
  'player.academy.attendance_unmarked': 'غير مسجل',
  'player.academy.group': 'المجموعة',
  'player.academy.program': 'البرنامج',
  'player.academy.date': 'التاريخ',
  'player.academy.time': 'الوقت',
  'player.academy.status': 'الحالة',
  'player.academy.enrolled_at': 'تاريخ التسجيل',
  'player.academy.view_programs': 'تصفح البرامج',
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

  console.log(`G6 seed complete: ${inserted} AR rows inserted, ${updated} AR rows updated`);
  await conn.end();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});