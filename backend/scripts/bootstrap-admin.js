#!/usr/bin/env node
/**
 * Production Super Admin Bootstrap
 *
 * Creates — or, when it already exists, locates — the platform Super Admin using
 * the CourtZon v3 schema and the phone + password login contract. Login is
 * phone-only, so the account is identified by `users.full_phone`
 * (`countries.phone_code` + local `phone_number`), never by email.
 *
 * Required environment variables:
 *   SUPER_ADMIN_PHONE         local 11-digit number, the same value typed at login
 *                             (mirrors `localPhoneNumberSchema`)
 *   SUPER_ADMIN_COUNTRY_ISO   ISO-2 code of an active `countries` row (e.g. EG)
 *   SUPER_ADMIN_PASSWORD      password (never logged)
 *   SUPER_ADMIN_EMAIL         profile email only — NOT a login identifier
 *                             (column is NOT NULL + UNIQUE, so it is mandatory)
 *
 * Optional environment variables:
 *   SUPER_ADMIN_NAME          defaults to "Super Admin" (`users.full_name`)
 *   SUPER_ADMIN_GENDER        "male" | "female", defaults to "male"
 *                             (`users.gender` is NOT NULL with no DB default)
 *
 * Safe by design: the script exits nonzero when a required variable or the explicit
 * `--confirm-host=<DB_HOST> --confirm-port=<DB_PORT> --confirm-db=<DB_NAME>` target
 * confirmation is missing, refuses the legacy `courtzon_v2` database, resolves
 * country/role IDs from the schema (no hardcoded IDs), never prints passwords or
 * phone/email values, and only writes the `users` row plus the `user_roles`
 * assignment. It is not wired into any entrypoint/startup file.
 */

import mysql from 'mysql2/promise';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { loadFileEnv, envFrom } from './load-file-env.js';

const fileEnv = loadFileEnv([
  resolve(process.cwd(), '.env'),
]);

function env(key, fallback) {
  return envFrom(fileEnv, key, fallback);
}

const CONFIRM_FLAGS = {
  host: '--confirm-host=',
  port: '--confirm-port=',
  db: '--confirm-db=',
};

/** Read the explicit target confirmation flags from argv. */
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

/** Never surface driver messages that can embed phone numbers or emails. */
function safeErrorMessage(err) {
  if (err && err.code === 'ER_DUP_ENTRY') {
    return 'unique constraint conflict — the phone number or email is already in use';
  }
  return err?.message || 'unknown error';
}

/**
 * Fail closed unless the operator confirms the exact resolved host, port and
 * database (all follow `process.env` → cwd `.env` → default precedence).
 * `courtzon_v2` is refused unconditionally, even if it is confirmed.
 */
function assertConfirmedTarget(target, confirmation) {
  if (target.db.toLowerCase() === 'courtzon_v2') {
    console.error('Super Admin bootstrap aborted — refusing to run against the legacy courtzon_v2 database.');
    return false;
  }
  if (!target.host) {
    console.error('Super Admin bootstrap aborted — DB_HOST resolved to an empty value.');
    return false;
  }
  if (!Number.isInteger(target.port) || target.port <= 0) {
    console.error('Super Admin bootstrap aborted — DB_PORT is not a valid TCP port.');
    return false;
  }
  if (!confirmation.host || !confirmation.port || !confirmation.db) {
    console.error(
      'Super Admin bootstrap aborted — explicit target confirmation is required: ' +
        'pass --confirm-host=<DB_HOST> --confirm-port=<DB_PORT> --confirm-db=<DB_NAME>.',
    );
    return false;
  }
  if (confirmation.host.toLowerCase() !== target.host.toLowerCase()) {
    console.error(
      `Super Admin bootstrap aborted — --confirm-host (${confirmation.host}) does not match the resolved DB_HOST (${target.host}).`,
    );
    return false;
  }
  if (!Number.isInteger(Number(confirmation.port)) || Number(confirmation.port) !== target.port) {
    console.error(
      `Super Admin bootstrap aborted — --confirm-port (${confirmation.port}) does not match the resolved DB_PORT (${target.port}).`,
    );
    return false;
  }
  if (confirmation.db !== target.db) {
    console.error(
      `Super Admin bootstrap aborted — --confirm-db (${confirmation.db}) does not match the resolved DB_NAME (${target.db}).`,
    );
    return false;
  }
  return true;
}

const config = {
  host: env('DB_HOST', 'localhost'),
  port: Number(env('DB_PORT', '3306')),
  user: env('DB_USER', 'root'),
  password: env('DB_PASSWORD', ''),
};

const dbName = env('DB_NAME', 'courtzon_v3').trim();

// Mirrors `localPhoneNumberSchema` (`backend/src/shared/validation/local-phone.ts`).
const LOCAL_PHONE_REGEX = /^\d{11}$/;

// Mirrors `backend/src/shared/utils/password.ts` — the only hash format
// `verifyPassword()` accepts. Keep these constants in sync with that file.
const HASH_ALGORITHM = 'sha512';
const KEY_LENGTH = 64;
const ITERATIONS = 210000;
const SALT_LENGTH = 32;

function toBase64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, HASH_ALGORITHM);
  const version = Buffer.from([2]);
  const iterationsBuf = Buffer.alloc(4);
  iterationsBuf.writeUInt32BE(ITERATIONS);
  const keyLenBuf = Buffer.alloc(2);
  keyLenBuf.writeUInt16BE(KEY_LENGTH);
  const combined = Buffer.concat([version, iterationsBuf, keyLenBuf, salt, hash]);
  return `$pbkdf2-${HASH_ALGORITHM}$${toBase64url(combined)}`;
}

/** Normalize a `countries.phone_code` value the same way login does ('+' prefix). */
function normalizeCountryCode(phoneCode) {
  return phoneCode.startsWith('+') ? phoneCode : `+${phoneCode}`;
}

async function bootstrapAdmin() {
  const phoneNumber = env('SUPER_ADMIN_PHONE', '').trim();
  const password = env('SUPER_ADMIN_PASSWORD', '');
  const email = env('SUPER_ADMIN_EMAIL', '').trim();
  const countryIso = env('SUPER_ADMIN_COUNTRY_ISO', '').trim().toUpperCase();
  const fullName = env('SUPER_ADMIN_NAME', 'Super Admin') || 'Super Admin';
  const gender = (env('SUPER_ADMIN_GENDER', 'male') || 'male').trim().toLowerCase();

  const missing = [
    ['SUPER_ADMIN_PHONE', phoneNumber],
    ['SUPER_ADMIN_PASSWORD', password],
    ['SUPER_ADMIN_EMAIL', email],
    ['SUPER_ADMIN_COUNTRY_ISO', countryIso],
  ].filter(([, value]) => !value).map(([key]) => key);

  if (missing.length > 0) {
    console.error(`Super Admin bootstrap aborted — missing required variables: ${missing.join(', ')}.`);
    process.exitCode = 2;
    return;
  }

  const target = { host: config.host, port: config.port, db: dbName };
  if (!assertConfirmedTarget(target, parseTargetConfirmation(process.argv.slice(2)))) {
    process.exitCode = 2;
    return;
  }
  // Host/port/database only — credentials are never printed.
  console.log(`Super Admin bootstrap target: ${target.host}:${target.port}/${target.db}`);

  if (!LOCAL_PHONE_REGEX.test(phoneNumber)) {
    console.error(
      'Super Admin bootstrap aborted — SUPER_ADMIN_PHONE must be the local 11-digit number used at login.',
    );
    process.exitCode = 1;
    return;
  }

  if (!/^[A-Z]{2}$/.test(countryIso)) {
    console.error('Super Admin bootstrap aborted — SUPER_ADMIN_COUNTRY_ISO must be an ISO-2 country code.');
    process.exitCode = 1;
    return;
  }

  if (gender !== 'male' && gender !== 'female') {
    console.error('Super Admin bootstrap aborted — SUPER_ADMIN_GENDER must be "male" or "female".');
    process.exitCode = 1;
    return;
  }

  const conn = await mysql.createConnection(config);
  await conn.query(`USE \`${dbName}\``);

  try {
    // Resolve the country from the schema (no hardcoded IDs).
    const [countries] = await conn.execute(
      'SELECT id, phone_code FROM countries WHERE iso_code = ? AND is_active = 1 LIMIT 1',
      [countryIso],
    );
    if (countries.length === 0) {
      throw new Error(`No active countries row found for iso_code '${countryIso}'`);
    }
    const countryId = countries[0].id;
    const countryPhoneCode = countries[0].phone_code;
    if (!countryPhoneCode) {
      throw new Error(`countries.phone_code is empty for iso_code '${countryIso}'`);
    }
    const fullPhone = `${normalizeCountryCode(countryPhoneCode)}${phoneNumber}`;

    // A soft-deleted row still occupies the UNIQUE full_phone slot, so an insert
    // would fail with an opaque duplicate-key error. Stop with a clear message.
    const [softDeleted] = await conn.execute(
      'SELECT id FROM users WHERE full_phone = ? AND deleted_at IS NOT NULL LIMIT 1',
      [fullPhone],
    );
    if (softDeleted.length > 0) {
      throw new Error(
        'A soft-deleted user already owns this phone number; restore that account or choose a different SUPER_ADMIN_PHONE.',
      );
    }

    // Resolve the seeded system role (roles.slug = 'super_admin', organisation_id NULL).
    const [roles] = await conn.execute(
      `SELECT id FROM roles
        WHERE slug = 'super_admin' AND organisation_id IS NULL AND deleted_at IS NULL
        LIMIT 1`,
    );
    if (roles.length === 0) {
      throw new Error("Role 'super_admin' is not seeded — run the baseline seeds first");
    }
    const roleId = roles[0].id;

    // `full_phone` is the login lookup key (`userRepository.findByPhone`, deleted_at IS NULL).
    const [existing] = await conn.execute(
      'SELECT id, account_status FROM users WHERE full_phone = ? AND deleted_at IS NULL LIMIT 1',
      [fullPhone],
    );

    let userId;
    if (existing.length > 0) {
      userId = existing[0].id;
      if (existing[0].account_status !== 'active') {
        throw new Error(
          `Existing user ${userId} has account_status '${existing[0].account_status}' — activate it before bootstrapping`,
        );
      }
      console.log(`Super Admin already exists (user ID ${userId}) — ensuring role assignment.`);
    } else {
      const [emailRows] = await conn.execute(
        'SELECT id FROM users WHERE email = ? LIMIT 1',
        [email],
      );
      if (emailRows.length > 0) {
        throw new Error('SUPER_ADMIN_EMAIL is already used by another user — choose a different email');
      }

      const [result] = await conn.execute(
        `INSERT INTO users
           (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          countryId,
          phoneNumber,
          fullPhone,
          email,
          hashPassword(password),
          fullName,
          gender,
        ],
      );
      userId = result.insertId;
      console.log(`Super Admin user created (user ID: ${userId}).`);
    }

    // `user_roles` has assigned_at / is_active defaults; `assigned_by` is nullable.
    // INSERT IGNORE never reactivates a revoked grant, so re-read and verify the
    // grant is genuinely effective instead of reporting success blindly.
    await conn.execute(
      'INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, NULL)',
      [userId, roleId],
    );
    const [grantRows] = await conn.execute(
      `SELECT is_active,
              (expires_at IS NOT NULL AND expires_at <= NOW()) AS is_expired
         FROM user_roles
        WHERE user_id = ? AND role_id = ?
        LIMIT 1`,
      [userId, roleId],
    );
    const grant = grantRows[0];
    const grantEffective =
      Boolean(grant) && Number(grant.is_active) === 1 && Number(grant.is_expired) === 0;

    if (!grantEffective) {
      console.error(
        `Role 'super_admin' grant for user ${userId} exists but is NOT effective (is_active=0 or expired). ` +
          'No grant was reactivated or modified — re-activate it explicitly (or remove the stale row) and re-run.',
      );
      process.exitCode = 1;
      return;
    }

    console.log(`Role 'super_admin' (role ID ${roleId}) ensured and effective for user ${userId}.`);
    console.log(
      'If other role grants are missing, run sync-role-permissions.mjs with matching ' +
        '--confirm-host / --confirm-port / --confirm-db values.',
    );
  } catch (err) {
    console.error('Admin bootstrap failed:', safeErrorMessage(err));
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

bootstrapAdmin().catch((err) => {
  console.error('Admin bootstrap failed:', safeErrorMessage(err));
  process.exit(1);
});
