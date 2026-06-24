#!/usr/bin/env node
/**
 * Production Admin Bootstrap
 *
 * Creates the initial super admin account from environment variables:
 *   SUPER_ADMIN_EMAIL
 *   SUPER_ADMIN_PASSWORD
 *
 * Runs automatically on first deployment if the users table is empty
 * and the env vars are set.
 */

import mysql from 'mysql2/promise';
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { loadFileEnv, envFrom } from './load-file-env.js';

const fileEnv = loadFileEnv([
  resolve(process.cwd(), '.env'),
]);

function env(key, fallback) {
  return envFrom(fileEnv, key, fallback);
}

const config = {
  host: env('DB_HOST', 'localhost'),
  port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'root'),
  password: env('DB_PASSWORD', ''),
};

const dbName = env('DB_NAME', 'courtzon_v2');

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(salt + password).digest('hex');
  return { salt, hash: `${salt}:${hash}` };
}

async function bootstrapAdmin() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set — skipping admin bootstrap.');
    return;
  }

  const conn = await mysql.createConnection(config);
  await conn.query(`USE \`${dbName}\``);

  try {
    const [existing] = await conn.execute(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );

    if (existing.length > 0) {
      console.log(`Super admin ${email} already exists — skipping.`);
      return;
    }

    const { hash } = await hashPassword(password);
    const [result] = await conn.execute(
      `INSERT INTO users (email, password_hash, name, role, is_active, email_verified_at, created_at, updated_at)
       VALUES (?, ?, 'Super Admin', 'super_admin', TRUE, NOW(), NOW(), NOW())`,
      [email, hash]
    );

    const userId = result.insertId;

    // Assign super_admin role
    const [role] = await conn.execute(
      "SELECT id FROM roles WHERE slug = 'super_admin' OR slug = 'super-admin' LIMIT 1"
    );

    if (role.length > 0) {
      await conn.execute(
        'INSERT IGNORE INTO user_roles (user_id, role_id, is_active, created_at) VALUES (?, ?, TRUE, NOW())',
        [userId, role[0].id]
      );
      console.log(`Assigned role ${role[0].id} to admin user ${userId}.`);
    } else {
      console.log('Warning: super_admin role not found — skipping role assignment.');
    }

    console.log(`Super admin created: ${email} (user ID: ${userId})`);
  } catch (err) {
    console.error('Admin bootstrap failed:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

bootstrapAdmin();
