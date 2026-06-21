/**
 * Grant the permissions introduced/used by the latest workstreams (C/D/F) to
 * the appropriate roles. Idempotent: only inserts missing role_permissions.
 *
 * Usage: node backend/scripts/grant-new-perms.js
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { loadFileEnv, envFrom } from './load-file-env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fileEnv = loadFileEnv([
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '../.env'),
]);
const env = (k, d) => envFrom(fileEnv, k, d);

// roleSlug -> permission keys to ensure granted. Slugs cover both naming styles.
const ORG_MANAGE = [
  'org.staff.manage', 'org.sidebar.staff',
  'org.members.manage', 'org.sidebar.members',
  'org.coaches.manage', 'org.sidebar.coaches',
];

const GRANTS = {
  player: ['coaches.reviews.create', 'academies.enroll', 'coaches.view', 'coaches.book', 'branches.request-access', 'organisations.storefront.view', 'coaches.availability.manage', 'coaches.invites.respond', 'community.chat.view', 'community.chat.send'],
  'org-admin': [
    'coaches.reviews.create', 'academies.enroll',
    'branches.create', 'branches.edit', 'branches.delete',
    'resources.create', 'resources.edit', 'resources.delete',
    'organisations.edit.branches',
    'org.sidebar.branches', 'org.sidebar.resources',
    'organisations.storefront.view',
    'community.chat.view',
    'community.chat.send',
    ...ORG_MANAGE,
  ],
  admin: ['coaches.reviews.create', 'academies.enroll', 'branches.request-access', 'organisations.storefront.view', 'coaches.availability.manage', 'coaches.invites.respond', 'community.chat.view', 'community.chat.send', ...ORG_MANAGE],
  super_admin: ['coaches.reviews.create', 'academies.enroll', 'branches.request-access', 'organisations.storefront.view', 'coaches.availability.manage', 'coaches.invites.respond', 'community.chat.view', 'community.chat.send', ...ORG_MANAGE],
  'super-admin': ['coaches.reviews.create', 'academies.enroll', 'branches.request-access', 'organisations.storefront.view', 'coaches.availability.manage', 'coaches.invites.respond', 'community.chat.view', 'community.chat.send', ...ORG_MANAGE],
};

const conn = await mysql.createConnection({
  host: env('DB_HOST', 'localhost'),
  port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'root'),
  password: env('DB_PASSWORD', ''),
  database: env('DB_NAME', 'courtzon_v2'),
});

let granted = 0, skippedNoRole = 0, skippedNoPerm = 0, alreadyHad = 0;
for (const [slug, keys] of Object.entries(GRANTS)) {
  const [roles] = await conn.execute('SELECT id FROM roles WHERE slug = ? AND deleted_at IS NULL', [slug]);
  if (!roles.length) { skippedNoRole++; continue; }
  const roleId = roles[0].id;
  for (const key of keys) {
    const [perms] = await conn.execute('SELECT id FROM permissions WHERE permission_key = ?', [key]);
    if (!perms.length) { console.log(`  ! no permission '${key}'`); skippedNoPerm++; continue; }
    const permId = perms[0].id;
    const [existing] = await conn.execute('SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ?', [roleId, permId]);
    if (existing.length) { alreadyHad++; continue; }
    await conn.execute('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, permId]);
    console.log(`  + ${slug} <- ${key}`);
    granted++;
  }
}
console.log(`\nDone. granted=${granted}, alreadyHad=${alreadyHad}, missingPerm=${skippedNoPerm}, missingRoles=${skippedNoRole}`);
await conn.end();
