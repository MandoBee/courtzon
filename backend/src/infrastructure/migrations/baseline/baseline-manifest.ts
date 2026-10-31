// ============================================================================
// CourtZon — Deterministic baseline manifest (pure, no I/O, no database).
//
// The manifest is the machine-readable contract between the authoritative
// baseline (`database/baseline/001_courtzon_v3.sql`) and the migration chain
// (`database/migrations/*.sql`). It is produced ONLY by
// `backend/scripts/baseline-manifest.ts` and verified by
// `__tests__/baseline-manifest.spec.ts` + `--check`.
//
// THREE DISTINCT HASHES (never conflated):
//   * baseline.sha256      — raw bytes of the SQL file (stamping identity).
//   * schema.inventorySha256 — presence only: sorted `kind:name` identities.
//   * schema.objectSha256  — normalized per-object signatures (content).
//   * schema.schemaSha256  — compact commitment used for schema identity.
//   * migrations.files[].sha256 — raw bytes of each migration file.
//
// This module never reads files and never touches a database. Callers supply
// the SQL text; the CLI is the only I/O boundary.
// ============================================================================

import { createHash } from 'node:crypto';
import {
  hasSchemaDdl,
  parseSql,
  type ParsedIndex,
  type ParsedTable,
  type ParsedTrigger,
  type ParsedSql,
} from './parse-baseline.js';

export const MANIFEST_VERSION = 1;
export const GENERATOR_ID = 'backend/scripts/baseline-manifest.ts';

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

// ---------------------------------------------------------------------------
// Hashing / canonical serialisation
// ---------------------------------------------------------------------------

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Canonical LF normalization.
 *
 * Git (`* text=auto` + `core.autocrlf=true` on Windows) checks text files out
 * with CRLF on Windows and LF on Linux. Raw-byte hashing would therefore make
 * the committed manifest Windows-only, and would NOT match the
 * `content_sha256` that `scripts/migrate.sh` records from `sha256sum` inside
 * the Linux container. Hashing the LF-normalized content makes Windows and
 * Linux agree AND matches the production/CI file bytes exactly.
 */
export function toLf(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** SHA-256 of the LF-normalized UTF-8 content (the stamping identity). */
export function contentSha256(text: string): string {
  return sha256Hex(toLf(text));
}

/** Stable JSON: object keys sorted recursively, array order preserved. */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ManifestError('non-finite number in canonical JSON');
    return JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`).join(',')}}`;
  }
  throw new ManifestError(`unsupported JSON value type: ${typeof value}`);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Migration chain index (guard semantics are authoritative)
// ---------------------------------------------------------------------------

export type MigrationClassification = 'PRODUCTION_SAFE' | 'LOCAL_DOCKER_ONLY' | 'INVALID';

export interface MigrationInputFile {
  /** File name only (e.g. `203_convergence_indexes.sql`). */
  name: string;
  content: string;
}

export interface MigrationFileRecord {
  file: string;
  prefix: string;
  sha256: string;
  classification: MigrationClassification;
  /** First machine-readable marker value, or null when no marker exists. */
  marker: string | null;
}

export interface MigrationIndex {
  directory: string;
  hashKind: 'content_sha256_lf';
  count: number;
  distinctPrefixes: number;
  duplicatePrefixes: Array<{ prefix: string; files: string[] }>;
  missingPrefixes: string[];
  classifications: Record<MigrationClassification, number>;
  files: MigrationFileRecord[];
  sha256: string;
}

/**
 * Mirror of `backend/scripts/migration-guard.sh`:
 *   COURTZON_MIGRATION_MARKER_RE='^--[[:space:]]*COURTZON_MIGRATION_ENV:[[:space:]]*[A-Za-z0-9_]+[[:space:]]*$'
 *   value=$(grep -E "$RE" "$file" | head -n 1 | awk '{print $NF}')
 *
 * The FIRST matching line wins; no marker means PRODUCTION_SAFE; an
 * unrecognized value means INVALID (fail-closed downstream).
 */
const GUARD_MARKER_RE = /^--[ \t]*COURTZON_MIGRATION_ENV:[ \t]*([A-Za-z0-9_]+)[ \t]*$/;

export function guardMarkerValue(sql: string): string | null {
  for (const rawLine of sql.split(/\r?\n/)) {
    const m = GUARD_MARKER_RE.exec(rawLine);
    if (m) return m[1];
  }
  return null;
}

export function classifyMigration(sql: string): { classification: MigrationClassification; marker: string | null } {
  const marker = guardMarkerValue(sql);
  if (marker === null) return { classification: 'PRODUCTION_SAFE', marker: null };
  if (marker === 'PRODUCTION_SAFE') return { classification: 'PRODUCTION_SAFE', marker };
  if (marker === 'LOCAL_DOCKER_ONLY') return { classification: 'LOCAL_DOCKER_ONLY', marker };
  return { classification: 'INVALID', marker };
}

const PREFIX_RE = /^(\d{3})_/;

export function buildMigrationIndex(
  files: MigrationInputFile[],
  directory = 'database/migrations',
): MigrationIndex {
  const records: MigrationFileRecord[] = files.map((file) => {
    const m = PREFIX_RE.exec(file.name);
    if (!m) {
      throw new ManifestError(`migration file '${file.name}' does not start with a 3-digit prefix`);
    }
    const { classification, marker } = classifyMigration(file.content);
    return {
      file: file.name,
      prefix: m[1],
      sha256: contentSha256(file.content),
      classification,
      marker,
    };
  });
  records.sort((a, b) => compareStrings(a.file, b.file));

  const prefixCounts = new Map<string, string[]>();
  for (const record of records) {
    const list = prefixCounts.get(record.prefix) ?? [];
    list.push(record.file);
    prefixCounts.set(record.prefix, list);
  }

  const duplicatePrefixes = [...prefixCounts.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([prefix, names]) => ({ prefix, files: names.sort(compareStrings) }))
    .sort((a, b) => compareStrings(a.prefix, b.prefix));

  const numericPrefixes = [...prefixCounts.keys()].map((p) => Number(p));
  if (numericPrefixes.length === 0) {
    throw new ManifestError('migration directory contains no prefixed SQL files');
  }
  const maxPrefix = Math.max(...numericPrefixes);
  const missingPrefixes: string[] = [];
  for (let n = 1; n <= maxPrefix; n += 1) {
    const padded = String(n).padStart(3, '0');
    if (!prefixCounts.has(padded)) missingPrefixes.push(padded);
  }

  const classifications: Record<MigrationClassification, number> = {
    PRODUCTION_SAFE: records.filter((r) => r.classification === 'PRODUCTION_SAFE').length,
    LOCAL_DOCKER_ONLY: records.filter((r) => r.classification === 'LOCAL_DOCKER_ONLY').length,
    INVALID: records.filter((r) => r.classification === 'INVALID').length,
  };

  const index: MigrationIndex = {
    directory,
    hashKind: 'content_sha256_lf',
    count: records.length,
    distinctPrefixes: prefixCounts.size,
    duplicatePrefixes,
    missingPrefixes,
    classifications,
    files: records,
    sha256: '',
  };
  index.sha256 = sha256Hex(canonicalJson(records));
  return index;
}

// ---------------------------------------------------------------------------
// Normalized object signatures
// ---------------------------------------------------------------------------

export interface ColumnSignature {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  autoIncrement: boolean;
  generated: string | null;
  generatedStorage: 'VIRTUAL' | 'STORED' | null;
  onUpdate: string | null;
  characterSet: string | null;
  collation: string | null;
}

export interface IndexSignature {
  name: string;
  kind: 'PRIMARY' | 'UNIQUE' | 'KEY' | 'FULLTEXT';
  unique: boolean;
  columns: Array<{ name: string; desc: boolean; prefixLength: number | null }>;
}

export interface ForeignKeySignature {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete: string | null;
  onUpdate: string | null;
}

export interface CheckSignature {
  name: string | null;
  expression: string;
}

export interface TableSignature {
  name: string;
  engine: string | null;
  characterSet: string | null;
  collation: string | null;
  columns: ColumnSignature[];
  indexes: IndexSignature[];
  foreignKeys: ForeignKeySignature[];
  checks: CheckSignature[];
}

export interface TriggerSignature {
  name: string;
  table: string;
  timing: 'BEFORE' | 'AFTER';
  event: 'INSERT' | 'UPDATE' | 'DELETE';
  body: string;
}

export interface ManifestTableRecord {
  signature: TableSignature;
  objectSha256: string;
}

export interface ManifestTriggerRecord {
  signature: TriggerSignature;
  objectSha256: string;
}

/**
 * Normalization deliberately drops environment noise that is not schema
 * semantics:
 *   * AUTO_INCREMENT=<n> table options (per-server counter);
 *   * column / table / index COMMENT text (documentation);
 *   * ordinal/type casing.
 * Engine/charset/collation ARE retained — they are schema semantics.
 */
export function tableSignature(table: ParsedTable): TableSignature {
  return {
    name: table.name,
    engine: table.engine,
    characterSet: table.characterSet,
    collation: table.collation,
    columns: table.columns.map((c) => ({
      name: c.name,
      type: c.type,
      nullable: c.nullable,
      default: c.default,
      autoIncrement: c.autoIncrement,
      generated: c.generated,
      generatedStorage: c.generatedStorage,
      onUpdate: c.onUpdate,
      characterSet: c.characterSet,
      collation: c.collation,
    })),
    indexes: [...table.indexes]
      .sort((a, b) => compareStrings(a.name, b.name))
      .map((index) => ({
        name: index.name,
        kind: index.kind,
        unique: index.unique,
        columns: index.columns.map((column) => ({
          name: column.name,
          desc: column.desc,
          prefixLength: column.prefixLength,
        })),
      })),
    foreignKeys: [...table.foreignKeys]
      .sort((a, b) => compareStrings(a.name, b.name))
      .map((fk) => ({
        name: fk.name,
        columns: fk.columns,
        referencedTable: fk.referencedTable,
        referencedColumns: fk.referencedColumns,
        onDelete: fk.onDelete,
        onUpdate: fk.onUpdate,
      })),
    checks: [...table.checks]
      .sort((a, b) => compareStrings(a.name ?? '~', b.name ?? '~'))
      .map((check) => ({ name: check.name, expression: check.expression })),
  };
}

export function triggerSignature(trigger: ParsedTrigger): TriggerSignature {
  return {
    name: trigger.name,
    table: trigger.table,
    timing: trigger.timing,
    event: trigger.event,
    body: trigger.body,
  };
}

// ---------------------------------------------------------------------------
// Requirements (Tier A pins)
// ---------------------------------------------------------------------------

export interface RequiredTable {
  name: string;
  /** Exact ordered column list (identity pin). */
  columns?: string[];
  columnCount?: number;
}

export interface RequiredColumn {
  table: string;
  column: string;
  type?: string;
  nullable?: boolean;
  default?: string | null;
  autoIncrement?: boolean;
}

export interface RequiredIndex {
  table: string;
  name: string;
  columns: string[];
  unique: boolean;
}

export interface RequiredForeignKey {
  table: string;
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete: string | null;
  onUpdate: string | null;
}

export interface RequiredTrigger {
  name: string;
  table: string;
  timing: 'BEFORE' | 'AFTER';
  event: 'INSERT' | 'UPDATE' | 'DELETE';
}

export interface KnownGap {
  id: string;
  detail: string;
}

export interface SchemaHeadEvidence {
  head: string;
  /** Index repairs that MUST be produced by the head migration. */
  repairs: Array<{ table: string; index: string }>;
}

export interface BaselineRequirements {
  version: number;
  baselinePath: string;
  schemaHead: string;
  contentOnly: string[];
  schemaHeadEvidence: SchemaHeadEvidence;
  requiredTables: RequiredTable[];
  requiredColumns: RequiredColumn[];
  requiredIndexes: RequiredIndex[];
  requiredForeignKeys: RequiredForeignKey[];
  requiredTriggers: RequiredTrigger[];
  knownGaps: KnownGap[];
}

export interface ResolvedRequirements {
  version: number;
  pinCount: number;
  tables: string[];
  columns: string[];
  indexes: string[];
  foreignKeys: string[];
  triggers: string[];
  contentOnly: string[];
  schemaHead: string;
  sha256: string;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ManifestError(`requirements.${path} must be a non-empty string`);
  }
  return value;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ManifestError(`requirements.${path} must be an array`);
  return value;
}

export function parseRequirements(raw: string): BaselineRequirements {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ManifestError(`requirements file is not valid JSON: ${(err as Error).message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ManifestError('requirements file must be a JSON object');
  }
  const obj = parsed as Record<string, unknown>;
  const version = Number(obj.version);
  if (!Number.isInteger(version) || version < 1) {
    throw new ManifestError('requirements.version must be a positive integer');
  }
  const schemaHeadEvidence = obj.schemaHeadEvidence as Record<string, unknown> | undefined;
  if (!schemaHeadEvidence || typeof schemaHeadEvidence !== 'object') {
    throw new ManifestError('requirements.schemaHeadEvidence must be an object');
  }
  return {
    version,
    baselinePath: requireString(obj.baselinePath, 'baselinePath'),
    schemaHead: requireString(obj.schemaHead, 'schemaHead'),
    contentOnly: requireArray(obj.contentOnly, 'contentOnly').map((v) => requireString(v, 'contentOnly[]')),
    schemaHeadEvidence: {
      head: requireString(schemaHeadEvidence.head, 'schemaHeadEvidence.head'),
      repairs: requireArray(schemaHeadEvidence.repairs, 'schemaHeadEvidence.repairs').map((v, i) => {
        const r = v as Record<string, unknown>;
        return {
          table: requireString(r?.table, `schemaHeadEvidence.repairs[${i}].table`),
          index: requireString(r?.index, `schemaHeadEvidence.repairs[${i}].index`),
        };
      }),
    },
    requiredTables: requireArray(obj.requiredTables, 'requiredTables').map((v, i) => {
      const r = v as Record<string, unknown>;
      const pin: RequiredTable = { name: requireString(r?.name, `requiredTables[${i}].name`) };
      if (r?.columns !== undefined) {
        pin.columns = requireArray(r.columns, `requiredTables[${i}].columns`).map((c) => requireString(c, `requiredTables[${i}].columns[]`));
      }
      if (r?.columnCount !== undefined) {
        if (typeof r.columnCount !== 'number' || !Number.isInteger(r.columnCount)) {
          throw new ManifestError(`requirements.requiredTables[${i}].columnCount must be an integer`);
        }
        pin.columnCount = r.columnCount;
      }
      return pin;
    }),
    requiredColumns: requireArray(obj.requiredColumns, 'requiredColumns').map((v, i) => {
      const r = v as Record<string, unknown>;
      return {
        table: requireString(r?.table, `requiredColumns[${i}].table`),
        column: requireString(r?.column, `requiredColumns[${i}].column`),
        ...(r?.type !== undefined ? { type: requireString(r.type, `requiredColumns[${i}].type`) } : {}),
        ...(r?.nullable !== undefined ? { nullable: Boolean(r.nullable) } : {}),
        ...(r?.default !== undefined ? { default: r.default === null ? null : requireString(r.default, `requiredColumns[${i}].default`) } : {}),
        ...(r?.autoIncrement !== undefined ? { autoIncrement: Boolean(r.autoIncrement) } : {}),
      } satisfies RequiredColumn;
    }),
    requiredIndexes: requireArray(obj.requiredIndexes, 'requiredIndexes').map((v, i) => {
      const r = v as Record<string, unknown>;
      return {
        table: requireString(r?.table, `requiredIndexes[${i}].table`),
        name: requireString(r?.name, `requiredIndexes[${i}].name`),
        columns: requireArray(r?.columns, `requiredIndexes[${i}].columns`).map((c) => requireString(c, `requiredIndexes[${i}].columns[]`)),
        unique: Boolean(r?.unique),
      };
    }),
    requiredForeignKeys: requireArray(obj.requiredForeignKeys, 'requiredForeignKeys').map((v, i) => {
      const r = v as Record<string, unknown>;
      const action = (value: unknown): string | null => {
        if (value === null || value === undefined) return null;
        return requireString(value, `requiredForeignKeys[${i}].action`);
      };
      return {
        table: requireString(r?.table, `requiredForeignKeys[${i}].table`),
        name: requireString(r?.name, `requiredForeignKeys[${i}].name`),
        columns: requireArray(r?.columns, `requiredForeignKeys[${i}].columns`).map((c) => requireString(c, `requiredForeignKeys[${i}].columns[]`)),
        referencedTable: requireString(r?.referencedTable, `requiredForeignKeys[${i}].referencedTable`),
        referencedColumns: requireArray(r?.referencedColumns, `requiredForeignKeys[${i}].referencedColumns`).map((c) => requireString(c, `requiredForeignKeys[${i}].referencedColumns[]`)),
        onDelete: action(r?.onDelete),
        onUpdate: action(r?.onUpdate),
      };
    }),
    requiredTriggers: requireArray(obj.requiredTriggers, 'requiredTriggers').map((v, i) => {
      const r = v as Record<string, unknown>;
      const timing = requireString(r?.timing, `requiredTriggers[${i}].timing`).toUpperCase();
      const event = requireString(r?.event, `requiredTriggers[${i}].event`).toUpperCase();
      if (timing !== 'BEFORE' && timing !== 'AFTER') {
        throw new ManifestError(`requirements.requiredTriggers[${i}].timing must be BEFORE or AFTER`);
      }
      if (event !== 'INSERT' && event !== 'UPDATE' && event !== 'DELETE') {
        throw new ManifestError(`requirements.requiredTriggers[${i}].event must be INSERT, UPDATE or DELETE`);
      }
      return {
        name: requireString(r?.name, `requiredTriggers[${i}].name`),
        table: requireString(r?.table, `requiredTriggers[${i}].table`),
        timing,
        event,
      };
    }),
    knownGaps: requireArray(obj.knownGaps, 'knownGaps').map((v, i) => {
      const r = v as Record<string, unknown>;
      return {
        id: requireString(r?.id, `knownGaps[${i}].id`),
        detail: requireString(r?.detail, `knownGaps[${i}].detail`),
      };
    }),
  };
}

function fail(pin: string, detail: string): never {
  throw new ManifestError(`requirement '${pin}' failed: ${detail}`);
}

function eqList(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((v, i) => v === expected[i]);
}

function findTable(parsed: ParsedSql, name: string, pin: string): ParsedTable {
  const table = parsed.tables.find((t) => t.name === name);
  if (!table) fail(pin, `table '${name}' is missing from the baseline`);
  return table;
}

function findIndex(table: ParsedTable, name: string, pin: string): ParsedIndex {
  const index = table.indexes.find((i) => i.name === name);
  if (!index) fail(pin, `index '${name}' is missing from table '${table.name}'`);
  return index;
}

/**
 * Resolve every curated pin against the parsed baseline + migration chain.
 * Throws `ManifestError` on the first mismatch — nothing is downgraded to a
 * warning, because a stamping gate must never be advisory.
 */
export function resolveRequirements(
  parsed: ParsedSql,
  migrations: MigrationIndex,
  requirements: BaselineRequirements,
  requirementsSha256: string,
  migrationContents: Record<string, string>,
): ResolvedRequirements {
  const resolvedTables: string[] = [];
  for (const pin of requirements.requiredTables) {
    const id = `table:${pin.name}`;
    const table = findTable(parsed, pin.name, id);
    if (pin.columns) {
      const actual = table.columns.map((c) => c.name);
      if (!eqList(actual, pin.columns)) {
        fail(id, `columns differ (expected ${pin.columns.join(',')}; got ${actual.join(',')})`);
      }
    }
    if (pin.columnCount !== undefined && table.columns.length !== pin.columnCount) {
      fail(id, `expected ${pin.columnCount} columns, got ${table.columns.length}`);
    }
    resolvedTables.push(pin.name);
  }

  const resolvedColumns: string[] = [];
  for (const pin of requirements.requiredColumns) {
    const id = `column:${pin.table}.${pin.column}`;
    const table = findTable(parsed, pin.table, id);
    const column = table.columns.find((c) => c.name === pin.column);
    if (!column) fail(id, `column '${pin.column}' is missing from table '${pin.table}'`);
    if (pin.type !== undefined && column.type !== pin.type) {
      fail(id, `type differs (expected '${pin.type}'; got '${column.type}')`);
    }
    if (pin.nullable !== undefined && column.nullable !== pin.nullable) {
      fail(id, `nullable differs (expected ${pin.nullable}; got ${column.nullable})`);
    }
    if (pin.default !== undefined && column.default !== pin.default) {
      fail(id, `default differs (expected ${JSON.stringify(pin.default)}; got ${JSON.stringify(column.default)})`);
    }
    if (pin.autoIncrement !== undefined && column.autoIncrement !== pin.autoIncrement) {
      fail(id, `autoIncrement differs (expected ${pin.autoIncrement}; got ${column.autoIncrement})`);
    }
    resolvedColumns.push(`${pin.table}.${pin.column}`);
  }

  const resolvedIndexes: string[] = [];
  for (const pin of requirements.requiredIndexes) {
    const id = `index:${pin.table}.${pin.name}`;
    const table = findTable(parsed, pin.table, id);
    const index = findIndex(table, pin.name, id);
    if (index.unique !== pin.unique) {
      fail(id, `uniqueness differs (expected ${pin.unique}; got ${index.unique})`);
    }
    const actual = index.columns.map((c) => c.name);
    if (!eqList(actual, pin.columns)) {
      fail(id, `ordered columns differ (expected ${pin.columns.join(',')}; got ${actual.join(',')})`);
    }
    resolvedIndexes.push(`${pin.table}.${pin.name}`);
  }

  const resolvedForeignKeys: string[] = [];
  for (const pin of requirements.requiredForeignKeys) {
    const id = `foreignKey:${pin.table}.${pin.name}`;
    const table = findTable(parsed, pin.table, id);
    const fk = table.foreignKeys.find((f) => f.name === pin.name);
    if (!fk) fail(id, `foreign key '${pin.name}' is missing from table '${pin.table}'`);
    if (!eqList(fk.columns, pin.columns)) {
      fail(id, `local columns differ (expected ${pin.columns.join(',')}; got ${fk.columns.join(',')})`);
    }
    if (fk.referencedTable !== pin.referencedTable) {
      fail(id, `referenced table differs (expected '${pin.referencedTable}'; got '${fk.referencedTable}')`);
    }
    if (!eqList(fk.referencedColumns, pin.referencedColumns)) {
      fail(id, `referenced columns differ (expected ${pin.referencedColumns.join(',')}; got ${fk.referencedColumns.join(',')})`);
    }
    if (fk.onDelete !== pin.onDelete) {
      fail(id, `ON DELETE differs (expected ${JSON.stringify(pin.onDelete)}; got ${JSON.stringify(fk.onDelete)})`);
    }
    if (fk.onUpdate !== pin.onUpdate) {
      fail(id, `ON UPDATE differs (expected ${JSON.stringify(pin.onUpdate)}; got ${JSON.stringify(fk.onUpdate)})`);
    }
    resolvedForeignKeys.push(`${pin.table}.${pin.name}`);
  }

  const resolvedTriggers: string[] = [];
  for (const pin of requirements.requiredTriggers) {
    const id = `trigger:${pin.name}`;
    const trigger = parsed.triggers.find((t) => t.name === pin.name);
    if (!trigger) fail(id, 'trigger is missing from the baseline');
    if (trigger.table !== pin.table) {
      fail(id, `table differs (expected '${pin.table}'; got '${trigger.table}')`);
    }
    if (trigger.timing !== pin.timing) {
      fail(id, `timing differs (expected '${pin.timing}'; got '${trigger.timing}')`);
    }
    if (trigger.event !== pin.event) {
      fail(id, `event differs (expected '${pin.event}'; got '${trigger.event}')`);
    }
    resolvedTriggers.push(pin.name);
  }

  // --- schemaHead is VERIFIED, never inferred from the numeric prefix ------
  const numericPrefixes = migrations.files.map((file) => Number(file.prefix));
  const computedHead = String(Math.max(...numericPrefixes)).padStart(3, '0');
  if (computedHead !== requirements.schemaHead) {
    fail('schemaHead', `highest migration prefix is ${computedHead}, requirements pin ${requirements.schemaHead}`);
  }

  const headFile = migrations.files.find((file) => file.prefix === requirements.schemaHead);
  if (!headFile) fail('schemaHead', `no migration file carries prefix ${requirements.schemaHead}`);
  if (headFile.classification !== 'PRODUCTION_SAFE') {
    fail('schemaHead', `head migration '${headFile.file}' is ${headFile.classification}, not PRODUCTION_SAFE`);
  }

  // Content-only migrations must be proven content-only by parsing, not by
  // trusting their numeric prefix.
  for (const prefix of requirements.contentOnly) {
    const file = migrations.files.find((candidate) => candidate.prefix === prefix);
    if (!file) fail(`contentOnly:${prefix}`, 'no migration file carries this prefix');
    if (file.classification !== 'PRODUCTION_SAFE') {
      fail(`contentOnly:${prefix}`, `migration '${file.file}' is ${file.classification}`);
    }
    const sql = migrationContents[file.file];
    if (sql === undefined) {
      fail(`contentOnly:${prefix}`, `content for '${file.file}' was not supplied`);
    }
    if (hasSchemaDdl(sql)) {
      fail(`contentOnly:${prefix}`, `migration '${file.file}' contains schema DDL`);
    }
  }

  // The head migration must actually produce every audited repair.
  const evidence = requirements.schemaHeadEvidence;
  if (evidence.head !== requirements.schemaHead) {
    fail('schemaHeadEvidence.head', `expected '${requirements.schemaHead}', got '${evidence.head}'`);
  }
  const headSql = migrationContents[headFile.file];
  if (headSql === undefined) {
    fail('schemaHead', `content for '${headFile.file}' was not supplied`);
  }
  verifySchemaHeadRepairs(headSql, requirements);

  return {
    version: requirements.version,
    pinCount:
      requirements.requiredTables.length +
      requirements.requiredColumns.length +
      requirements.requiredIndexes.length +
      requirements.requiredForeignKeys.length +
      requirements.requiredTriggers.length,
    tables: resolvedTables,
    columns: resolvedColumns,
    indexes: resolvedIndexes,
    foreignKeys: resolvedForeignKeys,
    triggers: resolvedTriggers,
    contentOnly: [...requirements.contentOnly],
    schemaHead: requirements.schemaHead,
    sha256: requirementsSha256,
  };
}

/**
 * Verify that the head migration really contains the audited index repairs.
 * `migrationSql` is the raw text of the head migration (e.g. 203).
 */
export function verifySchemaHeadRepairs(
  migrationSql: string,
  requirements: BaselineRequirements,
): void {
  const parsed = parseSql(migrationSql, 'migration');
  if (parsed.droppedTables.length > 0 || parsed.preparedDdl.dropTables.length > 0) {
    fail(
      'schemaHead',
      'the head migration drops schema objects; a convergence repair must be additive only',
    );
  }
  const repairs = new Map<string, ParsedIndex>();
  for (const entry of parsed.preparedDdl.indexes) {
    repairs.set(`${entry.table}.${entry.index.name}`, entry.index);
  }
  for (const alter of parsed.alters) {
    for (const index of alter.addedIndexDefinitions) {
      repairs.set(`${alter.table}.${index.name}`, index);
    }
  }

  for (const repair of requirements.schemaHeadEvidence.repairs) {
    const id = `schemaHeadEvidence:${repair.table}.${repair.index}`;
    const pin = requirements.requiredIndexes.find(
      (candidate) => candidate.table === repair.table && candidate.name === repair.index,
    );
    if (!pin) fail(id, 'repair has no matching requiredIndexes pin');
    const actual = repairs.get(`${repair.table}.${repair.index}`);
    if (!actual) fail(id, 'head migration does not create this index');
    const actualColumns = actual.columns.map((column) => column.name);
    if (!eqList(actualColumns, pin.columns)) {
      fail(id, `head migration columns differ (expected ${pin.columns.join(',')}; got ${actualColumns.join(',')})`);
    }
    if (actual.unique !== pin.unique) {
      fail(id, `head migration uniqueness differs (expected ${pin.unique}; got ${actual.unique})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Manifest build
// ---------------------------------------------------------------------------

export interface Manifest {
  manifestVersion: number;
  generator: string;
  baseline: {
    path: string;
    hashKind: 'content_sha256_lf';
    bytes: number;
    lines: number;
    sha256: string;
  };
  schema: {
    schemaHead: string;
    contentOnly: string[];
    tableCount: number;
    columnCount: number;
    indexCount: number;
    foreignKeyCount: number;
    checkCount: number;
    triggerCount: number;
    dataStatementCount: number;
    alterStatementCount: number;
    dropTableStatementCount: number;
    inventorySha256: string;
    objectSha256: string;
    schemaSha256: string;
    tables: Record<string, ManifestTableRecord>;
    triggers: Record<string, ManifestTriggerRecord>;
    dataStatements: Array<{ kind: string; table: string; sha256: string }>;
  };
  migrations: MigrationIndex;
  requirements: ResolvedRequirements;
  knownGaps: KnownGap[];
}

export interface BuildManifestInput {
  baselineSql: string;
  baselinePath: string;
  requirements: BaselineRequirements;
  requirementsRaw: string;
  migrations: MigrationIndex;
  /** File name -> raw SQL, used to prove content-only / head repairs. */
  migrationContents: Record<string, string>;
}

export interface BuiltManifest {
  manifest: Manifest;
  serialized: string;
}

export function buildManifest(input: BuildManifestInput): BuiltManifest {
  const parsed = parseSql(input.baselineSql, 'baseline');

  const tableNames = parsed.tables.map((t) => t.name);
  const duplicates = tableNames.filter((name, index) => tableNames.indexOf(name) !== index);
  if (duplicates.length > 0) {
    throw new ManifestError(`duplicate table definitions: ${duplicates.join(', ')}`);
  }

  const requirementsSha256 = contentSha256(input.requirementsRaw);
  const resolved = resolveRequirements(
    parsed,
    input.migrations,
    input.requirements,
    requirementsSha256,
    input.migrationContents,
  );

  const tables: Record<string, ManifestTableRecord> = {};
  for (const table of [...parsed.tables].sort((a, b) => compareStrings(a.name, b.name))) {
    const signature = tableSignature(table);
    tables[table.name] = {
      signature,
      objectSha256: sha256Hex(canonicalJson(signature)),
    };
  }

  const triggers: Record<string, ManifestTriggerRecord> = {};
  for (const trigger of [...parsed.triggers].sort((a, b) => compareStrings(a.name, b.name))) {
    const signature = triggerSignature(trigger);
    triggers[trigger.name] = {
      signature,
      objectSha256: sha256Hex(canonicalJson(signature)),
    };
  }

  const objectIndex = [
    ...Object.entries(tables).map(([name, record]) => ({ kind: 'table', name, sha256: record.objectSha256 })),
    ...Object.entries(triggers).map(([name, record]) => ({ kind: 'trigger', name, sha256: record.objectSha256 })),
  ].sort((a, b) => compareStrings(`${a.kind}:${a.name}`, `${b.kind}:${b.name}`));

  const inventory = [
    ...Object.keys(tables).map((name) => `table:${name}`),
    ...Object.keys(triggers).map((name) => `trigger:${name}`),
  ].sort(compareStrings);

  const objectSha256 = sha256Hex(canonicalJson(objectIndex));
  const inventorySha256 = sha256Hex(canonicalJson(inventory));

  const columnCount = parsed.tables.reduce((sum, table) => sum + table.columns.length, 0);
  const indexCount = parsed.tables.reduce((sum, table) => sum + table.indexes.length, 0);
  const foreignKeyCount = parsed.tables.reduce((sum, table) => sum + table.foreignKeys.length, 0);
  const checkCount = parsed.tables.reduce((sum, table) => sum + table.checks.length, 0);

  const schemaSha256 = sha256Hex(
    canonicalJson({
      schemaHead: input.requirements.schemaHead,
      contentOnly: input.requirements.contentOnly,
      objectSha256,
      tableCount: parsed.tables.length,
      columnCount,
      indexCount,
      foreignKeyCount,
      checkCount,
      triggerCount: parsed.triggers.length,
    }),
  );

  const manifest: Manifest = {
    manifestVersion: MANIFEST_VERSION,
    generator: GENERATOR_ID,
    baseline: {
      path: input.baselinePath,
      hashKind: 'content_sha256_lf',
      bytes: Buffer.byteLength(toLf(input.baselineSql), 'utf8'),
      lines: input.baselineSql.split(/\r?\n/).length,
      sha256: contentSha256(input.baselineSql),
    },
    schema: {
      schemaHead: input.requirements.schemaHead,
      contentOnly: [...input.requirements.contentOnly],
      tableCount: parsed.tables.length,
      columnCount,
      indexCount,
      foreignKeyCount,
      checkCount,
      triggerCount: parsed.triggers.length,
      dataStatementCount: parsed.dataStatements.length,
      alterStatementCount: parsed.alters.length,
      dropTableStatementCount: parsed.droppedTables.length,
      inventorySha256,
      objectSha256,
      schemaSha256,
      tables,
      triggers,
      dataStatements: parsed.dataStatements.map((statement) => ({
        kind: statement.kind,
        table: statement.table,
        sha256: sha256Hex(statement.sql),
      })),
    },
    migrations: input.migrations,
    requirements: resolved,
    knownGaps: [...input.requirements.knownGaps].sort((a, b) => compareStrings(a.id, b.id)),
  };

  return {
    manifest,
    serialized: `${JSON.stringify(manifest, null, 2)}\n`,
  };
}

// ---------------------------------------------------------------------------
// Manifest validation / drift check
// ---------------------------------------------------------------------------

export function assertManifestShape(value: unknown): asserts value is Manifest {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ManifestError('manifest must be a JSON object');
  }
  const obj = value as Record<string, unknown>;
  if (obj.manifestVersion !== MANIFEST_VERSION) {
    throw new ManifestError(`manifestVersion must be ${MANIFEST_VERSION}`);
  }
  if (obj.generator !== GENERATOR_ID) {
    throw new ManifestError(`generator must be '${GENERATOR_ID}'`);
  }
  const baseline = obj.baseline as Record<string, unknown> | undefined;
  if (!baseline || typeof baseline !== 'object') throw new ManifestError('manifest.baseline is missing');
  if (typeof baseline.path !== 'string' || baseline.path.length === 0) {
    throw new ManifestError('manifest.baseline.path must be a non-empty string');
  }
  if (baseline.hashKind !== 'content_sha256_lf') {
    throw new ManifestError("manifest.baseline.hashKind must be 'content_sha256_lf'");
  }
  if (typeof baseline.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(baseline.sha256)) {
    throw new ManifestError('manifest.baseline.sha256 must be a 64-char lowercase hex digest');
  }
  const schema = obj.schema as Record<string, unknown> | undefined;
  if (!schema || typeof schema !== 'object') throw new ManifestError('manifest.schema is missing');
  if (typeof schema.schemaHead !== 'string' || !/^\d{3}$/.test(schema.schemaHead)) {
    throw new ManifestError('manifest.schema.schemaHead must be a 3-digit string');
  }
  if (!Array.isArray(schema.contentOnly)) throw new ManifestError('manifest.schema.contentOnly must be an array');
  if (!schema.tables || typeof schema.tables !== 'object' || Array.isArray(schema.tables)) {
    throw new ManifestError('manifest.schema.tables must be an object');
  }
  if (Object.keys(schema.tables as object).length === 0) {
    throw new ManifestError('manifest.schema.tables must not be empty');
  }
  if (!schema.triggers || typeof schema.triggers !== 'object' || Array.isArray(schema.triggers)) {
    throw new ManifestError('manifest.schema.triggers must be an object');
  }
  if (typeof schema.schemaSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(schema.schemaSha256)) {
    throw new ManifestError('manifest.schema.schemaSha256 must be a 64-char lowercase hex digest');
  }
  const migrations = obj.migrations as Record<string, unknown> | undefined;
  if (!migrations || typeof migrations !== 'object') throw new ManifestError('manifest.migrations is missing');
  if (!Array.isArray(migrations.files) || migrations.files.length === 0) {
    throw new ManifestError('manifest.migrations.files must be a non-empty array');
  }
  if (!Array.isArray(migrations.missingPrefixes)) {
    throw new ManifestError('manifest.migrations.missingPrefixes must be an array');
  }
  const requirements = obj.requirements as Record<string, unknown> | undefined;
  if (!requirements || typeof requirements !== 'object') throw new ManifestError('manifest.requirements is missing');
  if (typeof requirements.pinCount !== 'number' || requirements.pinCount <= 0) {
    throw new ManifestError('manifest.requirements.pinCount must be a positive number');
  }
  if (!Array.isArray(obj.knownGaps)) throw new ManifestError('manifest.knownGaps must be an array');
}

export interface DriftDifference {
  path: string;
  expected: string;
  actual: string;
}

/** Compare two manifests by canonical content and return concise differences. */
export function diffManifests(expected: Manifest, actual: Manifest): DriftDifference[] {
  const differences: DriftDifference[] = [];
  const check = (path: string, a: unknown, b: unknown): void => {
    const ca = canonicalJson(a);
    const cb = canonicalJson(b);
    if (ca !== cb) differences.push({ path, expected: ca, actual: cb });
  };
  check('baseline.sha256', expected.baseline.sha256, actual.baseline.sha256);
  check('baseline.bytes', expected.baseline.bytes, actual.baseline.bytes);
  check('schema.schemaHead', expected.schema.schemaHead, actual.schema.schemaHead);
  check('schema.contentOnly', expected.schema.contentOnly, actual.schema.contentOnly);
  check('schema.inventorySha256', expected.schema.inventorySha256, actual.schema.inventorySha256);
  check('schema.objectSha256', expected.schema.objectSha256, actual.schema.objectSha256);
  check('schema.schemaSha256', expected.schema.schemaSha256, actual.schema.schemaSha256);
  check('schema.tableCount', expected.schema.tableCount, actual.schema.tableCount);
  check('migrations.sha256', expected.migrations.sha256, actual.migrations.sha256);
  check('migrations.duplicatePrefixes', expected.migrations.duplicatePrefixes, actual.migrations.duplicatePrefixes);
  check('migrations.missingPrefixes', expected.migrations.missingPrefixes, actual.migrations.missingPrefixes);
  check('requirements.sha256', expected.requirements.sha256, actual.requirements.sha256);
  check('knownGaps', expected.knownGaps, actual.knownGaps);

  const expectedTables = expected.schema.tables;
  const actualTables = actual.schema.tables;
  for (const name of Object.keys(expectedTables).sort(compareStrings)) {
    if (!actualTables[name]) {
      differences.push({ path: `schema.tables.${name}`, expected: 'present', actual: 'missing' });
      continue;
    }
    if (expectedTables[name].objectSha256 !== actualTables[name].objectSha256) {
      differences.push({
        path: `schema.tables.${name}.objectSha256`,
        expected: expectedTables[name].objectSha256,
        actual: actualTables[name].objectSha256,
      });
    }
  }
  for (const name of Object.keys(actualTables).sort(compareStrings)) {
    if (!expectedTables[name]) {
      differences.push({ path: `schema.tables.${name}`, expected: 'missing', actual: 'present' });
    }
  }

  const expectedTriggers = expected.schema.triggers;
  const actualTriggers = actual.schema.triggers;
  for (const name of Object.keys(expectedTriggers).sort(compareStrings)) {
    if (!actualTriggers[name]) {
      differences.push({ path: `schema.triggers.${name}`, expected: 'present', actual: 'missing' });
      continue;
    }
    if (expectedTriggers[name].objectSha256 !== actualTriggers[name].objectSha256) {
      differences.push({
        path: `schema.triggers.${name}.objectSha256`,
        expected: expectedTriggers[name].objectSha256,
        actual: actualTriggers[name].objectSha256,
      });
    }
  }
  for (const name of Object.keys(actualTriggers).sort(compareStrings)) {
    if (!expectedTriggers[name]) {
      differences.push({ path: `schema.triggers.${name}`, expected: 'missing', actual: 'present' });
    }
  }

  return differences;
}

/** Parse a committed manifest, fail closed on malformed JSON/shape. */
export function parseManifest(raw: string): Manifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ManifestError(`manifest is not valid JSON: ${(err as Error).message}`);
  }
  assertManifestShape(parsed);
  return parsed;
}
