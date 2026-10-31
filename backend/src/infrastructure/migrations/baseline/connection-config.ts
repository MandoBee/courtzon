// ============================================================================
// CourtZon — shared connection-configuration parser (D1/V2 support, P8).
//
// Scope of this module:
//   * validates the connection configuration that the read-only bootstrap
//     preflight (D1) and the live metadata CLI (V2) will hand to mysql2;
//   * validates the TLS *shape* only (`DB_SSL_MODE`, `DB_SSL_CA`,
//     `DB_SSL_SERVER_NAME`). It never opens the CA file, never trusts a
//     certificate and never opens a connection;
//   * is a pure function over explicit input values: no `process.env`, no
//     filesystem, no mysql2, no network and no side effects.
//
// The approved-target guard (`e2e/helpers/cleanup-guard.ts`) is deliberately
// NOT re-implemented here. Host/port/database target restrictions stay a
// separate mandatory step so this parser cannot weaken them.
//
// Secret handling: the parsed config exposes `password` as a NON-ENUMERABLE
// own property, so `console.log`, `util.inspect`, `JSON.stringify` and object
// spread never include it. Read it directly as `config.password`. No error
// message produced by this module contains a supplied value.
//
// Validation only. A successful parse does NOT prove the CA file exists, is
// readable, is a valid PEM bundle, or is trusted by the server.
// ============================================================================

/** Supported TLS modes for the future D1/V2 TLS integration. */
export type TlsMode = 'disabled' | 'verify-ca' | 'verify-full';

/** Allowed `DB_SSL_MODE` values, in increasing strictness order. */
export const TLS_MODES: readonly TlsMode[] = ['disabled', 'verify-ca', 'verify-full'];

/**
 * Exit code a future CLI must use for configuration errors.
 * Kept here so the parser and the CLI cannot drift apart.
 */
export const CONNECTION_CONFIG_EXIT_CODE = 2;

/** Canonical field names used in structured issues (never secret values). */
export type ConnectionConfigField =
  | 'DB_HOST'
  | 'DB_PORT'
  | 'DB_USER'
  | 'DB_PASSWORD'
  | 'EXPECTED_DATABASE'
  | 'DB_SSL_MODE'
  | 'DB_SSL_CA'
  | 'DB_SSL_SERVER_NAME';

/** Stable, machine-readable issue codes for CLI reporting. */
export type ConnectionConfigIssueCode =
  | 'MISSING_REQUIRED'
  | 'INVALID_FIELD_TYPE'
  | 'INVALID_PORT'
  | 'TLS_UNEXPECTED_WITHOUT_MODE'
  | 'TLS_MODE_UNKNOWN'
  | 'TLS_CA_REQUIRED'
  | 'TLS_CA_NOT_ABSOLUTE'
  | 'TLS_CA_INVALID_PATH'
  | 'TLS_SERVER_NAME_EMPTY'
  | 'TLS_SERVER_NAME_INVALID'
  | 'TLS_SERVER_NAME_WITHOUT_VERIFY_FULL'
  | 'TLS_SETTING_WITH_DISABLED';

/** One structured validation problem. Messages never include supplied values. */
export interface ConnectionConfigIssue {
  readonly field: ConnectionConfigField;
  readonly code: ConnectionConfigIssueCode;
  readonly message: string;
}

/**
 * Explicit parser input. Values are supplied by the caller; the module never
 * reads globals. `database` is the expected database name (D1 passes
 * `--expect-database`; `DB_NAME`/`MYSQL_DATABASE` are intentionally ignored).
 */
export interface ConnectionConfigInput {
  readonly host?: string | undefined;
  readonly port?: string | number | undefined;
  readonly user?: string | undefined;
  /** Optional; defaults to an empty string, matching the existing CLIs. */
  readonly password?: string | undefined;
  readonly database?: string | undefined;
  readonly sslMode?: string | undefined;
  readonly sslCa?: string | undefined;
  readonly sslServerName?: string | undefined;
}

/** Validated TLS settings. `caPath` is only a syntactically valid path. */
export interface ParsedTlsConfig {
  readonly mode: TlsMode;
  /** Absolute path supplied by the operator; existence is NOT verified here. */
  readonly caPath: string | null;
  /** `verify-full` identity, or null to let the caller default it to `host`. */
  readonly serverName: string | null;
}

/** Validated connection settings ready for a future mysql2 integration. */
export interface ParsedConnectionConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  /**
   * Non-enumerable at runtime: never serialized by JSON.stringify, object
   * spread or console inspection. Access it directly.
   */
  readonly password: string;
  readonly database: string;
  readonly tls: ParsedTlsConfig;
}

export type ConnectionConfigParseResult =
  | { readonly ok: true; readonly config: ParsedConnectionConfig; readonly issues: readonly ConnectionConfigIssue[] }
  | { readonly ok: false; readonly config: null; readonly issues: readonly ConnectionConfigIssue[] };

/** Environment-shaped record. Explicit input only — never `process.env` here. */
export type ConnectionEnvironment = Readonly<Record<string, string | undefined>>;

const ABSOLUTE_WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/;
const ABSOLUTE_WINDOWS_UNC = /^\\\\/;

function isAbsolutePath(value: string): boolean {
  // POSIX absolute (covers "//server/share"), Windows drive absolute, UNC.
  return value.startsWith('/') || ABSOLUTE_WINDOWS_DRIVE.test(value) || ABSOLUTE_WINDOWS_UNC.test(value);
}

function issue(field: ConnectionConfigField, code: ConnectionConfigIssueCode, message: string): ConnectionConfigIssue {
  return { field, code, message };
}

function readRequiredText(value: unknown, field: ConnectionConfigField): { text: string | null; issue: ConnectionConfigIssue | null } {
  if (value === undefined) {
    return { text: null, issue: issue(field, 'MISSING_REQUIRED', `${field} is required and must not be empty.`) };
  }
  if (typeof value !== 'string') {
    return { text: null, issue: issue(field, 'INVALID_FIELD_TYPE', `${field} must be a string.`) };
  }
  const text = value.trim();
  if (text.length === 0) {
    return { text: null, issue: issue(field, 'MISSING_REQUIRED', `${field} is required and must not be empty.`) };
  }
  return { text, issue: null };
}

function readPort(value: unknown): { port: number | null; issue: ConnectionConfigIssue | null } {
  if (value === undefined) {
    return { port: null, issue: issue('DB_PORT', 'MISSING_REQUIRED', 'DB_PORT is required and must not be empty.') };
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      return { port: null, issue: issue('DB_PORT', 'INVALID_PORT', 'DB_PORT must be an integer between 1 and 65535.') };
    }
    return { port: value, issue: null };
  }
  if (typeof value !== 'string') {
    return { port: null, issue: issue('DB_PORT', 'INVALID_FIELD_TYPE', 'DB_PORT must be a string or an integer.') };
  }
  const text = value.trim();
  if (text.length === 0) {
    return { port: null, issue: issue('DB_PORT', 'MISSING_REQUIRED', 'DB_PORT is required and must not be empty.') };
  }
  // Digits only: rejects signs, decimals, exponents, whitespace and suffixes.
  if (!/^\d+$/.test(text)) {
    return { port: null, issue: issue('DB_PORT', 'INVALID_PORT', 'DB_PORT must be an integer between 1 and 65535.') };
  }
  const port = Number(text);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    return { port: null, issue: issue('DB_PORT', 'INVALID_PORT', 'DB_PORT must be an integer between 1 and 65535.') };
  }
  return { port, issue: null };
}

function readPassword(value: unknown): string | null {
  if (value === undefined) return '';
  if (typeof value !== 'string') return null;
  return value;
}

function readCaPath(value: unknown): { caPath: string | null; issue: ConnectionConfigIssue | null } {
  if (value === undefined) {
    return { caPath: null, issue: issue('DB_SSL_CA', 'TLS_CA_REQUIRED', 'DB_SSL_CA is required when DB_SSL_MODE is verify-ca or verify-full.') };
  }
  if (typeof value !== 'string') {
    return { caPath: null, issue: issue('DB_SSL_CA', 'INVALID_FIELD_TYPE', 'DB_SSL_CA must be a string path.') };
  }
  const caPath = value.trim();
  if (caPath.length === 0) {
    return { caPath: null, issue: issue('DB_SSL_CA', 'TLS_CA_REQUIRED', 'DB_SSL_CA is required when DB_SSL_MODE is verify-ca or verify-full.') };
  }
  if (caPath.includes('\u0000')) {
    return { caPath: null, issue: issue('DB_SSL_CA', 'TLS_CA_INVALID_PATH', 'DB_SSL_CA must not contain null bytes.') };
  }
  if (!isAbsolutePath(caPath)) {
    return { caPath: null, issue: issue('DB_SSL_CA', 'TLS_CA_NOT_ABSOLUTE', 'DB_SSL_CA must be an absolute path (for example /etc/ssl/ca.pem or C:\\certs\\ca.pem).') };
  }
  return { caPath, issue: null };
}

function readServerName(value: unknown): { serverName: string | null; issue: ConnectionConfigIssue | null } {
  if (typeof value !== 'string') {
    return { serverName: null, issue: issue('DB_SSL_SERVER_NAME', 'INVALID_FIELD_TYPE', 'DB_SSL_SERVER_NAME must be a string.') };
  }
  const serverName = value.trim();
  if (serverName.length === 0) {
    return { serverName: null, issue: issue('DB_SSL_SERVER_NAME', 'TLS_SERVER_NAME_EMPTY', 'DB_SSL_SERVER_NAME must not be empty when supplied.') };
  }
  if (/\s/.test(serverName) || serverName.includes('/') || serverName.includes('\\')) {
    return { serverName: null, issue: issue('DB_SSL_SERVER_NAME', 'TLS_SERVER_NAME_INVALID', 'DB_SSL_SERVER_NAME must be a hostname or IP literal without spaces or path separators.') };
  }
  return { serverName, issue: null };
}

/**
 * Validates the TLS configuration block.
 *
 * Rules:
 *   * no `DB_SSL_*` variable supplied      -> `disabled` (current behaviour);
 *   * `DB_SSL_CA`/`DB_SSL_SERVER_NAME` supplied without `DB_SSL_MODE` -> error;
 *   * `DB_SSL_MODE=disabled` with other TLS settings -> error;
 *   * `verify-ca`/`verify-full` require an absolute `DB_SSL_CA` path;
 *   * `DB_SSL_SERVER_NAME` is only meaningful for `verify-full`.
 *
 * Returns null only when the mode cannot be determined or is unknown.
 */
function readTls(
  input: ConnectionConfigInput,
  issues: ConnectionConfigIssue[],
): ParsedTlsConfig | null {
  const caSupplied = input.sslCa !== undefined;
  const serverNameSupplied = input.sslServerName !== undefined;

  if (input.sslMode === undefined) {
    if (!caSupplied && !serverNameSupplied) {
      return { mode: 'disabled', caPath: null, serverName: null };
    }
    issues.push(issue('DB_SSL_MODE', 'TLS_UNEXPECTED_WITHOUT_MODE', 'DB_SSL_MODE must be set when any DB_SSL_* variable is supplied; TLS is never toggled implicitly.'));
    // Report every supplied TLS problem in one pass.
    const ca = caSupplied ? readCaPath(input.sslCa) : { caPath: null, issue: null };
    const name = serverNameSupplied ? readServerName(input.sslServerName) : { serverName: null, issue: null };
    if (ca.issue) issues.push(ca.issue);
    if (name.issue) issues.push(name.issue);
    return null;
  }

  if (typeof input.sslMode !== 'string') {
    issues.push(issue('DB_SSL_MODE', 'INVALID_FIELD_TYPE', 'DB_SSL_MODE must be a string.'));
    return null;
  }

  const modeText = input.sslMode.trim();
  if (!(TLS_MODES as readonly string[]).includes(modeText)) {
    issues.push(issue('DB_SSL_MODE', 'TLS_MODE_UNKNOWN', `DB_SSL_MODE must be one of: ${TLS_MODES.join(', ')}.`));
    return null;
  }
  const mode = modeText as TlsMode;

  if (mode === 'disabled') {
    if (caSupplied) issues.push(issue('DB_SSL_CA', 'TLS_SETTING_WITH_DISABLED', 'DB_SSL_CA must not be set when DB_SSL_MODE is disabled.'));
    if (serverNameSupplied) issues.push(issue('DB_SSL_SERVER_NAME', 'TLS_SETTING_WITH_DISABLED', 'DB_SSL_SERVER_NAME must not be set when DB_SSL_MODE is disabled.'));
    return { mode, caPath: null, serverName: null };
  }

  const ca = readCaPath(input.sslCa);
  if (ca.issue) issues.push(ca.issue);

  let serverName: string | null = null;
  if (serverNameSupplied) {
    if (mode !== 'verify-full') {
      issues.push(issue('DB_SSL_SERVER_NAME', 'TLS_SERVER_NAME_WITHOUT_VERIFY_FULL', 'DB_SSL_SERVER_NAME is only valid with DB_SSL_MODE=verify-full.'));
    } else {
      const name = readServerName(input.sslServerName);
      if (name.issue) issues.push(name.issue);
      serverName = name.serverName;
    }
  }

  return { mode, caPath: ca.caPath, serverName };
}

/**
 * Pure parser/validator.
 *
 * Returns all issues in deterministic order (host, port, user, password,
 * database, TLS) instead of throwing, so a CLI can map `ok: false` to exit
 * code {@link CONNECTION_CONFIG_EXIT_CODE}. The parser does not enforce any
 * approved-target policy (loopback/port/database pinning); that remains the
 * separate guard's responsibility.
 */
export function parseConnectionConfig(input: ConnectionConfigInput): ConnectionConfigParseResult {
  const issues: ConnectionConfigIssue[] = [];

  const host = readRequiredText(input.host, 'DB_HOST');
  const port = readPort(input.port);
  const user = readRequiredText(input.user, 'DB_USER');
  const database = readRequiredText(input.database, 'EXPECTED_DATABASE');

  if (host.issue) issues.push(host.issue);
  if (port.issue) issues.push(port.issue);
  if (user.issue) issues.push(user.issue);

  const password = readPassword(input.password);
  if (password === null) {
    issues.push(issue('DB_PASSWORD', 'INVALID_FIELD_TYPE', 'DB_PASSWORD must be a string when supplied.'));
  }

  if (database.issue) issues.push(database.issue);

  const tls = readTls(input, issues);

  if (host.issue || port.issue || user.issue || database.issue || password === null || tls === null || issues.length > 0) {
    return { ok: false, config: null, issues };
  }

  const config: ParsedConnectionConfig = {
    host: host.text as string,
    port: port.port as number,
    user: user.text as string,
    password,
    database: database.text as string,
    tls,
  };

  // Keep the secret out of serialization/inspection while remaining readable
  // as a normal property. The literal above is configurable, so this is safe.
  Object.defineProperty(config, 'password', {
    value: password,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return { ok: true, config, issues };
}

/**
 * Maps an explicit environment-shaped record onto parser input.
 *
 * Deliberately does NOT read `DB_NAME`/`MYSQL_DATABASE`: the expected database
 * is supplied by the caller (`--expect-database` in D1), exactly as the
 * existing CLIs do. Callers pass `process.env` only at their I/O boundary.
 */
export function connectionConfigFromEnvironment(env: ConnectionEnvironment): ConnectionConfigInput {
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    sslMode: env.DB_SSL_MODE,
    sslCa: env.DB_SSL_CA,
    sslServerName: env.DB_SSL_SERVER_NAME,
  };
}

/**
 * Renders issues as CLI-safe lines. Contains field names and static messages
 * only — never a supplied value (and therefore never a password or CA content).
 */
export function describeConnectionConfigIssues(issues: readonly ConnectionConfigIssue[]): string {
  return issues.map((item) => `- [${item.code}] ${item.field}: ${item.message}`).join('\n');
}
