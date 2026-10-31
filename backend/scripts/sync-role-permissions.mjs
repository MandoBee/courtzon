#!/usr/bin/env node
/**
 * Sync role_permissions from templates so each system role has correct access.
 * Super Admin receives every permission in the database.
 *
 * Scope: GLOBAL roles only (`roles.organisation_id IS NULL`). Organisation-scoped
 * roles are skipped even when they reuse a template slug, so syncing never changes
 * an organisation-owned role. Grants are add-only unless `--prune` is passed.
 *
 * Usage:
 *   node backend/scripts/sync-role-permissions.mjs \
 *     --confirm-host=<DB_HOST> --confirm-port=<DB_PORT> --confirm-db=<DB_NAME>
 *   (add --prune only with explicit review; it is NOT used for provisioning)
 *
 * Run after: node backend/scripts/sync-ui-registry.js
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { loadFileEnv, envFrom } from './load-file-env.js';
import { resolveDbTlsPolicy } from './db-tls.js';
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

// ── Target confirmation (keep identical to bootstrap-admin.js) ────────────────
const CONFIRM_FLAGS = {
  host: '--confirm-host=',
  port: '--confirm-port=',
  db: '--confirm-db=',
};

function parseTargetConfirmation(argv) {
  const read = (prefix) => {
    const arg = argv.find((value) => value.startsWith(prefix));
    return arg ? arg.slice(prefix.length).trim() : '';
  };
  return {
    host: read(CONFIRM_FLAGS.host),
    port: read(CONFIRM_FLAGS.port),
    db: read(CONFIRM_FLAGS.db),
  };
}

/**
 * Fail closed unless the operator confirms the exact resolved host, port and
 * database. Resolution follows this script's real precedence:
 * `process.env` → merged `.env` files (`./.env` first, `backend/.env` overrides)
 * → defaults. The resolved target is printed before any connection is opened.
 */
function assertConfirmedTarget(target, confirmation) {
  if (target.db.toLowerCase() === 'courtzon_v2') {
    console.error('Role permission sync aborted — refusing to run against the legacy courtzon_v2 database.');
    return false;
  }
  if (!target.host) {
    console.error('Role permission sync aborted — DB_HOST resolved to an empty value.');
    return false;
  }
  if (!Number.isInteger(target.port) || target.port <= 0) {
    console.error('Role permission sync aborted — DB_PORT is not a valid TCP port.');
    return false;
  }
  if (!confirmation.host || !confirmation.port || !confirmation.db) {
    console.error(
      'Role permission sync aborted — explicit target confirmation is required: ' +
        'pass --confirm-host=<DB_HOST> --confirm-port=<DB_PORT> --confirm-db=<DB_NAME>.',
    );
    return false;
  }
  if (confirmation.host.toLowerCase() !== target.host.toLowerCase()) {
    console.error(
      `Role permission sync aborted — --confirm-host (${confirmation.host}) does not match the resolved DB_HOST (${target.host}).`,
    );
    return false;
  }
  if (!Number.isInteger(Number(confirmation.port)) || Number(confirmation.port) !== target.port) {
    console.error(
      `Role permission sync aborted — --confirm-port (${confirmation.port}) does not match the resolved DB_PORT (${target.port}).`,
    );
    return false;
  }
  if (confirmation.db !== target.db) {
    console.error(
      `Role permission sync aborted — --confirm-db (${confirmation.db}) does not match the resolved DB_NAME (${target.db}).`,
    );
    return false;
  }
  return true;
}

const prune = process.argv.includes('--prune');

// Connect to exactly the resolved DB_HOST — no host remapping of any kind.
const target = {
  host: env('DB_HOST', '127.0.0.1'),
  port: Number(env('DB_PORT', '3306')),
  db: env('DB_NAME', 'courtzon_v3').trim(),
};

if (!assertConfirmedTarget(target, parseTargetConfirmation(process.argv.slice(2)))) {
  process.exit(2);
}

console.log(`Role permission sync target: ${target.host}:${target.port}/${target.db}${prune ? ' (prune on)' : ''}`);

const dbTls = resolveDbTlsPolicy({ ...fileEnv, ...process.env });
const conn = await mysql.createConnection({
  host: target.host,
  port: target.port,
  user: env('DB_USER', 'root'),
  password: env('DB_PASSWORD', ''),
  database: target.db,
  ...dbTls.mysql2,
});

console.log('Connection established.');

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

  // Template grants describe the GLOBAL role definitions. Organisation-scoped
  // rows may reuse a template slug; syncing them would silently change roles
  // owned by an organisation, so they are never touched (including --prune).
  if (role.organisation_id !== null) {
    console.log(
      `  skip ${role.slug} (id=${role.id}, org=${role.organisation_id}) — organisation-scoped role (global templates only)`,
    );
    continue;
  }

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
    `SELECT id FROM roles
      WHERE slug IN ('super_admin', 'super-admin')
        AND organisation_id IS NULL
        AND deleted_at IS NULL`,
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
