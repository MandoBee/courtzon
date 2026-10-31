// ============================================================================
// CourtZon — Unified database TLS policy (Node / mysql2 side)
//
// SINGLE SOURCE OF TRUTH for how Node connections (the application pool, the
// migration runner's advisory-lock connection, and the permission-sync script)
// negotiate TLS with MySQL. The shell/CLI half of the same policy lives in
// backend/scripts/db-tls.sh — both implement the identical mode table:
//
//   DB_TLS_MODE=disable    -> plaintext            -> CLI: --skip-ssl
//   DB_TLS_MODE=require    -> encrypted, no cert   -> CLI: --ssl --skip-ssl-verify-server-cert
//   DB_TLS_MODE=verify-ca  -> encrypted + CA + SAN -> CLI: --ssl --ssl-ca=... --ssl-verify-server-cert
//
// Rules (identical on both sides):
//   * DB_TLS_MODE unset defaults to `disable` ONLY for an explicitly classified
//     local environment (COURTZON_MIGRATION_ENV=local, or NODE_ENV=development/
//     test). Non-local environments must set it explicitly and fail fast —
//     never a silent plaintext default.
//   * An UNKNOWN environment (both signals unset) is not local: it also fails
//     fast unless DB_TLS_MODE is set explicitly.
//   * Every variable is normalised by trimming leading/trailing whitespace and
//     lowercasing; internal whitespace is preserved so `dis able` is rejected.
//   * Unknown values fail fast with a secret-free message.
//   * verify-ca requires DB_TLS_CA_PATH, a readable PEM file, and full
//     certificate + hostname verification. No fallback, no weakening.
//
// Deliberately NOT read through the zod env schema: the policy validates here
// so the app, the migration runner and the shell CLI cannot drift apart.
// ============================================================================
import { X509Certificate } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';

export const DB_TLS_MODES = Object.freeze(['disable', 'require', 'verify-ca']);

/** Compatibility default for the existing local Docker development stack. */
export const LOCAL_DEFAULT_MODE = 'disable';

export class DbTlsPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DbTlsPolicyError';
  }
}

/** Deployment-environment classes the policy understands. */
export const DATABASE_ENVIRONMENTS = Object.freeze(['local', 'non-local', 'unknown']);

/**
 * Normalisation shared by every variable this policy reads: trim leading and
 * trailing whitespace only, then lowercase. Internal whitespace is preserved so
 * `dis able` is rejected instead of silently becoming `disable`.
 * Mirrors `db_tls_normalize` in backend/scripts/db-tls.sh.
 */
function normalizeEnvValue(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Classify the deployment environment — mirrors backend/scripts/db-tls.sh
 * `db_tls_environment` exactly.
 *
 * Precedence:
 *   1. An explicitly set COURTZON_MIGRATION_ENV decides: `local` = local,
 *      any other non-empty value = non-local.
 *   2. Otherwise NODE_ENV decides: development/test = local, any other
 *      non-empty value = non-local.
 *   3. Both unset/empty = `unknown`. Missing environment variables are NEVER
 *      treated as local; unknown callers must state DB_TLS_MODE explicitly.
 */
export function classifyDatabaseEnvironment(env = process.env) {
  const migrationEnv = normalizeEnvValue(env.COURTZON_MIGRATION_ENV);
  if (migrationEnv) return migrationEnv === 'local' ? 'local' : 'non-local';

  const nodeEnv = normalizeEnvValue(env.NODE_ENV);
  if (!nodeEnv) return 'unknown';

  return nodeEnv === 'development' || nodeEnv === 'test' ? 'local' : 'non-local';
}

/** True only for an explicitly classified local environment. */
export function isLocalDatabaseEnvironment(env = process.env) {
  return classifyDatabaseEnvironment(env) === 'local';
}

function loadCaCertificate(caPath) {
  let stats;
  try {
    stats = statSync(caPath);
  } catch {
    throw new DbTlsPolicyError(
      `DB_TLS_MODE=verify-ca: DB_TLS_CA_PATH does not exist or is not accessible: ${caPath}`,
    );
  }
  if (!stats.isFile()) {
    throw new DbTlsPolicyError(
      `DB_TLS_MODE=verify-ca: DB_TLS_CA_PATH is not a regular file: ${caPath}`,
    );
  }

  let pem;
  try {
    pem = readFileSync(caPath, 'utf8');
  } catch {
    throw new DbTlsPolicyError(
      `DB_TLS_MODE=verify-ca: DB_TLS_CA_PATH is not readable: ${caPath}`,
    );
  }
  if (!pem.includes('BEGIN CERTIFICATE')) {
    throw new DbTlsPolicyError(
      `DB_TLS_MODE=verify-ca: DB_TLS_CA_PATH is not a PEM certificate file: ${caPath}`,
    );
  }
  try {
    // Throws on malformed DER/base64 payloads — a header alone is not enough.
    new X509Certificate(pem);
  } catch {
    throw new DbTlsPolicyError(
      `DB_TLS_MODE=verify-ca: DB_TLS_CA_PATH contains an invalid certificate: ${caPath}`,
    );
  }
  return pem;
}

function cliArgsFor(mode, caPath) {
  switch (mode) {
    case 'disable':
      return ['--skip-ssl'];
    case 'require':
      // --ssl requests TLS; MariaDB's client verifies by default, so identity
      // verification must be disabled explicitly for "encrypted only".
      return ['--ssl', '--skip-ssl-verify-server-cert'];
    case 'verify-ca':
      return ['--ssl', `--ssl-ca=${caPath}`, '--ssl-verify-server-cert'];
    /* c8 ignore next 2 */
    default:
      throw new DbTlsPolicyError(`Unsupported DB_TLS_MODE: ${mode}`);
  }
}

function mysql2OptionsFor(mode, caPem) {
  switch (mode) {
    case 'disable':
      // mysql2 only negotiates TLS when `ssl` is present; omitting it is the
      // library's explicit plaintext path (connection_config.js: ssl || false).
      return {};
    case 'require':
      // Encrypted, but neither the chain nor the hostname is verified.
      return { ssl: { rejectUnauthorized: false } };
    case 'verify-ca':
      return {
        ssl: {
          ca: [caPem],
          rejectUnauthorized: true,
          // mysql2 only performs hostname identity checks when this is true
          // (base/connection.js: checkServerIdentity is a no-op otherwise).
          verifyIdentity: true,
        },
      };
    /* c8 ignore next 2 */
    default:
      throw new DbTlsPolicyError(`Unsupported DB_TLS_MODE: ${mode}`);
  }
}

/**
 * Resolve the effective database TLS policy.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ environment?: 'local'|'non-local'|'unknown' }} [options] test seam
 *        for the environment signal
 * @returns {{
 *   mode: 'disable'|'require'|'verify-ca',
 *   environment: 'local'|'non-local'|'unknown',
 *   local: boolean,
 *   caPath: string|null,
 *   caPem: string|null,
 *   warnings: string[],
 *   cliArgs: string[],
 *   mysql2: { ssl?: { ca?: string[], rejectUnauthorized?: boolean, verifyIdentity?: boolean } },
 * }}
 * @throws {DbTlsPolicyError} on unknown mode, missing CA, or an implicit
 *         plaintext default in a non-local or unclassified environment
 */
export function resolveDbTlsPolicy(env = process.env, options = {}) {
  const environment = options.environment ?? classifyDatabaseEnvironment(env);
  const warnings = [];
  let mode = normalizeEnvValue(env.DB_TLS_MODE);

  if (!mode) {
    if (environment === 'local') {
      mode = LOCAL_DEFAULT_MODE;
    } else if (environment === 'non-local') {
      throw new DbTlsPolicyError(
        'DB_TLS_MODE is not set. Non-local deployments must choose an explicit ' +
          'database TLS policy: disable, require or verify-ca ' +
          '(COURTZON_MIGRATION_ENV/NODE_ENV report a non-local environment). ' +
          'Refusing to fall back to plaintext.',
      );
    } else {
      throw new DbTlsPolicyError(
        'DB_TLS_MODE is not set and the deployment environment cannot be ' +
          'classified (COURTZON_MIGRATION_ENV and NODE_ENV are both unset). ' +
          'Set DB_TLS_MODE explicitly to one of: disable, require, verify-ca. ' +
          'Refusing to infer local plaintext from missing environment variables.',
      );
    }
  }

  if (!DB_TLS_MODES.includes(mode)) {
    throw new DbTlsPolicyError(
      `Invalid DB_TLS_MODE "${mode}". Expected one of: ${DB_TLS_MODES.join(', ')}.`,
    );
  }

  let caPath = null;
  let caPem = null;

  if (mode === 'verify-ca') {
    caPath = typeof env.DB_TLS_CA_PATH === 'string' ? env.DB_TLS_CA_PATH.trim() : '';
    if (!caPath) {
      throw new DbTlsPolicyError(
        'DB_TLS_MODE=verify-ca requires DB_TLS_CA_PATH to point at the PEM CA ' +
          'certificate used to sign the MySQL server certificate.',
      );
    }
    if (/\s/.test(caPath)) {
      throw new DbTlsPolicyError(
        'DB_TLS_CA_PATH must not contain whitespace: the shell runner and the ' +
          'Node driver must resolve the identical path.',
      );
    }
    caPem = loadCaCertificate(caPath);
  }

  if (mode === 'disable' && environment !== 'local') {
    warnings.push(
      environment === 'non-local'
        ? 'WARNING: DB_TLS_MODE=disable is explicitly set in a non-local ' +
            'environment — database traffic is NOT encrypted.'
        : 'WARNING: DB_TLS_MODE=disable is explicitly set while the deployment ' +
            'environment cannot be classified (COURTZON_MIGRATION_ENV and ' +
            'NODE_ENV are both unset) — database traffic is NOT encrypted.',
    );
  }

  return {
    mode,
    environment,
    local: environment === 'local',
    caPath,
    caPem,
    warnings,
    cliArgs: cliArgsFor(mode, caPath),
    mysql2: mysql2OptionsFor(mode, caPem),
  };
}

/** Secret-free one-line description safe to log at startup. */
export function describeDbTlsPolicy(policy) {
  switch (policy.mode) {
    case 'disable':
      return 'disable (plaintext)';
    case 'require':
      return 'require (encrypted; server certificate not verified)';
    case 'verify-ca':
      return `verify-ca (encrypted; CA + hostname verified via ${policy.caPath})`;
    /* c8 ignore next */
    default:
      return String(policy.mode);
  }
}
