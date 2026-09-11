/**
 * Seed Arabic translations for Academy G2 UI keys (recurring schedules +
 * conflict resolution + sessions + sidebar nav). Uses the existing
 * `translations` table exactly as the Translation Admin UI writes them —
 * idempotent upsert, EN untouched.
 *
 * Usage (dev/CI only; never point at production without review):
 *   node backend/scripts/seed-academy-g2-ar.js
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
  'admin.sidebar.academy_schedules': 'الجدول الزمني المتكرر',
  'admin.academy.schedules': 'الجداول المتكررة',
  'admin.academy.new_schedule': 'جدول جديد',
  'admin.academy.schedule_created': 'تم إنشاء الجدول',
  'admin.academy.schedule_updated': 'تم تحديث الجدول',
  'admin.academy.schedule_regenerated': 'تم إعادة توليد الجدول',
  'admin.academy.schedule_resynced': 'تمت إعادة المزامنة',
  'admin.academy.schedule_status_updated': 'تم تحديث حالة الجدول',
  'admin.academy.schedule_name': 'اسم الجدول',
  'admin.academy.schedule_group': 'المجموعة',
  'admin.academy.schedule_weekdays': 'الأيام',
  'admin.academy.schedule_window': 'الفترة (محلي)',
  'admin.academy.schedule_court': 'الملعب المفضل',
  'admin.academy.schedule_status': 'الحالة',
  'admin.academy.schedule_start_date': 'تاريخ البداية',
  'admin.academy.schedule_end_date': 'تاريخ النهاية',
  'admin.academy.schedule_time': 'التوقيت المحلي',
  'admin.academy.schedule_priority_minutes': 'مدة الحجز (دقيقة)',
  'admin.academy.schedule_branch': 'الفرع',
  'admin.academy.schedule_timezone': 'المنطقة الزمنية',
  'admin.academy.schedule_no_rows': 'لا توجد جداول متكررة',
  'admin.academy.schedule_sessions_title': 'الجلسات المولّدة',
  'admin.academy.schedule_hold_status': 'الحجز',
  'admin.academy.schedule_hold_pending_court': 'بانتظار الملعب',
  'admin.academy.schedule_hold_conflict': 'تعارض',
  'admin.academy.schedule_hold_pending_expired': 'منتهي',
  'admin.academy.schedule_hold_deferred': 'مؤجل',
  'admin.academy.schedule_hold_resolved': 'محلول',
  'admin.academy.schedule_resolve': 'حلّ',
  'admin.academy.schedule_resolve_keep': 'إبقاء',
  'admin.academy.schedule_resolve_release': 'تحرير',
  'admin.academy.schedule_resolve_alternative': 'استخدام بديل',
  'admin.academy.schedule_resolved': 'تم حلّ الجلسة',
  'admin.academy.schedule_preview': 'معاينة',
  'admin.academy.schedule_regenerate': 'إعادة توليد',
  'admin.academy.schedule_resync': 'إعادة مزامنة',
  'admin.academy.schedule_pause': 'إيقاف مؤقت',
  'admin.academy.schedule_resume': 'استئناف',
  'admin.academy.schedule_evaluations': 'التقييمات',
  'admin.academy.schedule_generated': 'تم التوليد',
  'admin.academy.schedule_affected': 'المتأثرة',
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

  console.log(`G2 seed complete: ${inserted} AR rows inserted, ${updated} AR rows updated`);
  await conn.end();
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});