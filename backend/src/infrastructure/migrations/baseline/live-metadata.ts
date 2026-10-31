// ============================================================================
// CourtZon — read-only live-schema metadata reader (V2).
//
// This module reads MySQL 8.0 metadata and returns a deterministic, typed
// snapshot for the future V3 comparator. It never compares against the
// baseline, never writes history, never runs migrations and never imports the
// application pool, transaction helpers, migration runner or entrypoint.
//
// The reader is strictly read-only:
//   * a dedicated mysql2/promise connection (or an injected test connection);
//   * optional TLS: an operator-supplied CA bundle is loaded and the chain is
//     always verified; `verify-full` additionally enables mysql2's
//     `verifyIdentity` so the certificate identity is checked on the same
//     connection before credentials are sent (DNS host names only);
//   * no DDL/DML/GET_LOCK/migration-history writes;
//   * an attempted read-only session/transaction as defence in depth;
//   * connection.end() in a finally block on every success/failure path.
// ============================================================================

import { readFile, stat } from 'node:fs/promises';
import { isIP } from 'node:net';
import mysql from 'mysql2/promise';
import { canonicalJson, sha256Hex, tableSignature, triggerSignature, type TableSignature, type TriggerSignature } from './baseline-manifest.js';
import type { ParsedTlsConfig, TlsMode } from './connection-config.js';
import { parseSql, tokenize, canonicalSql } from './parse-baseline.js';
import type { StaticValidationReport } from './static-validation.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LiveMetadataCode =
  | 'STATIC_VALIDATION_FAILED'
  | 'TARGET_NOT_APPROVED'
  | 'CONNECTION_FAILED'
  | 'WRONG_DATABASE'
  | 'UNSUPPORTED_SERVER'
  | 'TLS_CONFIGURATION_FAILED'
  | 'TLS_NOT_ESTABLISHED'
  | 'INSUFFICIENT_PRIVILEGES'
  | 'METADATA_ACCESS_DENIED'
  | 'SCHEMA_EMPTY'
  | 'READ_ONLY_SESSION_UNSUPPORTED'
  | 'UNSUPPORTED_DDL'
  | 'UNSUPPORTED_OBJECT'
  | 'AMBIGUOUS_TRIGGER_ORDER'
  | 'CHECK_CONSTRAINTS_UNAVAILABLE'
  | 'TRIGGER_VISIBILITY_UNKNOWN'
  | 'RUNTIME_OBJECT_EXCLUDED'
  | 'VIEW_PRESENT'
  | 'INTERNAL_ERROR';

export type LiveFindingSeverity = 'error' | 'warning' | 'info';

export interface LiveMetadataFinding {
  code: LiveMetadataCode;
  severity: LiveFindingSeverity;
  path: string;
  message: string;
  details?: string;
}

export interface MetadataConnection {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<[T[], unknown]>;
  end(): Promise<void>;
}

export interface LiveConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /**
   * Optional validated TLS block. Omitted or `disabled` preserves the exact
   * pre-P8.2 behaviour (an unencrypted connection).
   */
  tls?: ParsedTlsConfig;
}

export type MetadataConnectionFactory = (config: LiveConnectionConfig) => Promise<MetadataConnection>;

/** Resolved TLS material: CA bundle in memory plus the identity to verify. */
export interface ResolvedLiveTls {
  readonly mode: TlsMode;
  /**
   * `rejectUnauthorized: true` always enables chain verification.
   * `verify-full` sets `verifyIdentity: true` so mysql2 verifies the server
   * certificate identity on the same connection, before credentials are sent.
   */
  readonly ssl: { readonly ca: Buffer; readonly rejectUnauthorized: true; readonly verifyIdentity: boolean } | null;
  /** Certificate identity used by `verify-full`; null for `verify-ca`. */
  readonly serverName: string | null;
}

/**
 * Raised for any TLS configuration problem before a MySQL connection is opened.
 * `message` is the only reason carried to CLI/report output and MUST stay safe:
 * no password, certificate contents, private keys, CA paths or connection
 * details. Internal diagnostics belong in code comments/logs, not here.
 */
export class LiveTlsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveTlsConfigurationError';
  }
}

export interface LiveMetadataOptions {
  /** V1 report; if not ok the reader refuses to connect. */
  staticValidation: StaticValidationReport;
  /** Required explicit identity check. Must equal SELECT DATABASE(). */
  expectDatabase: string;
  connection: LiveConnectionConfig;
  /** Tables created by the runner rather than the baseline. Default: migration_history. */
  runtimeObjects?: string[];
  /** Test/DI seam; defaults to a dedicated mysql2/promise connection. */
  createConnection?: MetadataConnectionFactory;
  /**
   * Optional fail-closed target policy, invoked after V1 and before any
   * connection is created. Generic library callers may omit it; the baseline
   * CLIs always supply the approved-local policy.
   */
  targetGuard?: LiveTargetGuard;
}

/** Validated connection target handed to a target-policy guard. */
export interface LiveTarget {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly expectDatabase: string;
}

/** Fail-closed target policy. Throws to refuse the connection. */
export type LiveTargetGuard = (target: LiveTarget) => void;

export type ServerFamily = 'mysql' | 'mariadb';

export interface LiveDatabaseIdentity {
  name: string;
  version: string;
  versionComment: string;
  serverFamily: ServerFamily;
  lowerCaseTableNames: number;
}

export interface LiveTableSnapshot {
  name: string;
  signature: TableSignature;
  objectSha256: string;
  /** false when SHOW CREATE TABLE was unavailable/unparseable and I_S was used. */
  exact: boolean;
  source: 'show_create' | 'information_schema';
}

export interface LiveTriggerSnapshot {
  name: string;
  signature: TriggerSignature;
  objectSha256: string;
  exact: boolean;
  source: 'information_schema' | 'show_create';
}

export interface LiveUnsupportedObject {
  kind: 'table' | 'column' | 'index' | 'foreignKey' | 'check' | 'trigger' | 'view';
  name: string;
  reason: string;
}

export interface LiveSchemaSnapshot {
  database: LiveDatabaseIdentity;
  tables: Record<string, LiveTableSnapshot>;
  triggers: Record<string, LiveTriggerSnapshot>;
  runtimeObjects: string[];
  views: string[];
  unsupportedObjects: LiveUnsupportedObject[];
  snapshotSha256: string;
}

export interface LiveMetadataReport {
  ok: boolean;
  complete: boolean;
  snapshot?: LiveSchemaSnapshot;
  findings: LiveMetadataFinding[];
  fatal?: {
    code: LiveMetadataCode;
    message: string;
    details?: string;
  };
}

// ---------------------------------------------------------------------------
// Internal metadata row shapes
// ---------------------------------------------------------------------------

interface TableRow {
  tableName: string;
  tableType: string;
  engine: string | null;
  collation: string | null;
  createOptions: string | null;
}

interface CollationRow {
  collationName: string;
  characterSetName: string;
}

interface ColumnRow {
  tableName: string;
  columnName: string;
  ordinalPosition: number | string;
  columnType: string;
  isNullable: string;
  columnDefault: string | null;
  extra: string | null;
  generationExpression: string | null;
  characterSet: string | null;
  collation: string | null;
}

interface StatisticsRow {
  tableName: string;
  indexName: string;
  nonUnique: number | string;
  seqInIndex: number | string;
  columnName: string | null;
  subPart: number | string | null;
  collation: string | null;
  indexType: string;
  expression: string | null;
  isVisible: string | null;
}

interface ForeignKeyRow {
  tableName: string;
  constraintName: string;
  columnName: string;
  ordinalPosition: number | string;
  referencedTableSchema: string | null;
  referencedTableName: string | null;
  referencedColumnName: string | null;
  updateRule: string | null;
  deleteRule: string | null;
  matchOption: string | null;
}

interface CheckRow {
  tableName: string;
  constraintName: string;
  checkClause: string;
}

interface TriggerRow {
  triggerName: string;
  eventObjectTable: string;
  eventManipulation: string;
  actionTiming: string;
  actionStatement: string;
  actionOrder: number | string | null;
}

interface IdentityRow {
  databaseName: string | null;
  version: string;
  versionComment: string | null;
  lowerCaseTableNames: number | string;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const DEFAULT_RUNTIME_OBJECTS = ['migration_history'];

function isSupportedMysql(version: string): boolean {
  const match = /^8\.0\.(\d+)/.exec(version);
  return match ? Number(match[1]) >= 16 : false;
}

function add(
  findings: LiveMetadataFinding[],
  code: LiveMetadataCode,
  severity: LiveFindingSeverity,
  path: string,
  message: string,
  details?: string,
): void {
  const key = `${code}|${path}|${message}`;
  if (findings.some((finding) => `${finding.code}|${finding.path}|${finding.message}` === key)) return;
  findings.push({ code, severity, path, message, ...(details === undefined ? {} : { details }) });
}

function sortFindings(findings: LiveMetadataFinding[]): LiveMetadataFinding[] {
  return [...findings].sort((a, b) => {
    const left = `${a.code}|${a.severity}|${a.path}`;
    const right = `${b.code}|${b.severity}|${b.path}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function fatalReport(
  findings: LiveMetadataFinding[],
  code: LiveMetadataCode,
  message: string,
  details?: string,
): LiveMetadataReport {
  add(findings, code, 'error', 'live-metadata', message, details);
  return {
    ok: false,
    complete: false,
    findings: sortFindings(findings),
    fatal: { code, message, ...(details === undefined ? {} : { details }) },
  };
}

function successReport(snapshot: LiveSchemaSnapshot, findings: LiveMetadataFinding[]): LiveMetadataReport {
  const sorted = sortFindings(findings);
  return {
    ok: true,
    complete: !sorted.some((finding) => finding.severity === 'error'),
    snapshot,
    findings: sorted,
  };
}

function errorCode(error: unknown): string | undefined {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const value = (error as { code?: unknown }).code;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

function isAccessDenied(code: string | undefined): boolean {
  if (!code) return false;
  return (
    ['ER_TABLEACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR', 'ER_ACCESS_DENIED_ERROR', 'ER_SPECIFIC_ACCESS_DENIED_ERROR', 'ER_COLUMNACCESS_DENIED_ERROR', 'ER_PROCACCESS_DENIED_ERROR', 'ER_TRIGGER_ACCESS_DENIED'].includes(code) ||
    ['1044', '1142', '1143', '1227', '1370'].includes(code)
  );
}

async function queryRows<T>(connection: MetadataConnection, sql: string): Promise<T[]> {
  const [rows] = await connection.query<T>(sql);
  return rows;
}

// ---------------------------------------------------------------------------
// TLS (configuration validation, CA loading, status check)
// ---------------------------------------------------------------------------

/**
 * Loads and validates a PEM CA bundle. Only path shape is validated by the
 * shared parser; existence, regular-file type, non-empty content and PEM
 * framing are enforced here, before any MySQL connection. Cryptographic
 * validity and trust are enforced by the TLS handshake itself.
 */
async function loadCaBundle(caPath: string): Promise<Buffer> {
  let info;
  try {
    info = await stat(caPath);
  } catch {
    throw new LiveTlsConfigurationError('DB_SSL_CA could not be read; verify the path and file permissions.');
  }
  if (!info.isFile()) throw new LiveTlsConfigurationError('DB_SSL_CA must point to a regular file.');
  if (info.size === 0) throw new LiveTlsConfigurationError('DB_SSL_CA file is empty.');

  let bundle: Buffer;
  try {
    bundle = await readFile(caPath);
  } catch {
    throw new LiveTlsConfigurationError('DB_SSL_CA could not be read; verify the path and file permissions.');
  }

  const text = bundle.toString('utf8');
  if (text.includes('\u0000')) {
    throw new LiveTlsConfigurationError('DB_SSL_CA contains binary data, not a PEM certificate bundle.');
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) {
    throw new LiveTlsConfigurationError('DB_SSL_CA must contain certificates only, not private keys.');
  }
  const beginCount = text.match(/-----BEGIN CERTIFICATE-----/g)?.length ?? 0;
  const endCount = text.match(/-----END CERTIFICATE-----/g)?.length ?? 0;
  if (beginCount === 0 || beginCount !== endCount) {
    throw new LiveTlsConfigurationError('DB_SSL_CA is not a valid PEM certificate bundle.');
  }
  // Full X.509 parsing/trust is enforced by the TLS handshake with
  // rejectUnauthorized: true; this pre-check only fails fast on malformed files.
  return bundle;
}

/**
 * Resolves the validated TLS block into mysql2 SSL options.
 *
 * `disabled` (or no `tls` at all) returns no SSL options, preserving the
 * previous unencrypted behaviour. Enabled modes always load a CA bundle and
 * set `rejectUnauthorized: true`.
 *
 * `verify-full` relies on mysql2's own `verifyIdentity`, which checks the
 * certificate identity on the same connection before credentials are sent.
 * That is only possible when mysql2 receives a DNS host name: it deliberately
 * suppresses the TLS server name for IP literals, so an IP host or a server
 * name that differs from the connection host is rejected rather than being
 * "checked" on a separate connection.
 */
export async function resolveLiveTls(tls: ParsedTlsConfig | undefined, host: string): Promise<ResolvedLiveTls> {
  if (!tls || tls.mode === 'disabled') {
    return { mode: 'disabled', ssl: null, serverName: null };
  }

  // Defense in depth: never trust an unchecked runtime value, even though the
  // shared parser already restricts the mode union.
  if (tls.mode !== 'verify-ca' && tls.mode !== 'verify-full') {
    throw new LiveTlsConfigurationError('Unsupported DB_SSL_MODE; expected disabled, verify-ca or verify-full.');
  }

  let serverName: string | null = null;
  if (tls.mode === 'verify-full') {
    serverName = tls.serverName ?? host;
    if (!serverName) {
      throw new LiveTlsConfigurationError('A certificate server name is required for DB_SSL_MODE=verify-full.');
    }
    if (isIP(host)) {
      throw new LiveTlsConfigurationError(
        'DB_SSL_MODE=verify-full cannot be used with an IP host: mysql2 cannot verify certificate identity for IP addresses on the credential-bearing connection. Use DB_SSL_MODE=verify-ca or connect through a DNS name present in the certificate.',
      );
    }
    if (normalizeHostName(serverName) !== normalizeHostName(host)) {
      throw new LiveTlsConfigurationError(
        'DB_SSL_MODE=verify-full requires DB_SSL_SERVER_NAME to match DB_HOST: mysql2 cannot verify a different certificate name on the credential-bearing connection.',
      );
    }
  }

  if (!tls.caPath) {
    throw new LiveTlsConfigurationError('DB_SSL_CA is required when DB_SSL_MODE enables TLS.');
  }
  const ca = await loadCaBundle(tls.caPath);

  return {
    mode: tls.mode,
    ssl: { ca, rejectUnauthorized: true, verifyIdentity: tls.mode === 'verify-full' },
    serverName,
  };
}

/** Normalizes DNS names for the verify-full host/server-name equality check. */
function normalizeHostName(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

/** Reads the negotiated TLS cipher for the live session ('' when unencrypted). */
export async function readTlsSessionCipher(connection: MetadataConnection): Promise<string> {
  const rows = await queryRows<Record<string, unknown>>(connection, "SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  const row = rows[0];
  if (!row) return '';
  const entry = Object.entries(row).find(([key]) => key.toLowerCase() === 'value');
  const value = entry?.[1];
  return typeof value === 'string' ? value.trim() : '';
}

function quoteIdentifier(value: string): string {
  return `\`${value.replace(/`/g, '``')}\``;
}

function canonicalizeSqlText(sql: string): string {
  return canonicalSql(tokenize(sql).tokens);
}

function normalizeType(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  // MySQL 8.0.19+ deprecates integer display widths; preserve tinyint(1).
  return normalized.replace(/\b(int|bigint|smallint|mediumint)\(\d+\)/g, '$1');
}

function normalizeDefault(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (/^current_timestamp(?:\(\d*\))?$/i.test(trimmed)) return 'current_timestamp';
  return trimmed;
}

function normalizeFkAction(value: string | null): string {
  const normalized = (value ?? '').trim().toUpperCase();
  if (!normalized || normalized === 'RESTRICT' || normalized === 'NO ACTION') return 'RESTRICT';
  return normalized;
}

/**
 * The live snapshot normalizes semantic FK defaults (omitted/NULL/NO ACTION
 * and RESTRICT are equivalent in MySQL). V3 must apply the same normalization
 * to the manifest side before comparing.
 */
function normalizeTableSignature(signature: TableSignature): TableSignature {
  return {
    ...signature,
    foreignKeys: signature.foreignKeys.map((foreignKey) => ({
      ...foreignKey,
      onDelete: normalizeFkAction(foreignKey.onDelete),
      onUpdate: normalizeFkAction(foreignKey.onUpdate),
    })),
  };
}

function generatedStorageFromExtra(extra: string | null): 'VIRTUAL' | 'STORED' | null {
  if (!extra) return null;
  if (/STORED\s+GENERATED/i.test(extra)) return 'STORED';
  if (/VIRTUAL\s+GENERATED/i.test(extra)) return 'VIRTUAL';
  return null;
}

function onUpdateFromExtra(extra: string | null): string | null {
  if (!extra) return null;
  const match = /on update\s+(.+)$/i.exec(extra);
  return match ? canonicalizeSqlText(match[1]) : null;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function stringValue(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return null;
  return String(value);
}

// ---------------------------------------------------------------------------
// Privileges
// ---------------------------------------------------------------------------

function grantAllows(grants: string[], privilege: 'SELECT' | 'TRIGGER', database: string): boolean {
  const target = database.toUpperCase();
  for (const grant of grants) {
    const match = /^GRANT\s+(.+?)\s+ON\s+(.+?)\s+TO\s+/i.exec(grant);
    if (!match) continue;
    const privileges = match[1].toUpperCase().split(',').map((value) => value.trim());
    const scope = match[2].toUpperCase().replace(/`/g, '');
    const global = scope === '*.*';
    const schema = scope === `${target}.*`;
    if (!global && !schema) continue;
    if (privileges.includes('ALL PRIVILEGES') || privileges.includes('ALL') || privileges.includes(privilege)) return true;
  }
  return false;
}

async function readGrants(connection: MetadataConnection): Promise<string[]> {
  const rows = await queryRows<Record<string, unknown>>(connection, 'SHOW GRANTS FOR CURRENT_USER()');
  return rows
    .map((row) => Object.values(row).find((value): value is string => typeof value === 'string') ?? '')
    .filter((value) => value.length > 0);
}

// ---------------------------------------------------------------------------
// I_S fallback signature construction (used only when SHOW CREATE fails)
// ---------------------------------------------------------------------------

function buildFallbackTableSignature(
  tableName: string,
  tableRow: TableRow,
  columns: ColumnRow[],
  statistics: StatisticsRow[],
  foreignKeys: ForeignKeyRow[],
  checks: CheckRow[],
  collationCharacterSets: Map<string, string>,
  database: string,
  findings: LiveMetadataFinding[],
): TableSignature {
  const columnSignatures = columns
    .slice()
    .sort((a, b) => Number(a.ordinalPosition) - Number(b.ordinalPosition))
    .map((column) => ({
      name: column.columnName.toLowerCase(),
      type: normalizeType(column.columnType),
      nullable: String(column.isNullable).toUpperCase() === 'YES',
      default: normalizeDefault(column.columnDefault),
      autoIncrement: /auto_increment/i.test(column.extra ?? ''),
      generated: column.generationExpression ? canonicalizeSqlText(column.generationExpression) : null,
      generatedStorage: generatedStorageFromExtra(column.extra),
      onUpdate: onUpdateFromExtra(column.extra),
      characterSet: column.characterSet,
      collation: column.collation,
    }));

  const indexRows = new Map<string, StatisticsRow[]>();
  for (const row of statistics) {
    const name = row.indexName.toLowerCase();
    const group = indexRows.get(name) ?? [];
    group.push(row);
    indexRows.set(name, group);
  }
  const indexSignatures = [...indexRows.entries()]
    .sort(([a], [b]) => compareStrings(a, b))
    .flatMap(([name, rows]) => {
      const ordered = rows.slice().sort((a, b) => Number(a.seqInIndex) - Number(b.seqInIndex));
      const functional = ordered.find((row) => row.expression !== null && row.expression !== undefined);
      if (functional) {
        add(findings, 'UNSUPPORTED_OBJECT', 'error', `tables.${tableName}.indexes.${name}`, 'functional index cannot be represented by the manifest signature', functional.expression ?? '');
        return [];
      }
      if (ordered.some((row) => String(row.isVisible ?? 'YES').toUpperCase() === 'NO')) {
        add(findings, 'UNSUPPORTED_OBJECT', 'error', `tables.${tableName}.indexes.${name}`, 'invisible index is not represented by the manifest signature', 'INVISIBLE');
      }
      const indexColumns = ordered
        .filter((row) => row.columnName !== null)
        .map((row) => ({
          name: String(row.columnName).toLowerCase(),
          desc: String(row.collation ?? '').toUpperCase() === 'D',
          prefixLength: row.subPart === null || row.subPart === undefined ? null : Number(row.subPart),
        }));
      if (indexColumns.length === 0) return [];
      const primary = name === 'primary';
      const fulltext = String(ordered[0].indexType).toUpperCase() === 'FULLTEXT';
      const unique = Number(ordered[0].nonUnique) === 0;
      return [{
        name,
        kind: primary ? 'PRIMARY' as const : fulltext ? 'FULLTEXT' as const : unique ? 'UNIQUE' as const : 'KEY' as const,
        unique,
        columns: indexColumns,
      }];
    });

  const foreignKeyRows = new Map<string, ForeignKeyRow[]>();
  for (const row of foreignKeys) {
    const name = row.constraintName.toLowerCase();
    const group = foreignKeyRows.get(name) ?? [];
    group.push(row);
    foreignKeyRows.set(name, group);
  }
  const foreignKeySignatures = [...foreignKeyRows.entries()]
    .sort(([a], [b]) => compareStrings(a, b))
    .flatMap(([name, rows]) => {
      const ordered = rows.slice().sort((a, b) => Number(a.ordinalPosition) - Number(b.ordinalPosition));
      const first = ordered[0];
      if (!first.referencedTableName) return [];
      if (first.referencedTableSchema && first.referencedTableSchema !== database) {
        add(findings, 'UNSUPPORTED_OBJECT', 'error', `tables.${tableName}.foreignKeys.${name}`, 'cross-schema foreign key is not supported', first.referencedTableSchema);
      }
      return [{
        name,
        columns: ordered.map((row) => row.columnName.toLowerCase()),
        referencedTable: first.referencedTableName.toLowerCase(),
        referencedColumns: ordered.map((row) => String(row.referencedColumnName).toLowerCase()),
        onDelete: normalizeFkAction(first.deleteRule),
        onUpdate: normalizeFkAction(first.updateRule),
      }];
    });

  const checkSignatures = checks
    .slice()
    .sort((a, b) => compareStrings(a.constraintName, b.constraintName))
    .map((check) => ({
      name: check.constraintName.toLowerCase(),
      expression: canonicalizeSqlText(check.checkClause),
    }));

  const collation = tableRow.collation;
  return normalizeTableSignature({
    name: tableName.toLowerCase(),
    engine: tableRow.engine,
    characterSet: collation ? collationCharacterSets.get(collation) ?? null : null,
    collation,
    columns: columnSignatures,
    indexes: indexSignatures,
    foreignKeys: foreignKeySignatures,
    checks: checkSignatures,
  });
}

function detectUnsupportedTableObjects(
  tableName: string,
  statistics: StatisticsRow[],
  foreignKeys: ForeignKeyRow[],
  database: string,
  findings: LiveMetadataFinding[],
  unsupportedObjects: LiveUnsupportedObject[],
): void {
  const functionalIndexes = new Set<string>();
  const invisibleIndexes = new Set<string>();
  for (const row of statistics) {
    if (row.expression !== null && row.expression !== undefined) functionalIndexes.add(row.indexName.toLowerCase());
    if (String(row.isVisible ?? 'YES').toUpperCase() === 'NO') invisibleIndexes.add(row.indexName.toLowerCase());
  }
  for (const name of functionalIndexes) {
    add(findings, 'UNSUPPORTED_OBJECT', 'error', `tables.${tableName}.indexes.${name}`, 'functional index cannot be represented by the manifest signature', 'functional index');
    unsupportedObjects.push({ kind: 'index', name: `${tableName}.${name}`, reason: 'functional index' });
  }
  for (const name of invisibleIndexes) {
    add(findings, 'UNSUPPORTED_OBJECT', 'error', `tables.${tableName}.indexes.${name}`, 'invisible index is not represented by the manifest signature', 'INVISIBLE');
    unsupportedObjects.push({ kind: 'index', name: `${tableName}.${name}`, reason: 'invisible index' });
  }
  const crossSchemaForeignKeys = new Set<string>();
  for (const row of foreignKeys) {
    if (row.referencedTableSchema && row.referencedTableSchema !== database) {
      crossSchemaForeignKeys.add(row.constraintName.toLowerCase());
    }
  }
  for (const name of crossSchemaForeignKeys) {
    add(findings, 'UNSUPPORTED_OBJECT', 'error', `tables.${tableName}.foreignKeys.${name}`, 'cross-schema foreign key is not supported', 'cross-schema');
    unsupportedObjects.push({ kind: 'foreignKey', name: `${tableName}.${name}`, reason: 'cross-schema foreign key' });
  }
}

// ---------------------------------------------------------------------------
// SHOW CREATE readers
// ---------------------------------------------------------------------------

async function readShowCreateTable(
  connection: MetadataConnection,
  database: string,
  tableName: string,
  findings: LiveMetadataFinding[],
): Promise<TableSignature | null> {
  try {
    const rows = await queryRows<Record<string, unknown>>(
      connection,
      `SHOW CREATE TABLE ${quoteIdentifier(database)}.${quoteIdentifier(tableName)}`,
    );
    const row = rows[0];
    const createSql = row
      ? Object.values(row).find((value): value is string => typeof value === 'string' && value.trim().toUpperCase().startsWith('CREATE TABLE'))
      : undefined;
    if (!createSql) throw new Error('SHOW CREATE TABLE returned no CREATE TABLE statement');
    if (/NOT\s+ENFORCED/i.test(createSql)) {
      add(findings, 'UNSUPPORTED_OBJECT', 'error', `tables.${tableName}.checks`, 'NOT ENFORCED check constraint is not represented by the manifest signature', 'NOT ENFORCED');
    }
    const parsed = parseSql(createSql, 'baseline');
    const table = parsed.tables.find((candidate) => candidate.name === tableName.toLowerCase()) ?? parsed.tables[0];
    if (!table) throw new Error('SHOW CREATE TABLE produced no parsed table');
    if (table.name !== tableName.toLowerCase()) throw new Error(`SHOW CREATE TABLE parsed '${table.name}' but expected '${tableName.toLowerCase()}'`);
    return normalizeTableSignature(tableSignature(table));
  } catch (error) {
    const code = errorCode(error);
    if (isAccessDenied(code)) {
      add(findings, 'METADATA_ACCESS_DENIED', 'error', `tables.${tableName}.showCreate`, 'SHOW CREATE TABLE access denied', code ?? 'permission denied');
    } else {
      add(findings, 'UNSUPPORTED_DDL', 'error', `tables.${tableName}.showCreate`, 'SHOW CREATE TABLE could not be parsed into an exact signature', error instanceof Error ? error.message : String(error));
    }
    return null;
  }
}

async function readShowCreateTrigger(
  connection: MetadataConnection,
  database: string,
  triggerName: string,
  findings: LiveMetadataFinding[],
): Promise<string | null> {
  try {
    const rows = await queryRows<Record<string, unknown>>(
      connection,
      `SHOW CREATE TRIGGER ${quoteIdentifier(database)}.${quoteIdentifier(triggerName)}`,
    );
    const row = rows[0];
    const createSql = row
      ? Object.values(row).find((value): value is string => typeof value === 'string' && value.trim().toUpperCase().startsWith('CREATE'))
      : undefined;
    if (!createSql) throw new Error('SHOW CREATE TRIGGER returned no CREATE statement');
    const upper = createSql.toUpperCase();
    const marker = 'FOR EACH ROW';
    const markerIndex = upper.indexOf(marker);
    if (markerIndex === -1) throw new Error('SHOW CREATE TRIGGER has no FOR EACH ROW clause');
    const body = createSql.slice(markerIndex + marker.length).trim();
    if (!body) throw new Error('SHOW CREATE TRIGGER has an empty body');
    return canonicalizeSqlText(body);
  } catch (error) {
    const code = errorCode(error);
    if (isAccessDenied(code)) {
      add(findings, 'METADATA_ACCESS_DENIED', 'error', `triggers.${triggerName}.showCreate`, 'SHOW CREATE TRIGGER access denied', code ?? 'permission denied');
    } else {
      add(findings, 'UNSUPPORTED_DDL', 'error', `triggers.${triggerName}.showCreate`, 'SHOW CREATE TRIGGER could not be read', error instanceof Error ? error.message : String(error));
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

async function applyReadOnlySession(connection: MetadataConnection, findings: LiveMetadataFinding[]): Promise<void> {
  for (const statement of ['SET SESSION TRANSACTION READ ONLY', 'START TRANSACTION READ ONLY']) {
    try {
      await connection.query(statement);
    } catch (error) {
      add(findings, 'READ_ONLY_SESSION_UNSUPPORTED', 'warning', 'connection.readOnlySession', `Read-only session safeguard was not accepted: ${statement}`, error instanceof Error ? error.message : String(error));
    }
  }
}

async function readIdentity(connection: MetadataConnection): Promise<IdentityRow> {
  const rows = await queryRows<IdentityRow>(
    connection,
    'SELECT DATABASE() AS databaseName, VERSION() AS version, @@version_comment AS versionComment, @@lower_case_table_names AS lowerCaseTableNames',
  );
  if (!rows[0]) throw new Error('database identity query returned no rows');
  return rows[0];
}

async function readChecks(
  connection: MetadataConnection,
  findings: LiveMetadataFinding[],
): Promise<CheckRow[]> {
  try {
    return await queryRows<CheckRow>(
      connection,
      `SELECT t.TABLE_NAME AS tableName, c.CONSTRAINT_NAME AS constraintName, c.CHECK_CLAUSE AS checkClause
         FROM information_schema.TABLE_CONSTRAINTS t
         JOIN information_schema.CHECK_CONSTRAINTS c
           ON c.CONSTRAINT_SCHEMA = t.CONSTRAINT_SCHEMA
          AND c.CONSTRAINT_NAME = t.CONSTRAINT_NAME
        WHERE t.TABLE_SCHEMA = DATABASE()
          AND t.CONSTRAINT_TYPE = 'CHECK'
        ORDER BY t.TABLE_NAME, c.CONSTRAINT_NAME`,
    );
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ER_NO_SUCH_TABLE' || code === '1146') {
      add(findings, 'CHECK_CONSTRAINTS_UNAVAILABLE', 'warning', 'metadata.checkConstraints', 'CHECK_CONSTRAINTS is unavailable; SHOW CREATE TABLE remains the exact source', code);
      return [];
    }
    throw error;
  }
}

export async function readLiveSchema(options: LiveMetadataOptions): Promise<LiveMetadataReport> {
  const findings: LiveMetadataFinding[] = [];

  if (!options.staticValidation.ok) {
    return fatalReport(
      findings,
      'STATIC_VALIDATION_FAILED',
      'V1 static validation must succeed before a database connection is opened',
      `${options.staticValidation.summary.findings} static finding(s)`,
    );
  }

  if (options.targetGuard) {
    try {
      options.targetGuard({
        host: options.connection.host,
        port: options.connection.port,
        database: options.connection.database,
        expectDatabase: options.expectDatabase,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fatalReport(findings, 'TARGET_NOT_APPROVED', 'Target refused by the baseline target policy', message);
    }
  }

  let connection: MetadataConnection | undefined;
  const factory = options.createConnection ?? (async (config: LiveConnectionConfig) => {
    const tls = await resolveLiveTls(config.tls, config.host);

    const created = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      multipleStatements: false,
      dateStrings: true,
      timezone: 'Z',
      charset: 'utf8mb4',
      ...(tls.ssl ? { ssl: tls.ssl } : {}),
    });
    return created as unknown as MetadataConnection;
  });

  try {
    connection = await factory(options.connection);
  } catch (error) {
    if (error instanceof LiveTlsConfigurationError) {
      // The class contract guarantees a safe, specific reason. It is surfaced
      // as `details` so the CLI prints both the stable headline and the cause.
      return fatalReport(findings, 'TLS_CONFIGURATION_FAILED', 'TLS configuration could not be applied', error.message);
    }
    return fatalReport(
      findings,
      'CONNECTION_FAILED',
      'Could not open the dedicated read-only metadata connection',
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    const tlsMode = options.connection.tls?.mode ?? 'disabled';
    if (tlsMode !== 'disabled') {
      let cipher = '';
      try {
        cipher = await readTlsSessionCipher(connection);
      } catch {
        cipher = '';
      }
      if (!cipher) {
        return fatalReport(
          findings,
          'TLS_NOT_ESTABLISHED',
          `TLS mode ${tlsMode} is required but the session is not encrypted`,
        );
      }
    }

    await applyReadOnlySession(connection, findings);

    const identity = await readIdentity(connection);
    const database = stringValue(identity.databaseName) ?? '';
    if (database !== options.expectDatabase) {
      return fatalReport(
        findings,
        'WRONG_DATABASE',
        'Connected database does not match --expect-database',
        `expected=${options.expectDatabase} actual=${database || '<null>'}`,
      );
    }

    const version = stringValue(identity.version) ?? '';
    const versionComment = stringValue(identity.versionComment) ?? '';
    const serverFamily: ServerFamily = /MARIADB/i.test(versionComment) || /MARIADB/i.test(version) ? 'mariadb' : 'mysql';
    if (serverFamily !== 'mysql' || !isSupportedMysql(version)) {
      return fatalReport(
        findings,
        'UNSUPPORTED_SERVER',
        'Only MySQL 8.0.16+ is supported for exact metadata reading',
        `family=${serverFamily} version=${version} comment=${versionComment}`,
      );
    }

    const grants = await readGrants(connection);
    if (!grantAllows(grants, 'SELECT', database)) {
      return fatalReport(
        findings,
        'INSUFFICIENT_PRIVILEGES',
        'Schema-wide SELECT privilege is required for metadata reading',
        `database=${database}`,
      );
    }
    const hasTriggerPrivilege = grantAllows(grants, 'TRIGGER', database);
    if (!hasTriggerPrivilege && options.staticValidation.summary.triggerCount > 0) {
      add(findings, 'TRIGGER_VISIBILITY_UNKNOWN', 'error', 'metadata.triggers', 'TRIGGER privilege is missing; trigger absence cannot be proven', `expected triggers=${options.staticValidation.summary.triggerCount}`);
    }

    const tableRows = await queryRows<TableRow>(
      connection,
      `SELECT TABLE_NAME AS tableName, TABLE_TYPE AS tableType, ENGINE AS engine, TABLE_COLLATION AS collation, CREATE_OPTIONS AS createOptions
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME`,
    );
    const baseTables = tableRows.filter((row) => String(row.tableType).toUpperCase() === 'BASE TABLE');
    const views = tableRows
      .filter((row) => String(row.tableType).toUpperCase() === 'VIEW')
      .map((row) => row.tableName.toLowerCase())
      .sort(compareStrings);
    const runtimeObjects = new Set(options.runtimeObjects ?? DEFAULT_RUNTIME_OBJECTS);
    const nonRuntimeBaseTables = baseTables.filter((row) => !runtimeObjects.has(row.tableName.toLowerCase()));
    for (const view of views) {
      add(findings, 'VIEW_PRESENT', 'warning', `views.${view}`, 'Database view is not represented by the baseline manifest', view);
    }
    if (baseTables.length === 0 || nonRuntimeBaseTables.length === 0) {
      return fatalReport(findings, 'SCHEMA_EMPTY', 'No non-runtime base tables were found in the expected database', `database=${database}`);
    }

    const collationRows = await queryRows<CollationRow>(
      connection,
      'SELECT COLLATION_NAME AS collationName, CHARACTER_SET_NAME AS characterSetName FROM information_schema.COLLATIONS',
    );
    const collationCharacterSets = new Map(collationRows.map((row) => [row.collationName, row.characterSetName]));

    const columnRows = await queryRows<ColumnRow>(
      connection,
      `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, ORDINAL_POSITION AS ordinalPosition,
              COLUMN_TYPE AS columnType, IS_NULLABLE AS isNullable, COLUMN_DEFAULT AS columnDefault,
              EXTRA AS extra, GENERATION_EXPRESSION AS generationExpression,
              CHARACTER_SET_NAME AS characterSet, COLLATION_NAME AS collation
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    );
    const statisticsRows = await queryRows<StatisticsRow>(
      connection,
      `SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique,
              SEQ_IN_INDEX AS seqInIndex, COLUMN_NAME AS columnName, SUB_PART AS subPart,
              COLLATION AS collation, INDEX_TYPE AS indexType, EXPRESSION AS expression,
              IS_VISIBLE AS isVisible
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
    );
    const foreignKeyRows = await queryRows<ForeignKeyRow>(
      connection,
      `SELECT k.TABLE_NAME AS tableName, k.CONSTRAINT_NAME AS constraintName, k.COLUMN_NAME AS columnName,
              k.ORDINAL_POSITION AS ordinalPosition, k.REFERENCED_TABLE_SCHEMA AS referencedTableSchema,
              k.REFERENCED_TABLE_NAME AS referencedTableName, k.REFERENCED_COLUMN_NAME AS referencedColumnName,
              r.UPDATE_RULE AS updateRule, r.DELETE_RULE AS deleteRule, r.MATCH_OPTION AS matchOption
         FROM information_schema.KEY_COLUMN_USAGE k
         JOIN information_schema.REFERENTIAL_CONSTRAINTS r
           ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
          AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
          AND r.TABLE_NAME = k.TABLE_NAME
        WHERE k.TABLE_SCHEMA = DATABASE()
          AND k.REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`,
    );
    const checkRows = await readChecks(connection, findings);
    const triggerRows = await queryRows<TriggerRow>(
      connection,
      `SELECT TRIGGER_NAME AS triggerName, EVENT_OBJECT_TABLE AS eventObjectTable,
              EVENT_MANIPULATION AS eventManipulation, ACTION_TIMING AS actionTiming,
              ACTION_STATEMENT AS actionStatement, ACTION_ORDER AS actionOrder
         FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA = DATABASE()
        ORDER BY TRIGGER_NAME`,
    );

    const runtimeFound: string[] = [];
    const tables: Record<string, LiveTableSnapshot> = {};
    const unsupportedObjects: LiveUnsupportedObject[] = [];
    const baseTableNames = new Set(baseTables.map((row) => row.tableName.toLowerCase()));

    for (const tableRow of baseTables) {
      const tableName = tableRow.tableName.toLowerCase();
      const columns = columnRows.filter((row) => row.tableName.toLowerCase() === tableName);
      const statistics = statisticsRows.filter((row) => row.tableName.toLowerCase() === tableName);
      const fks = foreignKeyRows.filter((row) => row.tableName.toLowerCase() === tableName);
      const checks = checkRows.filter((row) => row.tableName.toLowerCase() === tableName);

      if (/partitioned/i.test(String(tableRow.createOptions ?? ''))) {
        add(findings, 'UNSUPPORTED_OBJECT', 'error', `tables.${tableName}`, 'partitioned table is not represented by the manifest signature', 'partitioned');
        unsupportedObjects.push({ kind: 'table', name: tableName, reason: 'partitioned table' });
      }
      for (const column of columns) {
        if (/INVISIBLE/i.test(column.extra ?? '')) {
          add(findings, 'UNSUPPORTED_OBJECT', 'error', `tables.${tableName}.columns.${column.columnName}`, 'invisible column is not represented by the manifest signature', 'INVISIBLE');
          unsupportedObjects.push({ kind: 'column', name: `${tableName}.${column.columnName}`, reason: 'invisible column' });
        }
      }

      detectUnsupportedTableObjects(tableName, statistics, fks, database, findings, unsupportedObjects);
      const exactSignature = await readShowCreateTable(connection, database, tableRow.tableName, findings);
      const signature = exactSignature ?? buildFallbackTableSignature(
        tableName,
        tableRow,
        columns,
        statistics,
        fks,
        checks,
        collationCharacterSets,
        database,
        findings,
      );
      const exact = exactSignature !== null;
      if (!exact) {
        unsupportedObjects.push({ kind: 'table', name: tableName, reason: 'exact SHOW CREATE TABLE signature unavailable' });
      }

      if (runtimeObjects.has(tableName)) {
        runtimeFound.push(tableName);
        add(findings, 'RUNTIME_OBJECT_EXCLUDED', 'info', `runtimeObjects.${tableName}`, 'Runtime-created object is excluded from the default comparison snapshot', tableName);
        continue;
      }

      tables[tableName] = {
        name: tableName,
        signature,
        objectSha256: sha256Hex(canonicalJson(signature)),
        exact,
        source: exact ? 'show_create' : 'information_schema',
      };
    }

    const triggers: Record<string, LiveTriggerSnapshot> = {};
    const triggerGroups = new Map<string, string[]>();
    for (const triggerRow of triggerRows) {
      const triggerName = triggerRow.triggerName.toLowerCase();
      const tableName = triggerRow.eventObjectTable.toLowerCase();
      if (!baseTableNames.has(tableName)) {
        unsupportedObjects.push({ kind: 'trigger', name: triggerName, reason: `trigger table '${tableName}' is not a base table` });
        continue;
      }
      const timing = String(triggerRow.actionTiming).toUpperCase();
      const event = String(triggerRow.eventManipulation).toUpperCase();
      if ((timing !== 'BEFORE' && timing !== 'AFTER') || !['INSERT', 'UPDATE', 'DELETE'].includes(event)) {
        add(findings, 'UNSUPPORTED_OBJECT', 'error', `triggers.${triggerName}`, 'trigger timing/event is not representable', `${timing}/${event}`);
        unsupportedObjects.push({ kind: 'trigger', name: triggerName, reason: `unsupported timing/event ${timing}/${event}` });
        continue;
      }

      let body = canonicalizeSqlText(triggerRow.actionStatement ?? '');
      let exact = true;
      if (hasTriggerPrivilege) {
        const exactBody = await readShowCreateTrigger(connection, database, triggerRow.triggerName, findings);
        if (exactBody !== null) {
          body = exactBody;
        } else {
          exact = false;
        }
      } else {
        exact = false;
      }
      if (!body) {
        add(findings, 'UNSUPPORTED_OBJECT', 'error', `triggers.${triggerName}`, 'trigger body is empty or unreadable', triggerRow.triggerName);
        unsupportedObjects.push({ kind: 'trigger', name: triggerName, reason: 'empty/unreadable body' });
        continue;
      }

      const signature: TriggerSignature = {
        name: triggerName,
        table: tableName,
        timing: timing as 'BEFORE' | 'AFTER',
        event: event as 'INSERT' | 'UPDATE' | 'DELETE',
        body,
      };
      triggers[triggerName] = {
        name: triggerName,
        signature,
        objectSha256: sha256Hex(canonicalJson(signature)),
        exact,
        source: exact ? 'show_create' : 'information_schema',
      };
      const groupKey = `${tableName}|${timing}|${event}`;
      const group = triggerGroups.get(groupKey) ?? [];
      group.push(triggerName);
      triggerGroups.set(groupKey, group);
    }
    for (const [groupKey, names] of triggerGroups) {
      if (names.length > 1) {
        add(findings, 'AMBIGUOUS_TRIGGER_ORDER', 'error', `triggers.${groupKey}`, 'multiple triggers share the same table/timing/event; ACTION_ORDER is not represented by the manifest', names.sort(compareStrings).join(','));
      }
    }

    const unsupportedSorted = [...unsupportedObjects].sort((a, b) => compareStrings(`${a.kind}:${a.name}`, `${b.kind}:${b.name}`) || compareStrings(a.reason, b.reason));
    const snapshotPayload = {
      database: {
        name: database,
        version,
        versionComment,
        serverFamily,
        lowerCaseTableNames: Number.isFinite(Number(identity.lowerCaseTableNames)) ? Number(identity.lowerCaseTableNames) : 0,
      },
      tables,
      triggers,
      runtimeObjects: runtimeFound.sort(compareStrings),
      views,
      unsupportedObjects: unsupportedSorted,
    };
    const snapshot: LiveSchemaSnapshot = {
      ...snapshotPayload,
      snapshotSha256: sha256Hex(canonicalJson(snapshotPayload)),
    };

    return successReport(snapshot, findings);
  } catch (error) {
    const code = errorCode(error);
    if (isAccessDenied(code)) {
      return fatalReport(findings, 'METADATA_ACCESS_DENIED', 'Metadata access was denied while reading information_schema or SHOW CREATE', code ?? 'permission denied');
    }
    return fatalReport(findings, 'INTERNAL_ERROR', 'Metadata reading failed', error instanceof Error ? error.message : String(error));
  } finally {
    if (connection) {
      try {
        await connection.query('ROLLBACK');
      } catch {
        // Best effort; never mask the original failure.
      }
      try {
        await connection.end();
      } catch {
        // Connection closure is best effort; the dedicated connection is not reused.
      }
    }
  }
}
