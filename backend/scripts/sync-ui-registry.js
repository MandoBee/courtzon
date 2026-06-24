/**
 * Sync UI Registry to Database
 *
 * Parses frontend/src/permissions/registry.ts and syncs all UI elements
 * into the permissions table as is_ui_element entries.
 *
 * Usage: node backend/scripts/sync-ui-registry.js
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

const DB_NAME = env('DB_NAME', 'courtzon_v3');
const config = {
  host: env('DB_HOST', 'localhost'),
  port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'root'),
  password: env('DB_PASSWORD', ''),
};

/** Parse export const uiRegistry from the TypeScript registry file. */
export function parseRegistryFromTs(registryPath) {
  const content = readFileSync(registryPath, 'utf8');
  const entryRe =
    /\{\s*permissionKey:\s*['"]([^'"]+)['"],\s*moduleSlug:\s*['"]([^'"]+)['"],\s*elementType:\s*['"]([^'"]+)['"],\s*elementLabel:\s*['"]([^'"]*)['"](?:,\s*componentPath:\s*['"]([^'"]*)['"])?\s*\}/g;

  const elements = [];
  let match;
  while ((match = entryRe.exec(content)) !== null) {
    elements.push({
      permissionKey: match[1],
      moduleSlug: match[2],
      elementType: match[3],
      elementLabel: match[4],
      componentPath: match[5] || undefined,
    });
  }

  if (!elements.length) {
    throw new Error(`No registry entries parsed from ${registryPath}`);
  }

  return elements;
}

const registryPath = resolve(__dirname, '../../frontend/src/permissions/registry.ts');
const registryElements = parseRegistryFromTs(registryPath);
console.log(`Parsed ${registryElements.length} entries from registry.ts`);

async function sync() {
  const conn = await mysql.createConnection(config);
  await conn.query(`USE \`${DB_NAME}\``);
  console.log(`Connected to ${DB_NAME}`);

  let inserted = 0;
  let updated = 0;

  for (const el of registryElements) {
    let [modRows] = await conn.query('SELECT id FROM permission_modules WHERE slug = ?', [el.moduleSlug]);
    let modId;
    if (!modRows.length) {
      const [result] = await conn.query(
        'INSERT IGNORE INTO permission_modules (slug, sort_order) VALUES (?, 99)',
        [el.moduleSlug],
      );
      modId = result.insertId;
      console.log(`  Created module: ${el.moduleSlug}`);
    } else {
      modId = modRows[0].id;
    }

    const description = `Controls visibility of "${el.elementLabel}" (${el.elementType})`;
    const [existing] = await conn.query('SELECT id FROM permissions WHERE permission_key = ?', [el.permissionKey]);

    if (existing.length) {
      await conn.query(
        `UPDATE permissions SET module_id = ?, element_type = ?, element_label = ?,
         component_path = ?, is_ui_element = TRUE, description = ?
         WHERE permission_key = ?`,
        [modId, el.elementType, el.elementLabel, el.componentPath || null, description, el.permissionKey],
      );
      updated++;
    } else {
      await conn.query(
        `INSERT INTO permissions (module_id, permission_key, element_type, element_label,
         component_path, is_ui_element, description)
         VALUES (?, ?, ?, ?, ?, TRUE, ?)`,
        [modId, el.permissionKey, el.elementType, el.elementLabel, el.componentPath || null, description],
      );
      inserted++;
    }
  }

  console.log(`\nSync complete: ${inserted} inserted, ${updated} updated`);
  await conn.end();
}

sync().catch((err) => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
