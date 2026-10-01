/**
 * Seed Arabic translations for the G11.9 tournament finance keys
 * (org Tournament P&L section on the Financial Position page).
 * Uses the existing `translations` table (key/locale/value/is_auto) exactly as the
 * Translation Admin UI writes them — idempotent upsert, EN values untouched.
 *
 * Usage (dev/CI only; do not point at production without review):
 *   node backend/scripts/seed-tournament-finances-g11-9-ar.js
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
  'financial_position.tournament_pnl.title': 'ملخص أرباح وخسائر البطولات',
  'financial_position.tournament_pnl.explanation': 'بيانات معتمدة من دفتر الأستاذ، مجمعة في مجموعة مستقلة لكل عملة. لا يتم دمج القيم عبر العملات أبداً.',
  'financial_position.tournament_pnl.zero_ledger': 'لا توجد قيود محاسبية منشورة للبطولات بعد — يُعترف بالأرباح والخسائر فقط من القيود المنشورة، وتُعرض حالياً بصفر.',
  'financial_position.tournament_pnl.error': 'تعذّر تحميل ملخص أرباح وخسائر البطولات',
  'financial_position.tournament_pnl.currency': 'مجموعة {currency}',
  'financial_position.tournament_pnl.tournaments': '{count} بطولة',
  'financial_position.tournament_pnl.postings': '{count} قيد محاسبي',
  'financial_position.tournament_pnl.revenue': 'الإيرادات',
  'financial_position.tournament_pnl.commission_expense': 'مصروف العمولة',
  'financial_position.tournament_pnl.prize_expense': 'مصروف الجوائز',
  'financial_position.tournament_pnl.expenses': 'المصروفات',
  'financial_position.tournament_pnl.net': 'الصافي',
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
  console.error('Seed failed:', err.message);
  process.exit(1);
});