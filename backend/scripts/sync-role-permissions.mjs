#!/usr/bin/env node
/**
 * Sync role_permissions from templates so each system role has correct access.
 * Super Admin receives every permission in the database.
 *
 * Usage:
 *   node backend/scripts/sync-role-permissions.mjs
 *   node backend/scripts/sync-role-permissions.mjs --prune   # remove grants outside template
 *
 * Run after: node backend/scripts/sync-ui-registry.js
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { loadFileEnv, envFrom } from './load-file-env.js';
import {
  permissionMatchesTemplate,
  TEMPLATE_SLUGS,
} from './role-permission-templates.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fileEnv = loadFileEnv([
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '../.env'),
]);
const env = (k, d) => envFrom(fileEnv, k, d);

function resolveDbHost(host) {
  if (!host || host === 'host.docker.internal' || host === 'mysql') return '127.0.0.1';
  return host;
}

const prune = process.argv.includes('--prune');

const conn = await mysql.createConnection({
  host: resolveDbHost(env('DB_HOST', '127.0.0.1')),
  port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'root'),
  password: env('DB_PASSWORD', ''),
  database: env('DB_NAME', 'courtzon_v3'),
});

console.log(`Connected to ${env('DB_NAME', 'courtzon_v3')}${prune ? ' (prune on)' : ''}`);

const [permissions] = await conn.execute(
  'SELECT id, permission_key FROM permissions ORDER BY permission_key',
);
const permByKey = new Map(permissions.map((p) => [p.permission_key, p.id]));

const [roles] = await conn.execute(
  `SELECT id, slug, name, organisation_id, is_system
   FROM roles WHERE deleted_at IS NULL ORDER BY id`,
);

let totalGranted = 0;
let totalPruned = 0;

for (const role of roles) {
  const templateSlug = role.slug;
  const isSuperAdmin = templateSlug === 'super_admin';

  if (!isSuperAdmin && !TEMPLATE_SLUGS.includes(templateSlug)) {
    console.log(`  skip ${role.slug} (id=${role.id}) — no template`);
    continue;
  }

  const targetPermIds = new Set();
  for (const p of permissions) {
    if (isSuperAdmin || permissionMatchesTemplate(templateSlug, p.permission_key)) {
      targetPermIds.add(p.id);
    }
  }

  const [existing] = await conn.execute(
    'SELECT permission_id FROM role_permissions WHERE role_id = ?',
    [role.id],
  );
  const existingIds = new Set(existing.map((r) => r.permission_id));

  let granted = 0;
  for (const permId of targetPermIds) {
    if (!existingIds.has(permId)) {
      await conn.execute(
        'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        [role.id, permId],
      );
      granted++;
    }
  }

  let pruned = 0;
  if (prune && !isSuperAdmin) {
    for (const permId of existingIds) {
      if (!targetPermIds.has(permId)) {
        await conn.execute(
          'DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?',
          [role.id, permId],
        );
        pruned++;
      }
    }
  }

  console.log(
    `  ${role.slug} (org=${role.organisation_id ?? 'global'}): ` +
      `target=${targetPermIds.size}, +${granted}${prune ? `, -${pruned}` : ''}`,
  );
  totalGranted += granted;
  totalPruned += pruned;
}

// Ensure platform.admin on super_admin (API adminGuard fallback)
const platformAdminId = permByKey.get('platform.admin');
if (platformAdminId) {
  const [superRoles] = await conn.execute(
    `SELECT id FROM roles WHERE slug IN ('super_admin', 'super-admin') AND deleted_at IS NULL`,
  );
  for (const r of superRoles) {
    await conn.execute(
      'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
      [r.id, platformAdminId],
    );
  }
}

console.log(`\nDone. granted=${totalGranted}, pruned=${totalPruned}`);
await conn.end();
