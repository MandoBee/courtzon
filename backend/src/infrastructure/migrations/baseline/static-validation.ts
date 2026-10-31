// ============================================================================
// CourtZon — Static baseline-manifest integrity verifier (V1).
//
// Pure, database-free validation of the committed baseline artefact set:
//   * 001_courtzon_v3.manifest.json (deep structure, hashes, counts)
//   * baseline-requirements.json     (hash + Tier A pin resolution)
//   * database/baseline/001_courtzon_v3.sql (LF hash, bytes, lines, parse)
//   * database/migrations/*.sql      (hashes, classifications, prefixes)
//
// This module never imports fs, mysql2, the app pool, the migration runner or
// the entrypoint. The CLI is the only I/O boundary. No function here may be
// used to authorize migration stamping; it is an integrity gate only.
// ============================================================================

import {
  buildManifest,
  buildMigrationIndex,
  canonicalJson,
  contentSha256,
  diffManifests,
  parseManifest,
  parseRequirements,
  resolveRequirements,
  sha256Hex,
  toLf,
  type BaselineRequirements,
  type Manifest,
  type MigrationIndex,
  type MigrationInputFile,
} from './baseline-manifest.js';
import { hasSchemaDdl, parseSql } from './parse-baseline.js';

export type StaticValidationCode =
  | 'MANIFEST_JSON_INVALID'
  | 'MANIFEST_SHAPE_INVALID'
  | 'MANIFEST_NESTED_INVALID'
  | 'MANIFEST_STALE'
  | 'BASELINE_PATH_MISMATCH'
  | 'BASELINE_HASH_KIND_MISMATCH'
  | 'BASELINE_HASH_MISMATCH'
  | 'BASELINE_BYTES_MISMATCH'
  | 'BASELINE_LINES_MISMATCH'
  | 'BASELINE_PARSE_FAILED'
  | 'REQUIREMENTS_SHAPE_INVALID'
  | 'REQUIREMENTS_HASH_MISMATCH'
  | 'REQUIREMENTS_PIN_MISMATCH'
  | 'RESOLVED_REQUIREMENTS_MISMATCH'
  | 'SCHEMA_HEAD_MISMATCH'
  | 'SCHEMA_HEAD_EVIDENCE_MISMATCH'
  | 'CONTENT_ONLY_MISMATCH'
  | 'COUNT_MISMATCH'
  | 'OBJECT_HASH_MISMATCH'
  | 'INVENTORY_HASH_MISMATCH'
  | 'SCHEMA_HASH_MISMATCH'
  | 'DATA_STATEMENTS_MISMATCH'
  | 'MIGRATIONS_INDEX_MISMATCH'
  | 'MIGRATIONS_HASH_MISMATCH'
  | 'MIGRATION_FILE_SET_MISMATCH'
  | 'MIGRATION_FILE_HASH_MISMATCH'
  | 'MIGRATION_CLASSIFICATION_MISMATCH'
  | 'MIGRATION_DUPLICATE_PREFIX_MISMATCH'
  | 'MIGRATION_MISSING_PREFIX_MISMATCH'
  | 'MANIFEST_REBUILD_FAILED'
  | 'INTERNAL_ERROR';

export interface StaticFinding {
  code: StaticValidationCode;
  path: string;
  message: string;
  expected: string | number | boolean | null;
  actual: string | number | boolean | null;
}

export interface StaticValidationInput {
  /** Raw baseline SQL. */
  baselineSql: string;
  /** POSIX-style label recorded in the manifest, e.g. database/baseline/001_courtzon_v3.sql. */
  baselinePath: string;
  /** Raw committed manifest JSON. */
  manifestRaw: string;
  /** Raw baseline-requirements.json. */
  requirementsRaw: string;
  /** Every database/migrations/*.sql file, in any order. */
  migrationFiles: MigrationInputFile[];
}

export interface StaticValidationSummary {
  baselineSha256: string;
  schemaHead: string;
  tableCount: number;
  triggerCount: number;
  pinCount: number;
  migrationCount: number;
  objectCount: number;
  findings: number;
}

export interface StaticValidationReport {
  ok: boolean;
  findings: StaticFinding[];
  summary: StaticValidationSummary;
  hashes: {
    baseline: string | null;
    requirements: string;
    inventory: string | null;
    object: string | null;
    schema: string | null;
    migrations: string | null;
  };
}

const HEX64 = /^[0-9a-f]{64}$/;
const MIGRATION_HASH_KIND = 'content_sha256_lf';
const BASELINE_HASH_KIND = 'content_sha256_lf';

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isPositiveIntegerOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function display(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return canonicalJson(value);
}

function add(
  findings: StaticFinding[],
  code: StaticValidationCode,
  path: string,
  message: string,
  expected: unknown = null,
  actual: unknown = null,
): void {
  const finalPath = path;
  const prefix = `${code}|${finalPath}|${message}`;
  if (findings.some((finding) => `${finding.code}|${finding.path}|${finding.message}` === prefix)) return;
  findings.push({
    code,
    path: finalPath,
    message,
    expected: display(expected),
    actual: display(actual),
  });
}

function compare(
  findings: StaticFinding[],
  code: StaticValidationCode,
  path: string,
  expected: unknown,
  actual: unknown,
  message: string,
): void {
  if (canonicalJson(expected) !== canonicalJson(actual)) {
    add(findings, code, path, message, expected, actual);
  }
}

function objectSha(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

// ---------------------------------------------------------------------------
// Deep manifest validation
// ---------------------------------------------------------------------------

function validateColumns(tableName: string, columns: unknown, findings: StaticFinding[]): number {
  const basePath = `schema.tables.${tableName}.signature.columns`;
  if (!Array.isArray(columns)) {
    add(findings, 'MANIFEST_NESTED_INVALID', basePath, 'columns must be an array', 'array', columns);
    return 0;
  }
  const seen = new Set<string>();
  columns.forEach((column, index) => {
    const path = `${basePath}[${index}]`;
    if (!isRecord(column)) {
      add(findings, 'MANIFEST_NESTED_INVALID', path, 'column must be an object', 'object', column);
      return;
    }
    if (!isNonEmptyString(column.name)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.name`, 'column name must be a non-empty string', 'non-empty string', column.name);
    } else if (seen.has(column.name)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.name`, `duplicate column '${column.name}'`, 'unique', column.name);
    } else {
      seen.add(column.name);
    }
    if (!isNonEmptyString(column.type)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.type`, 'column type must be a non-empty string', 'non-empty string', column.type);
    }
    if (typeof column.nullable !== 'boolean') {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.nullable`, 'nullable must be boolean', 'boolean', column.nullable);
    }
    if (!(column.default === null || isString(column.default))) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.default`, 'default must be a string or null', 'string|null', column.default);
    }
    if (typeof column.autoIncrement !== 'boolean') {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.autoIncrement`, 'autoIncrement must be boolean', 'boolean', column.autoIncrement);
    }
    if (!(column.generated === null || isString(column.generated))) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.generated`, 'generated must be a string or null', 'string|null', column.generated);
    }
    if (!(column.generatedStorage === null || column.generatedStorage === 'VIRTUAL' || column.generatedStorage === 'STORED')) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.generatedStorage`, 'generatedStorage must be VIRTUAL, STORED or null', 'VIRTUAL|STORED|null', column.generatedStorage);
    }
    if (!(column.onUpdate === null || isString(column.onUpdate))) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.onUpdate`, 'onUpdate must be a string or null', 'string|null', column.onUpdate);
    }
    for (const field of ['characterSet', 'collation'] as const) {
      if (!(column[field] === null || isString(column[field]))) {
        add(findings, 'MANIFEST_NESTED_INVALID', `${path}.${field}`, `${field} must be a string or null`, 'string|null', column[field]);
      }
    }
  });
  return columns.length;
}

function validateIndexes(tableName: string, indexes: unknown, findings: StaticFinding[]): number {
  const basePath = `schema.tables.${tableName}.signature.indexes`;
  if (!Array.isArray(indexes)) {
    add(findings, 'MANIFEST_NESTED_INVALID', basePath, 'indexes must be an array', 'array', indexes);
    return 0;
  }
  const seen = new Set<string>();
  indexes.forEach((index, position) => {
    const path = `${basePath}[${position}]`;
    if (!isRecord(index)) {
      add(findings, 'MANIFEST_NESTED_INVALID', path, 'index must be an object', 'object', index);
      return;
    }
    if (!isNonEmptyString(index.name)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.name`, 'index name must be a non-empty string', 'non-empty string', index.name);
    } else if (seen.has(index.name)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.name`, `duplicate index '${index.name}'`, 'unique', index.name);
    } else {
      seen.add(index.name);
    }
    if (!['PRIMARY', 'UNIQUE', 'KEY', 'FULLTEXT'].includes(String(index.kind))) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.kind`, 'index kind is invalid', 'PRIMARY|UNIQUE|KEY|FULLTEXT', index.kind);
    }
    if (typeof index.unique !== 'boolean') {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.unique`, 'index unique must be boolean', 'boolean', index.unique);
    }
    if (!Array.isArray(index.columns) || index.columns.length === 0) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.columns`, 'index columns must be a non-empty array', 'non-empty array', index.columns);
      return;
    }
    index.columns.forEach((column, columnIndex) => {
      const columnPath = `${path}.columns[${columnIndex}]`;
      if (!isRecord(column)) {
        add(findings, 'MANIFEST_NESTED_INVALID', columnPath, 'index column must be an object', 'object', column);
        return;
      }
      if (!isNonEmptyString(column.name)) {
        add(findings, 'MANIFEST_NESTED_INVALID', `${columnPath}.name`, 'index column name must be a non-empty string', 'non-empty string', column.name);
      }
      if (typeof column.desc !== 'boolean') {
        add(findings, 'MANIFEST_NESTED_INVALID', `${columnPath}.desc`, 'index column desc must be boolean', 'boolean', column.desc);
      }
      if (!isPositiveIntegerOrNull(column.prefixLength)) {
        add(findings, 'MANIFEST_NESTED_INVALID', `${columnPath}.prefixLength`, 'prefixLength must be a positive integer or null', 'positive integer|null', column.prefixLength);
      }
    });
  });
  return indexes.length;
}

function validateForeignKeys(tableName: string, foreignKeys: unknown, findings: StaticFinding[]): number {
  const basePath = `schema.tables.${tableName}.signature.foreignKeys`;
  if (!Array.isArray(foreignKeys)) {
    add(findings, 'MANIFEST_NESTED_INVALID', basePath, 'foreignKeys must be an array', 'array', foreignKeys);
    return 0;
  }
  const seen = new Set<string>();
  foreignKeys.forEach((foreignKey, index) => {
    const path = `${basePath}[${index}]`;
    if (!isRecord(foreignKey)) {
      add(findings, 'MANIFEST_NESTED_INVALID', path, 'foreign key must be an object', 'object', foreignKey);
      return;
    }
    if (!isNonEmptyString(foreignKey.name)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.name`, 'foreign key name must be a non-empty string', 'non-empty string', foreignKey.name);
    } else if (seen.has(foreignKey.name)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.name`, `duplicate foreign key '${foreignKey.name}'`, 'unique', foreignKey.name);
    } else {
      seen.add(foreignKey.name);
    }
    for (const field of ['columns', 'referencedColumns'] as const) {
      if (!isStringArray(foreignKey[field]) || (foreignKey[field] as string[]).length === 0) {
        add(findings, 'MANIFEST_NESTED_INVALID', `${path}.${field}`, `${field} must be a non-empty string array`, 'non-empty string[]', foreignKey[field]);
      }
    }
    if (!isNonEmptyString(foreignKey.referencedTable)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.referencedTable`, 'referencedTable must be a non-empty string', 'non-empty string', foreignKey.referencedTable);
    }
    for (const field of ['onDelete', 'onUpdate'] as const) {
      if (!(foreignKey[field] === null || isString(foreignKey[field]))) {
        add(findings, 'MANIFEST_NESTED_INVALID', `${path}.${field}`, `${field} must be a string or null`, 'string|null', foreignKey[field]);
      }
    }
  });
  return foreignKeys.length;
}

function validateChecks(tableName: string, checks: unknown, findings: StaticFinding[]): number {
  const basePath = `schema.tables.${tableName}.signature.checks`;
  if (!Array.isArray(checks)) {
    add(findings, 'MANIFEST_NESTED_INVALID', basePath, 'checks must be an array', 'array', checks);
    return 0;
  }
  checks.forEach((check, index) => {
    const path = `${basePath}[${index}]`;
    if (!isRecord(check)) {
      add(findings, 'MANIFEST_NESTED_INVALID', path, 'check must be an object', 'object', check);
      return;
    }
    if (!(check.name === null || isString(check.name))) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.name`, 'check name must be a string or null', 'string|null', check.name);
    }
    if (!isNonEmptyString(check.expression)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.expression`, 'check expression must be a non-empty string', 'non-empty string', check.expression);
    }
  });
  return checks.length;
}

function validateTriggers(manifest: Manifest, findings: StaticFinding[]): number {
  const triggers = manifest.schema.triggers;
  let count = 0;
  for (const [name, record] of Object.entries(triggers)) {
    count += 1;
    const path = `schema.triggers.${name}`;
    if (!isRecord(record)) {
      add(findings, 'MANIFEST_NESTED_INVALID', path, 'trigger record must be an object', 'object', record);
      continue;
    }
    const signature = record.signature;
    if (!isRecord(signature)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.signature`, 'trigger signature must be an object', 'object', signature);
      continue;
    }
    if (signature.name !== name) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.signature.name`, 'trigger signature name must match its key', name, signature.name);
    }
    for (const field of ['table', 'body'] as const) {
      if (!isNonEmptyString(signature[field])) {
        add(findings, 'MANIFEST_NESTED_INVALID', `${path}.signature.${field}`, `${field} must be a non-empty string`, 'non-empty string', signature[field]);
      }
    }
    if (signature.timing !== 'BEFORE' && signature.timing !== 'AFTER') {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.signature.timing`, 'trigger timing must be BEFORE or AFTER', 'BEFORE|AFTER', signature.timing);
    }
    if (!['INSERT', 'UPDATE', 'DELETE'].includes(String(signature.event))) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.signature.event`, 'trigger event is invalid', 'INSERT|UPDATE|DELETE', signature.event);
    }
    if (!isString(record.objectSha256) || !HEX64.test(record.objectSha256)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.objectSha256`, 'trigger objectSha256 must be a 64-char lowercase hex digest', '64-char hex', record.objectSha256);
    } else {
      const computed = objectSha(signature);
      if (computed !== record.objectSha256) {
        add(findings, 'OBJECT_HASH_MISMATCH', `${path}.objectSha256`, 'trigger objectSha256 does not match its signature', record.objectSha256, computed);
      }
    }
  }
  return count;
}

function validateMigrationsDeep(manifest: Manifest, findings: StaticFinding[]): void {
  const migrations = manifest.migrations;
  for (const field of ['directory', 'hashKind'] as const) {
    if (!isNonEmptyString(migrations[field])) {
      add(findings, 'MANIFEST_NESTED_INVALID', `migrations.${field}`, `${field} must be a non-empty string`, 'non-empty string', migrations[field]);
    }
  }
  for (const field of ['count', 'distinctPrefixes'] as const) {
    if (typeof migrations[field] !== 'number' || !Number.isInteger(migrations[field])) {
      add(findings, 'MANIFEST_NESTED_INVALID', `migrations.${field}`, `${field} must be an integer`, 'integer', migrations[field]);
    }
  }
  if (!isString(migrations.sha256) || !HEX64.test(migrations.sha256)) {
    add(findings, 'MANIFEST_NESTED_INVALID', 'migrations.sha256', 'migrations.sha256 must be a 64-char lowercase hex digest', '64-char hex', migrations.sha256);
  }
  for (const field of ['duplicatePrefixes', 'missingPrefixes'] as const) {
    if (!Array.isArray(migrations[field])) {
      add(findings, 'MANIFEST_NESTED_INVALID', `migrations.${field}`, `${field} must be an array`, 'array', migrations[field]);
    }
  }
  if (!isRecord(migrations.classifications)) {
    add(findings, 'MANIFEST_NESTED_INVALID', 'migrations.classifications', 'classifications must be an object', 'object', migrations.classifications);
  }
  if (!Array.isArray(migrations.files)) {
    add(findings, 'MANIFEST_NESTED_INVALID', 'migrations.files', 'files must be an array', 'array', migrations.files);
    return;
  }
  const seen = new Set<string>();
  migrations.files.forEach((file, index) => {
    const path = `migrations.files[${index}]`;
    if (!isRecord(file)) {
      add(findings, 'MANIFEST_NESTED_INVALID', path, 'migration record must be an object', 'object', file);
      return;
    }
    if (!isNonEmptyString(file.file)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.file`, 'file must be a non-empty string', 'non-empty string', file.file);
    } else if (seen.has(file.file)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.file`, `duplicate migration file '${file.file}'`, 'unique', file.file);
    } else {
      seen.add(file.file);
    }
    if (!isString(file.prefix) || !/^\d{3}$/.test(file.prefix)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.prefix`, 'prefix must be a 3-digit string', '3-digit string', file.prefix);
    }
    if (!isString(file.sha256) || !HEX64.test(file.sha256)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.sha256`, 'sha256 must be a 64-char lowercase hex digest', '64-char hex', file.sha256);
    }
    if (!['PRODUCTION_SAFE', 'LOCAL_DOCKER_ONLY', 'INVALID'].includes(String(file.classification))) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.classification`, 'classification is invalid', 'PRODUCTION_SAFE|LOCAL_DOCKER_ONLY|INVALID', file.classification);
    }
    if (!(file.marker === null || isString(file.marker))) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.marker`, 'marker must be a string or null', 'string|null', file.marker);
    }
  });
}

function validateManifestDeep(
  manifest: Manifest,
  requirements: BaselineRequirements | undefined,
  findings: StaticFinding[],
): void {
  const tables = manifest.schema.tables;
  const tableNames = Object.keys(tables);
  let columnCount = 0;
  let indexCount = 0;
  let foreignKeyCount = 0;
  let checkCount = 0;

  for (const [name, record] of Object.entries(tables)) {
    const path = `schema.tables.${name}`;
    if (!isRecord(record)) {
      add(findings, 'MANIFEST_NESTED_INVALID', path, 'table record must be an object', 'object', record);
      continue;
    }
    const signature = record.signature;
    if (!isRecord(signature)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.signature`, 'table signature must be an object', 'object', signature);
      continue;
    }
    if (signature.name !== name) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.signature.name`, 'table signature name must match its key', name, signature.name);
    }
    for (const field of ['engine', 'characterSet', 'collation'] as const) {
      if (!(signature[field] === null || isString(signature[field]))) {
        add(findings, 'MANIFEST_NESTED_INVALID', `${path}.signature.${field}`, `${field} must be a string or null`, 'string|null', signature[field]);
      }
    }
    columnCount += validateColumns(name, signature.columns, findings);
    indexCount += validateIndexes(name, signature.indexes, findings);
    foreignKeyCount += validateForeignKeys(name, signature.foreignKeys, findings);
    checkCount += validateChecks(name, signature.checks, findings);

    if (!isString(record.objectSha256) || !HEX64.test(record.objectSha256)) {
      add(findings, 'MANIFEST_NESTED_INVALID', `${path}.objectSha256`, 'table objectSha256 must be a 64-char lowercase hex digest', '64-char hex', record.objectSha256);
    } else {
      const computed = objectSha(signature);
      if (computed !== record.objectSha256) {
        add(findings, 'OBJECT_HASH_MISMATCH', `${path}.objectSha256`, 'table objectSha256 does not match its signature', record.objectSha256, computed);
      }
    }
  }

  const triggerCount = validateTriggers(manifest, findings);
  validateMigrationsDeep(manifest, findings);

  const dataStatements = Array.isArray(manifest.schema.dataStatements) ? manifest.schema.dataStatements : [];
  compare(findings, 'COUNT_MISMATCH', 'schema.tableCount', manifest.schema.tableCount, tableNames.length, 'tableCount does not match schema.tables');
  compare(findings, 'COUNT_MISMATCH', 'schema.columnCount', manifest.schema.columnCount, columnCount, 'columnCount does not match the summed signatures');
  compare(findings, 'COUNT_MISMATCH', 'schema.indexCount', manifest.schema.indexCount, indexCount, 'indexCount does not match the summed signatures');
  compare(findings, 'COUNT_MISMATCH', 'schema.foreignKeyCount', manifest.schema.foreignKeyCount, foreignKeyCount, 'foreignKeyCount does not match the summed signatures');
  compare(findings, 'COUNT_MISMATCH', 'schema.checkCount', manifest.schema.checkCount, checkCount, 'checkCount does not match the summed signatures');
  compare(findings, 'COUNT_MISMATCH', 'schema.triggerCount', manifest.schema.triggerCount, triggerCount, 'triggerCount does not match schema.triggers');
  compare(findings, 'COUNT_MISMATCH', 'schema.dataStatementCount', manifest.schema.dataStatementCount, dataStatements.length, 'dataStatementCount does not match dataStatements');
  if (!Array.isArray(manifest.schema.dataStatements)) {
    add(findings, 'MANIFEST_NESTED_INVALID', 'schema.dataStatements', 'dataStatements must be an array', 'array', manifest.schema.dataStatements);
  } else {
    manifest.schema.dataStatements.forEach((statement, index) => {
      if (!isRecord(statement) || !isNonEmptyString(statement.kind) || !isNonEmptyString(statement.table) || !isString(statement.sha256)) {
        add(findings, 'MANIFEST_NESTED_INVALID', `schema.dataStatements[${index}]`, 'data statement must have kind, table and sha256', 'object', statement);
      }
    });
  }

  const tableHashes = Object.entries(tables).map(([name, record]) => ({
    kind: 'table',
    name,
    sha256: objectSha(isRecord(record) ? record.signature : null),
  }));
  const triggerHashes = Object.entries(manifest.schema.triggers).map(([name, record]) => ({
    kind: 'trigger',
    name,
    sha256: objectSha(isRecord(record) ? record.signature : null),
  }));
  const objectIndex = [...tableHashes, ...triggerHashes].sort((a, b) => compareStrings(`${a.kind}:${a.name}`, `${b.kind}:${b.name}`));
  const inventory = [...tableNames.map((name) => `table:${name}`), ...Object.keys(manifest.schema.triggers).map((name) => `trigger:${name}`)].sort(compareStrings);
  const computedObjectSha = sha256Hex(canonicalJson(objectIndex));
  const computedInventorySha = sha256Hex(canonicalJson(inventory));
  const computedSchemaSha = sha256Hex(
    canonicalJson({
      schemaHead: manifest.schema.schemaHead,
      contentOnly: manifest.schema.contentOnly,
      objectSha256: computedObjectSha,
      tableCount: tableNames.length,
      columnCount,
      indexCount,
      foreignKeyCount,
      checkCount,
      triggerCount,
    }),
  );

  compare(findings, 'INVENTORY_HASH_MISMATCH', 'schema.inventorySha256', manifest.schema.inventorySha256, computedInventorySha, 'inventorySha256 does not match the object inventory');
  compare(findings, 'OBJECT_HASH_MISMATCH', 'schema.objectSha256', manifest.schema.objectSha256, computedObjectSha, 'schema.objectSha256 does not match the recomputed object map');
  compare(findings, 'SCHEMA_HASH_MISMATCH', 'schema.schemaSha256', manifest.schema.schemaSha256, computedSchemaSha, 'schemaSha256 does not match the recomputed schema commitment');

  if (requirements) {
    compare(findings, 'SCHEMA_HEAD_MISMATCH', 'schema.schemaHead', manifest.schema.schemaHead, requirements.schemaHead, 'manifest schemaHead differs from requirements');
    compare(findings, 'CONTENT_ONLY_MISMATCH', 'schema.contentOnly', manifest.schema.contentOnly, requirements.contentOnly, 'manifest contentOnly differs from requirements');

    const pins = {
      tables: requirements.requiredTables.map((pin) => pin.name),
      columns: requirements.requiredColumns.map((pin) => `${pin.table}.${pin.column}`),
      indexes: requirements.requiredIndexes.map((pin) => `${pin.table}.${pin.name}`),
      foreignKeys: requirements.requiredForeignKeys.map((pin) => `${pin.table}.${pin.name}`),
      triggers: requirements.requiredTriggers.map((pin) => pin.name),
    };
    compare(findings, 'RESOLVED_REQUIREMENTS_MISMATCH', 'requirements.version', manifest.requirements.version, requirements.version, 'resolved requirement version differs');
    compare(findings, 'RESOLVED_REQUIREMENTS_MISMATCH', 'requirements.tables', manifest.requirements.tables, pins.tables, 'resolved table pins differ');
    compare(findings, 'RESOLVED_REQUIREMENTS_MISMATCH', 'requirements.columns', manifest.requirements.columns, pins.columns, 'resolved column pins differ');
    compare(findings, 'RESOLVED_REQUIREMENTS_MISMATCH', 'requirements.indexes', manifest.requirements.indexes, pins.indexes, 'resolved index pins differ');
    compare(findings, 'RESOLVED_REQUIREMENTS_MISMATCH', 'requirements.foreignKeys', manifest.requirements.foreignKeys, pins.foreignKeys, 'resolved FK pins differ');
    compare(findings, 'RESOLVED_REQUIREMENTS_MISMATCH', 'requirements.triggers', manifest.requirements.triggers, pins.triggers, 'resolved trigger pins differ');
    compare(
      findings,
      'RESOLVED_REQUIREMENTS_MISMATCH',
      'requirements.pinCount',
      manifest.requirements.pinCount,
      requirements.requiredTables.length + requirements.requiredColumns.length + requirements.requiredIndexes.length + requirements.requiredForeignKeys.length + requirements.requiredTriggers.length,
      'resolved pinCount differs',
    );
    compare(findings, 'SCHEMA_HEAD_MISMATCH', 'requirements.schemaHead', manifest.requirements.schemaHead, requirements.schemaHead, 'resolved schemaHead differs');
    compare(findings, 'CONTENT_ONLY_MISMATCH', 'requirements.contentOnly', manifest.requirements.contentOnly, requirements.contentOnly, 'resolved contentOnly differs');
  }
}

// ---------------------------------------------------------------------------
// Baseline and requirements
// ---------------------------------------------------------------------------

function validateBaseline(manifest: Manifest, input: StaticValidationInput, findings: StaticFinding[]): void {
  if (manifest.baseline.path !== input.baselinePath) {
    add(findings, 'BASELINE_PATH_MISMATCH', 'baseline.path', 'manifest baseline.path differs from the verified baseline label', input.baselinePath, manifest.baseline.path);
  }
  if (manifest.baseline.hashKind !== BASELINE_HASH_KIND) {
    add(findings, 'BASELINE_HASH_KIND_MISMATCH', 'baseline.hashKind', 'baseline hashKind must be content_sha256_lf', BASELINE_HASH_KIND, manifest.baseline.hashKind);
  }
  compare(findings, 'BASELINE_HASH_MISMATCH', 'baseline.sha256', manifest.baseline.sha256, contentSha256(input.baselineSql), 'baseline LF content hash differs');
  compare(findings, 'BASELINE_BYTES_MISMATCH', 'baseline.bytes', manifest.baseline.bytes, Buffer.byteLength(toLf(input.baselineSql), 'utf8'), 'baseline LF byte length differs');
  compare(findings, 'BASELINE_LINES_MISMATCH', 'baseline.lines', manifest.baseline.lines, input.baselineSql.split(/\r?\n/).length, 'baseline line count differs');
}

function validateMigrationIndex(manifest: Manifest, live: MigrationIndex, findings: StaticFinding[]): void {
  const expected = manifest.migrations;
  compare(findings, 'MIGRATIONS_INDEX_MISMATCH', 'migrations.directory', expected.directory, live.directory, 'migration directory differs');
  compare(findings, 'MIGRATIONS_INDEX_MISMATCH', 'migrations.hashKind', expected.hashKind, live.hashKind, 'migration hash kind differs');
  compare(findings, 'MIGRATIONS_INDEX_MISMATCH', 'migrations.count', expected.count, live.count, 'migration count differs');
  compare(findings, 'MIGRATIONS_INDEX_MISMATCH', 'migrations.distinctPrefixes', expected.distinctPrefixes, live.distinctPrefixes, 'distinct migration prefix count differs');
  compare(findings, 'MIGRATION_DUPLICATE_PREFIX_MISMATCH', 'migrations.duplicatePrefixes', expected.duplicatePrefixes, live.duplicatePrefixes, 'duplicate migration prefixes differ');
  compare(findings, 'MIGRATION_MISSING_PREFIX_MISMATCH', 'migrations.missingPrefixes', expected.missingPrefixes, live.missingPrefixes, 'missing migration prefixes differ');
  compare(findings, 'MIGRATIONS_INDEX_MISMATCH', 'migrations.classifications', expected.classifications, live.classifications, 'migration classification counts differ');
  compare(findings, 'MIGRATIONS_HASH_MISMATCH', 'migrations.sha256', expected.sha256, live.sha256, 'migration index hash differs');

  const expectedFiles = new Map<string, (typeof expected.files)[number]>();
  for (const file of Array.isArray(expected.files) ? expected.files : []) {
    if (isRecord(file) && isString(file.file)) expectedFiles.set(file.file, file as (typeof expected.files)[number]);
  }
  const liveFiles = new Map(live.files.map((file) => [file.file, file]));
  for (const name of [...expectedFiles.keys()].sort(compareStrings)) {
    const expectedFile = expectedFiles.get(name);
    const liveFile = liveFiles.get(name);
    if (!expectedFile || !liveFile) {
      add(findings, 'MIGRATION_FILE_SET_MISMATCH', `migrations.files.${name}`, 'migration file is missing from the rebuilt inventory', 'present', 'missing');
      continue;
    }
    if (expectedFile.prefix !== liveFile.prefix) {
      add(findings, 'MIGRATIONS_INDEX_MISMATCH', `migrations.files.${name}.prefix`, 'migration prefix differs', expectedFile.prefix, liveFile.prefix);
    }
    if (expectedFile.sha256 !== liveFile.sha256) {
      add(findings, 'MIGRATION_FILE_HASH_MISMATCH', `migrations.files.${name}.sha256`, 'migration file content hash differs', expectedFile.sha256, liveFile.sha256);
    }
    if (expectedFile.classification !== liveFile.classification) {
      add(findings, 'MIGRATION_CLASSIFICATION_MISMATCH', `migrations.files.${name}.classification`, 'migration classification differs', expectedFile.classification, liveFile.classification);
    }
    if (expectedFile.marker !== liveFile.marker) {
      add(findings, 'MIGRATIONS_INDEX_MISMATCH', `migrations.files.${name}.marker`, 'migration marker differs', expectedFile.marker, liveFile.marker);
    }
  }
  for (const name of [...liveFiles.keys()].sort(compareStrings)) {
    if (!expectedFiles.has(name)) {
      add(findings, 'MIGRATION_FILE_SET_MISMATCH', `migrations.files.${name}`, 'migration file is present on disk but absent from the manifest', 'missing', 'present');
    }
  }
}

function validateMigrationSchemaHead(
  manifest: Manifest,
  requirements: BaselineRequirements,
  live: MigrationIndex,
  contents: Record<string, string>,
  findings: StaticFinding[],
): void {
  const prefixes = live.files.map((file) => Number(file.prefix));
  if (prefixes.length === 0) {
    add(findings, 'SCHEMA_HEAD_MISMATCH', 'schema.schemaHead', 'no migration files were found', 'non-empty migration set', 0);
    return;
  }
  const computedHead = String(Math.max(...prefixes)).padStart(3, '0');
  compare(findings, 'SCHEMA_HEAD_MISMATCH', 'schema.schemaHead', manifest.schema.schemaHead, computedHead, 'schemaHead does not match the highest migration prefix');
  compare(findings, 'SCHEMA_HEAD_MISMATCH', 'requirements.schemaHead', requirements.schemaHead, computedHead, 'requirements schemaHead does not match the highest migration prefix');

  const headFile = live.files.find((file) => file.prefix === requirements.schemaHead);
  if (!headFile) {
    add(findings, 'SCHEMA_HEAD_MISMATCH', 'requirements.schemaHead', 'no migration file carries the schemaHead prefix', requirements.schemaHead, 'missing');
  } else if (headFile.classification !== 'PRODUCTION_SAFE') {
    add(findings, 'MIGRATION_CLASSIFICATION_MISMATCH', `migrations.files.${headFile.file}.classification`, 'schemaHead migration must be PRODUCTION_SAFE', 'PRODUCTION_SAFE', headFile.classification);
  }

  for (const prefix of requirements.contentOnly) {
    const file = live.files.find((candidate) => candidate.prefix === prefix);
    if (!file) {
      add(findings, 'CONTENT_ONLY_MISMATCH', `requirements.contentOnly.${prefix}`, 'content-only migration prefix has no file', 'present', 'missing');
      continue;
    }
    if (file.classification !== 'PRODUCTION_SAFE') {
      add(findings, 'MIGRATION_CLASSIFICATION_MISMATCH', `migrations.files.${file.file}.classification`, 'content-only migration must be PRODUCTION_SAFE', 'PRODUCTION_SAFE', file.classification);
    }
    const sql = contents[file.file];
    if (sql === undefined) {
      add(findings, 'CONTENT_ONLY_MISMATCH', `requirements.contentOnly.${prefix}`, 'content-only migration content is missing', 'present', 'missing');
    } else {
      try {
        if (hasSchemaDdl(sql)) {
          add(findings, 'CONTENT_ONLY_MISMATCH', `requirements.contentOnly.${prefix}`, 'content-only migration contains schema DDL', 'no schema DDL', 'schema DDL');
        }
      } catch (error) {
        add(
          findings,
          'CONTENT_ONLY_MISMATCH',
          `requirements.contentOnly.${prefix}`,
          'content-only migration could not be parsed',
          'parseable SQL',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main validation
// ---------------------------------------------------------------------------

export function validateStaticManifest(input: StaticValidationInput): StaticValidationReport {
  const findings: StaticFinding[] = [];
  const requirementsSha = contentSha256(input.requirementsRaw);
  let manifest: Manifest | undefined;
  let requirements: BaselineRequirements | undefined;

  try {
    JSON.parse(input.manifestRaw);
  } catch (error) {
    add(findings, 'MANIFEST_JSON_INVALID', 'manifest', 'manifest is not valid JSON', 'valid JSON', error instanceof Error ? error.message : String(error));
    return buildReport(findings, undefined, requirementsSha);
  }

  try {
    manifest = parseManifest(input.manifestRaw);
  } catch (error) {
    add(findings, 'MANIFEST_SHAPE_INVALID', 'manifest', 'manifest failed the existing shape validation', 'valid manifest', error instanceof Error ? error.message : String(error));
    return buildReport(findings, undefined, requirementsSha);
  }

  try {
    requirements = parseRequirements(input.requirementsRaw);
  } catch (error) {
    add(findings, 'REQUIREMENTS_SHAPE_INVALID', 'requirements', 'requirements file is malformed', 'valid requirements', error instanceof Error ? error.message : String(error));
  }

  validateManifestDeep(manifest, requirements, findings);
  validateBaseline(manifest, input, findings);
  compare(findings, 'REQUIREMENTS_HASH_MISMATCH', 'requirements.sha256', manifest.requirements.sha256, requirementsSha, 'requirements content hash differs');

  let liveMigrations: MigrationIndex | undefined;
  try {
    liveMigrations = buildMigrationIndex(input.migrationFiles, manifest.migrations.directory || 'database/migrations');
  } catch (error) {
    add(findings, 'MIGRATIONS_INDEX_MISMATCH', 'migrations', 'could not rebuild the migration inventory', 'valid migration inventory', error instanceof Error ? error.message : String(error));
  }

  const contents: Record<string, string> = {};
  for (const file of input.migrationFiles) contents[file.name] = file.content;

  if (liveMigrations) {
    validateMigrationIndex(manifest, liveMigrations, findings);
    if (requirements) validateMigrationSchemaHead(manifest, requirements, liveMigrations, contents, findings);
  }

  let parsedBaseline: ReturnType<typeof parseSql> | undefined;
  try {
    parsedBaseline = parseSql(input.baselineSql, 'baseline');
  } catch (error) {
    add(findings, 'BASELINE_PARSE_FAILED', 'baseline', 'baseline SQL could not be parsed', 'parseable SQL', error instanceof Error ? error.message : String(error));
  }

  if (parsedBaseline) {
    const parsedColumnCount = parsedBaseline.tables.reduce((sum, table) => sum + table.columns.length, 0);
    const parsedIndexCount = parsedBaseline.tables.reduce((sum, table) => sum + table.indexes.length, 0);
    const parsedForeignKeyCount = parsedBaseline.tables.reduce((sum, table) => sum + table.foreignKeys.length, 0);
    const parsedCheckCount = parsedBaseline.tables.reduce((sum, table) => sum + table.checks.length, 0);
    compare(findings, 'COUNT_MISMATCH', 'schema.tableCount', manifest.schema.tableCount, parsedBaseline.tables.length, 'tableCount does not match the parsed baseline');
    compare(findings, 'COUNT_MISMATCH', 'schema.columnCount', manifest.schema.columnCount, parsedColumnCount, 'columnCount does not match the parsed baseline');
    compare(findings, 'COUNT_MISMATCH', 'schema.indexCount', manifest.schema.indexCount, parsedIndexCount, 'indexCount does not match the parsed baseline');
    compare(findings, 'COUNT_MISMATCH', 'schema.foreignKeyCount', manifest.schema.foreignKeyCount, parsedForeignKeyCount, 'foreignKeyCount does not match the parsed baseline');
    compare(findings, 'COUNT_MISMATCH', 'schema.checkCount', manifest.schema.checkCount, parsedCheckCount, 'checkCount does not match the parsed baseline');
    compare(findings, 'COUNT_MISMATCH', 'schema.triggerCount', manifest.schema.triggerCount, parsedBaseline.triggers.length, 'triggerCount does not match the parsed baseline');
    compare(findings, 'COUNT_MISMATCH', 'schema.alterStatementCount', manifest.schema.alterStatementCount, parsedBaseline.alters.length, 'alterStatementCount does not match the parsed baseline');
    compare(findings, 'COUNT_MISMATCH', 'schema.dropTableStatementCount', manifest.schema.dropTableStatementCount, parsedBaseline.droppedTables.length, 'dropTableStatementCount does not match the parsed baseline');
    const actualData = parsedBaseline.dataStatements.map((statement) => ({
      kind: statement.kind,
      table: statement.table,
      sha256: sha256Hex(statement.sql),
    }));
    compare(findings, 'DATA_STATEMENTS_MISMATCH', 'schema.dataStatements', manifest.schema.dataStatements, actualData, 'data statements do not match the parsed baseline');
  }

  if (requirements && liveMigrations && parsedBaseline) {
    try {
      resolveRequirements(parsedBaseline, liveMigrations, requirements, requirementsSha, contents);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('contentOnly:')) {
        add(findings, 'CONTENT_ONLY_MISMATCH', 'requirements.contentOnly', 'Tier A content-only verification failed', 'valid content-only set', message);
      } else if (message.includes('schemaHeadEvidence')) {
        add(findings, 'SCHEMA_HEAD_EVIDENCE_MISMATCH', 'requirements.schemaHeadEvidence', 'schemaHead evidence verification failed', 'valid head evidence', message);
      } else if (message.includes('schemaHead')) {
        add(findings, 'SCHEMA_HEAD_MISMATCH', 'requirements.schemaHead', 'Tier A schemaHead verification failed', 'valid schemaHead', message);
      } else {
        add(findings, 'REQUIREMENTS_PIN_MISMATCH', 'requirements', 'Tier A pin resolution failed', 'all pins resolve', message);
      }
    }
  }

  if (requirements && liveMigrations) {
    try {
      const rebuilt = buildManifest({
        baselineSql: input.baselineSql,
        baselinePath: input.baselinePath,
        requirements,
        requirementsRaw: input.requirementsRaw,
        migrations: liveMigrations,
        migrationContents: contents,
      });
      const differences = diffManifests(manifest, rebuilt.manifest);
      for (const difference of differences) {
        add(findings, 'MANIFEST_STALE', difference.path, 'manifest differs from a fresh rebuild of the baseline artefacts', difference.expected, difference.actual);
      }
    } catch (error) {
      if (!findings.some((finding) => finding.code === 'REQUIREMENTS_PIN_MISMATCH' || finding.code === 'CONTENT_ONLY_MISMATCH' || finding.code === 'SCHEMA_HEAD_MISMATCH')) {
        add(findings, 'MANIFEST_REBUILD_FAILED', 'manifest', 'a fresh manifest could not be rebuilt', 'successful rebuild', error instanceof Error ? error.message : String(error));
      }
    }
  }

  return buildReport(findings, manifest, requirementsSha);
}

function buildReport(findings: StaticFinding[], manifest: Manifest | undefined, requirementsSha: string): StaticValidationReport {
  findings.sort((a, b) => compareStrings(`${a.code}|${a.path}`, `${b.code}|${b.path}`));
  return {
    ok: findings.length === 0,
    findings,
    summary: {
      baselineSha256: manifest?.baseline.sha256 ?? '',
      schemaHead: manifest?.schema.schemaHead ?? '',
      tableCount: manifest?.schema.tableCount ?? 0,
      triggerCount: manifest?.schema.triggerCount ?? 0,
      pinCount: manifest?.requirements.pinCount ?? 0,
      migrationCount: manifest?.migrations.count ?? 0,
      objectCount: manifest ? Object.keys(manifest.schema.tables).length + Object.keys(manifest.schema.triggers).length : 0,
      findings: findings.length,
    },
    hashes: {
      baseline: manifest?.baseline.sha256 ?? null,
      requirements: requirementsSha,
      inventory: manifest?.schema.inventorySha256 ?? null,
      object: manifest?.schema.objectSha256 ?? null,
      schema: manifest?.schema.schemaSha256 ?? null,
      migrations: manifest?.migrations.sha256 ?? null,
    },
  };
}
