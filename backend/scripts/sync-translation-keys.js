/**
 * Sync translation keys registry → translation_keys table (insert missing only).
 * Usage: node backend/scripts/sync-translation-keys.js
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
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  fileEnv[key] = val;
}

function env(key, fallback) {
  return process.env[key] || fileEnv[key] || fallback;
}

const DB_NAME = env('DB_NAME', 'courtzon_v2');
const config = {
  host: env('DB_HOST', 'localhost'),
  port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'root'),
  password: env('DB_PASSWORD', ''),
};

function parseTranslationKeysRegistry(registryPath) {
  const content = readFileSync(registryPath, 'utf8');
  const entryRe =
    /\{\s*key:\s*['"]([^'"]+)['"],\s*defaultValue:\s*(['"])((?:\\.|(?!\2).)*)\2,\s*moduleSlug:\s*['"]([^'"]+)['"],\s*elementType:\s*['"]([^'"]+)['"],\s*elementLabel:\s*(['"])((?:\\.|(?!\6).)*)\6(?:,\s*componentPath:\s*['"]([^'"]*)['"])?\s*\}/g;
  const unescape = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
  const entries = [];
  let match;
  while ((match = entryRe.exec(content)) !== null) {
    entries.push({
      key: match[1],
      defaultValue: unescape(match[3]),
      moduleSlug: match[4],
      elementType: match[5],
      elementLabel: unescape(match[7]),
      componentPath: match[8] || undefined,
    });
  }
  if (!entries.length) throw new Error(`No entries parsed from ${registryPath}`);
  return entries;
}

async function main() {
  const registryPath = resolve(__dirname, '../../frontend/src/i18n/translation-keys.registry.ts');
  const entries = parseTranslationKeysRegistry(registryPath);
  console.log(`Parsed ${entries.length} keys from registry`);

  const conn = await mysql.createConnection(config);
  await conn.query(`USE \`${DB_NAME}\``);

  let inserted = 0;
  let skipped = 0;
  for (const entry of entries) {
    const [result] = await conn.query(
      `INSERT IGNORE INTO translation_keys (\`key\`, default_value, module_slug, element_type, element_label, component_path)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.key,
        entry.defaultValue,
        entry.moduleSlug,
        entry.elementType,
        entry.elementLabel,
        entry.componentPath || null,
      ]
    );
    if (result.affectedRows > 0) inserted++;
    else skipped++;
  }

  console.log(`Sync complete: ${inserted} keys inserted, ${skipped} skipped`);
  await conn.end();
}

main().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
