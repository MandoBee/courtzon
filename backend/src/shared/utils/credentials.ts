/**
 * Credential redaction for API payloads.
 *
 * `users.password_hash` is a NOT NULL column and several repositories/joins use
 * `SELECT u.*` or `SELECT *`. Any handler that forwards a raw user row to the
 * client therefore risks serialising the password hash (or a future token /
 * secret column) into the response.
 *
 * This module is the single, fail-closed boundary helper: it removes every
 * field whose name identifies a credential, comparing names after normalising
 * case and separators so both `password_hash` (snake_case, DB) and
 * `passwordHash` (camelCase, mapped objects) are matched.
 *
 * It is intentionally shallow: user/profile rows returned by the API are flat.
 * Callers that nest a user row inside another object must sanitise that nested
 * object explicitly.
 */

/** Credential-bearing field names, compared after normalisation. */
const CREDENTIAL_FIELD_NAMES = new Set(
  [
    'password_hash',
    'password',
    'old_password',
    'new_password',
    'current_password',
    'confirm_password',
    'refresh_token',
    'refresh_token_hash',
    'session_token',
    'session_token_hash',
    'access_token',
    'access_token_hash',
    'remember_token',
    'reset_token',
    'password_reset_token',
    'email_verification_token',
    'two_factor_secret',
    'mfa_secret',
    'otp_secret',
    'api_key',
    'api_secret',
    'secret',
  ].map(normalizeFieldName),
);

/** Lowercase and drop separators: `password_hash` / `passwordHash` → `passwordhash`. */
function normalizeFieldName(name: string): string {
  return name.replace(/[_\-\s]/g, '').toLowerCase();
}

/** True when a field name identifies a credential and must never be serialised. */
export function isCredentialFieldName(name: string): boolean {
  if (!name) return false;
  return CREDENTIAL_FIELD_NAMES.has(normalizeFieldName(name));
}

/**
 * Return a copy of `record` without any credential field.
 *
 * A copy (never the original) is returned so callers cannot accidentally keep
 * a reference to the unredacted row through the same object.
 */
export function stripCredentialFields<T extends Record<string, any>>(record: T): T {
  if (!record || typeof record !== 'object') return record;
  const sanitised: Record<string, any> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isCredentialFieldName(key)) continue;
    sanitised[key] = value;
  }
  return sanitised as T;
}
