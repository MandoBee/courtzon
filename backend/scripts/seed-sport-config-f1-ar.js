/**
 * Seed Arabic translations for the Phase A sport-config keys
 * (admin.sports.formats_tab, admin.sport_formats.*, admin.sport_rule_sets.*).
 * Uses the existing `translations` table exactly as the Translation Admin UI
 * writes them — idempotent upsert, EN values untouched.
 *
 * NOTE — Phase A scope: this script is provided for the deployment/translation
 * sync step and is NOT run during the review phase (no DB changes allowed).
 * Usage (after approval):
 *   node backend/scripts/seed-sport-config-f1-ar.js
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
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
  'admin.sports.formats_tab': 'الصيغ وقواعد اللعب',
  'admin.sport_formats.title': 'صيغ الرياضة وقواعد اللعب',
  'admin.sport_formats.new': 'صيغة جديدة',
  'admin.sport_formats.edit_title': 'تعديل صيغة الرياضة',
  'admin.sport_formats.created': 'تم إنشاء صيغة الرياضة',
  'admin.sport_formats.updated': 'تم تحديث صيغة الرياضة',
  'admin.sport_formats.deleted': 'تم حذف صيغة الرياضة',
  'admin.sport_formats.activated': 'تم تفعيل الصيغة',
  'admin.sport_formats.deactivated': 'تم إلغاء تفعيل الصيغة',
  'admin.sport_formats.delete_title': 'حذف صيغة الرياضة',
  'admin.sport_formats.delete_confirm': 'حذف صيغة الرياضة هذه؟ لا يمكن التراجع عن هذا الإجراء.',
  'admin.sport_formats.all_sports': 'جميع الرياضات',
  'admin.sport_formats.pick_sport': 'اختر رياضة أولاً',
  'admin.sport_formats.default': 'افتراضي',
  'admin.sport_formats.players_per_side': 'اللاعبون لكل جهة',
  'admin.sport_formats.roster_size': 'حجم القائمة',
  'admin.sport_formats.versions': 'النسخ',
  'admin.sport_formats.references': 'قيد الاستخدام',
  'admin.sport_formats.rule_sets': 'قواعد اللعب',
  'admin.sport_formats.deactivate': 'إلغاء التفعيل',
  'admin.sport_formats.activate': 'تفعيل',
  'admin.sport_formats.cannot_delete': 'مرتبط بالبيانات التاريخية — قم بإلغاء التفعيل بدلاً من الحذف',
  'admin.sport_formats.empty': 'لا توجد صيغ رياضية',
  'admin.sport_formats.sport': 'الرياضة',
  'admin.sport_formats.name': 'الاسم',
  'admin.sport_formats.slug': 'المعرّف',
  'admin.sport_formats.type': 'نوع الصيغة',
  'admin.sport_formats.description': 'الوصف',
  'admin.sport_rule_sets.title': 'قواعد اللعب',
  'admin.sport_rule_sets.help': 'قواعد اللعب بنسخ متعددة. النسخة النشطة الجديدة تتولى التقييم المباشر؛ النتائج التاريخية تحتفظ بلقطة مجمّدة.',
  'admin.sport_rule_sets.new_version': 'نسخة جديدة',
  'admin.sport_rule_sets.edit_title': 'تعديل نسخة قواعد اللعب',
  'admin.sport_rule_sets.created': 'تم إنشاء نسخة قواعد اللعب',
  'admin.sport_rule_sets.updated': 'تم تحديث نسخة قواعد اللعب',
  'admin.sport_rule_sets.activated': 'تم تفعيل نسخة قواعد اللعب',
  'admin.sport_rule_sets.deactivated': 'تم إلغاء تفعيل نسخة قواعد اللعب',
  'admin.sport_rule_sets.references': 'قيد الاستخدام',
  'admin.sport_rule_sets.activate': 'تفعيل',
  'admin.sport_rule_sets.deactivate': 'إلغاء التفعيل',
  'admin.sport_rule_sets.name': 'الاسم',
  'admin.sport_rule_sets.rules': 'القواعد (JSON)',
  'admin.sport_rule_sets.standings_rules': 'قواعد الترتيب (JSON، اختياري)',
  'admin.sport_rule_sets.invalid_json': 'القواعد ليست JSON صالحًا',
  'admin.sport_rule_sets.invalid_json_standings': 'قواعد الترتيب ليست JSON صالحًا',
  'admin.sport_rule_sets.locked': 'هذه النسخة مرتبطة بالبيانات التاريخية — القواعد مقفلة. أنشئ نسخة جديدة لتغيير القواعد.',
  'admin.sport_rule_sets.empty': 'لا توجد نسخ لقواعد اللعب بعد',
  'admin.sport_rule_sets.activate_on_save': 'تفعيل عند الحفظ',
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

  console.log(`Seed complete: ${inserted} AR rows inserted, ${updated} AR rows updated`);
  await conn.end();
}

main().catch((err) => {
  console.error('AR translation seed failed:', err);
  process.exit(1);
});