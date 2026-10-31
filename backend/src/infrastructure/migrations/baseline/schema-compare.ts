// ============================================================================
// CourtZon — pure Tier A / Tier B schema comparator (V3).
//
// Inputs:
//   * V1 static-validation report (must be ok)
//   * V1-validated manifest + requirements
//   * V2 live metadata report/snapshot (must be complete and exact)
//   * explicit mode: tierA | tierB
//
// Output: deterministic, sorted findings with stable codes and a
// status of ok | drift | blocked. This module never connects to a database,
// never reads files, never imports a CLI with top-level execution, and never
// authorizes stamping.
// ============================================================================

import {
  canonicalJson,
  type BaselineRequirements,
  type CheckSignature,
  type ColumnSignature,
  type ForeignKeySignature,
  type IndexSignature,
  type Manifest,
  type TableSignature,
  type TriggerSignature,
} from './baseline-manifest.js';
import { canonicalSql, tokenize, type SqlToken } from './parse-baseline.js';
import type { LiveMetadataReport, LiveSchemaSnapshot, LiveTableSnapshot, LiveTriggerSnapshot } from './live-metadata.js';
import type { StaticValidationReport } from './static-validation.js';

export type ComparisonMode = 'tierA' | 'tierB';
export type ComparisonStatus = 'ok' | 'drift' | 'blocked';

/**
 * Tier B column-order policy (Decision 3B).
 *   * `non-semantic` (default): column presence, names, types, nullability,
 *     defaults, generated expressions, indexes, FKs and checks remain strict,
 *     but a pure ordinal reordering is not reported.
 *   * `strict`: also reports COLUMN_ORDER_MISMATCH when the same column set is
 *     ordered differently. Callers must opt in explicitly.
 *
 * Tier A pinned ordered column lists are always strict and are unaffected.
 */
export type ColumnOrderPolicy = 'non-semantic' | 'strict';

export type ComparisonCode =
  | 'STATIC_VALIDATION_FAILED'
  | 'LIVE_SNAPSHOT_UNAVAILABLE'
  | 'LIVE_SNAPSHOT_INCOMPLETE'
  | 'INVALID_MODE'
  | 'INVALID_INPUT'
  | 'RUNTIME_OBJECT_EXPECTED'
  | 'RUNTIME_OBJECT_IN_SNAPSHOT'
  | 'UNEXPECTED_RUNTIME_OBJECT'
  | 'RUNTIME_OBJECT_IGNORED'
  | 'INDETERMINATE_OBJECT'
  | 'UNSUPPORTED_OBJECT'
  | 'MISSING_TABLE'
  | 'EXTRA_TABLE'
  | 'TABLE_ENGINE_MISMATCH'
  | 'TABLE_CHARSET_MISMATCH'
  | 'TABLE_COLLATION_MISMATCH'
  | 'MISSING_COLUMN'
  | 'EXTRA_COLUMN'
  | 'COLUMN_COUNT_MISMATCH'
  | 'COLUMN_ORDER_MISMATCH'
  | 'COLUMN_TYPE_MISMATCH'
  | 'COLUMN_NULLABILITY_MISMATCH'
  | 'COLUMN_DEFAULT_MISMATCH'
  | 'COLUMN_GENERATED_MISMATCH'
  | 'COLUMN_AUTO_INCREMENT_MISMATCH'
  | 'COLUMN_ON_UPDATE_MISMATCH'
  | 'COLUMN_CHARSET_MISMATCH'
  | 'COLUMN_COLLATION_MISMATCH'
  | 'MISSING_INDEX'
  | 'EXTRA_INDEX'
  | 'INDEX_COLUMNS_MISMATCH'
  | 'INDEX_UNIQUENESS_MISMATCH'
  | 'INDEX_KIND_MISMATCH'
  | 'INDEX_DESC_MISMATCH'
  | 'INDEX_PREFIX_MISMATCH'
  | 'MISSING_FOREIGN_KEY'
  | 'EXTRA_FOREIGN_KEY'
  | 'FK_COLUMNS_MISMATCH'
  | 'FK_REFERENCE_MISMATCH'
  | 'FK_ACTION_MISMATCH'
  | 'MISSING_CHECK'
  | 'EXTRA_CHECK'
  | 'CHECK_EXPRESSION_MISMATCH'
  | 'MISSING_TRIGGER'
  | 'EXTRA_TRIGGER'
  | 'TRIGGER_IDENTITY_MISMATCH'
  | 'TRIGGER_BODY_MISMATCH'
  | 'EXTRA_VIEW';

export type FindingCategory = 'missing' | 'extra' | 'mismatch' | 'unsupported' | 'indeterminate' | 'blocked' | 'info';
export type FindingSeverity = 'error' | 'warning' | 'info';
export type FindingScope = 'tierA' | 'tierB' | 'global';

export interface ComparisonFinding {
  code: ComparisonCode;
  severity: FindingSeverity;
  category: FindingCategory;
  scope: FindingScope;
  object: string;
  path: string;
  message: string;
  expected: string | null;
  actual: string | null;
}

export interface ComparisonSummary {
  expectedTables: number;
  liveTables: number;
  expectedTriggers: number;
  liveTriggers: number;
  pinsChecked: number;
  missing: number;
  extra: number;
  mismatched: number;
  warnings: number;
}

export interface SchemaCompareInput {
  mode: ComparisonMode;
  staticValidation: StaticValidationReport;
  manifest: Manifest;
  requirements: BaselineRequirements;
  live: LiveMetadataReport;
  /** Default: ['migration_history']. Use the same list passed to V2. */
  runtimeObjects?: string[];
  /**
   * Tier B ordinal-column-order policy. Default: 'non-semantic' (Decision 3B).
   * Pass 'strict' to retain the legacy COLUMN_ORDER_MISMATCH finding.
   */
  columnOrder?: ColumnOrderPolicy;
}

export interface SchemaComparisonReport {
  comparatorVersion: 1;
  mode: ComparisonMode | 'invalid';
  status: ComparisonStatus;
  complete: boolean;
  findings: ComparisonFinding[];
  summary: ComparisonSummary;
  fatal?: {
    code: ComparisonCode;
    message: string;
    details?: string;
  };
}

const DEFAULT_RUNTIME_OBJECTS = ['migration_history'];

const EMPTY_SUMMARY: ComparisonSummary = {
  expectedTables: 0,
  liveTables: 0,
  expectedTriggers: 0,
  liveTriggers: 0,
  pinsChecked: 0,
  missing: 0,
  extra: 0,
  mismatched: 0,
  warnings: 0,
};

// ---------------------------------------------------------------------------
// Basic helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeFkAction(value: string | null | undefined): string {
  const normalized = (value ?? '').trim().toUpperCase();
  if (!normalized || normalized === 'RESTRICT' || normalized === 'NO ACTION') return 'RESTRICT';
  return normalized;
}

function normalizeType(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeDefault(value: string | null | undefined, type?: string): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (/^null$/i.test(trimmed)) return null;

  const unquoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"')))
      ? trimmed.slice(1, -1)
      : trimmed;

  if (/^current_timestamp(?:\(\d*\))?$/i.test(unquoted)) return 'current_timestamp';

  const numericType = !!type && /^(?:tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real|bit|year)\b/i.test(type.trim());
  if (numericType) {
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(unquoted.trim());
    if (match) {
      const sign = match[1];
      const integer = match[2].replace(/^0+(?=\d)/, '') || '0';
      const fraction = (match[3] ?? '').replace(/0+$/, '');
      const normalized = `${integer}${fraction ? `.${fraction}` : ''}`;
      return normalized === '0' ? '0' : `${sign}${normalized}`;
    }
    return trimmed;
  }

  // Character, enum/set, date/time and other string-like defaults: quote
  // delimiters are representation, not value, so compare the inner text.
  return unquoted;
}

function stripCharsetIntroducers(tokens: SqlToken[]): SqlToken[] {
  const output: SqlToken[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (token.type === 'word' && /^_[A-Za-z0-9]+$/.test(token.value) && next?.type === 'string') {
      continue;
    }
    output.push(token);
  }
  return output;
}

function findMatchingParen(tokens: SqlToken[], openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'punct') continue;
    if (token.value === '(') depth += 1;
    if (token.value === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function isAtomicParenthesizedGroup(inner: SqlToken[]): boolean {
  if (inner.length === 0) return false;
  if (inner[0].type === 'word' && ['SELECT', 'WITH', 'EXISTS', 'NOT'].includes(inner[0].value.toUpperCase())) {
    return false;
  }

  let depth = 0;
  let hasComparison = false;
  for (let index = 0; index < inner.length; index += 1) {
    const token = inner[index];
    if (token.type === 'punct') {
      if (token.value === '(') depth += 1;
      else if (token.value === ')') depth -= 1;
      else if (depth === 0) {
        if (token.value === ',') return false;
        if (['+', '-', '*', '/', '%'].includes(token.value)) return false;
        if (['=', '<', '>', '<=', '>=', '<>', '!=', '<=>', '&', '|', '^'].includes(token.value)) {
          hasComparison = true;
        }
      }
      continue;
    }
    if (token.type !== 'word' || depth !== 0) continue;
    const word = token.value.toUpperCase();
    if (['AND', 'OR', 'XOR', 'DIV', 'MOD'].includes(word)) return false;
    if (['IS', 'IN', 'LIKE', 'BETWEEN', 'REGEXP', 'RLIKE'].includes(word)) hasComparison = true;
  }

  if (hasComparison) return true;
  if (inner.length === 1) return true;
  // A function call or a qualified identifier that consumes the whole group.
  if (inner.length >= 3 && inner[1]?.type === 'punct' && inner[1].value === '(') {
    return findMatchingParen(inner, 1) === inner.length - 1;
  }
  return false;
}

function hasTopLevelComparison(inner: SqlToken[]): boolean {
  let depth = 0;
  for (const token of inner) {
    if (token.type === 'punct') {
      if (token.value === '(') depth += 1;
      else if (token.value === ')') depth -= 1;
      else if (depth === 0 && ['=', '<', '>', '<=', '>=', '<>', '!=', '<=>'].includes(token.value)) return true;
      continue;
    }
    if (token.type !== 'word' || depth !== 0) continue;
    if (['IS', 'IN', 'LIKE', 'BETWEEN', 'REGEXP', 'RLIKE'].includes(token.value.toUpperCase())) return true;
  }
  return false;
}

function isOperatorToken(token: SqlToken | undefined): boolean {
  if (token?.type !== 'punct') return false;
  return ['=', '<', '>', '<=', '>=', '<>', '!=', '<=>', '&', '|', '^', '+', '-', '*', '/', '%', '!', '~'].includes(token.value);
}

function removeRedundantParentheses(tokens: SqlToken[]): SqlToken[] {
  const output: SqlToken[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token.type === 'punct' && token.value === '(') {
      const close = findMatchingParen(tokens, index);
      if (close !== -1) {
        const inner = tokens.slice(index + 1, close);
        const normalizedInner = removeRedundantParentheses(inner);
        // A comparison group used as an operand of another operator keeps its
        // parentheses: `(a = 1) = (b = 2)` is not `a = 1 = b = 2`.
        const guardsOperand =
          hasTopLevelComparison(inner) &&
          (isOperatorToken(tokens[index - 1]) || isOperatorToken(tokens[close + 1]));
        if (isAtomicParenthesizedGroup(inner) && !guardsOperand) {
          output.push(...normalizedInner);
        } else {
          output.push(token, ...normalizedInner, tokens[close]);
        }
        index = close + 1;
        continue;
      }
    }
    output.push(token);
    index += 1;
  }
  return output;
}

function normalizeCharset(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : value.trim().toLowerCase();
}

function stripOuterParens(tokens: SqlToken[]): SqlToken[] {
  let current = tokens;
  while (current.length >= 2 && current[0].type === 'punct' && current[0].value === '(') {
    let depth = 0;
    let close = -1;
    for (let index = 0; index < current.length; index += 1) {
      const token = current[index];
      if (token.type !== 'punct') continue;
      if (token.value === '(') depth += 1;
      else if (token.value === ')') {
        depth -= 1;
        if (depth === 0) {
          close = index;
          break;
        }
      }
    }
    if (close !== current.length - 1) break;
    current = current.slice(1, close);
  }
  return current;
}

function normalizeExpression(value: string): string {
  const tokens = stripCharsetIntroducers(tokenize(value).tokens);
  return canonicalSql(stripOuterParens(removeRedundantParentheses(tokens)));
}

function normalizeBody(value: string): string {
  const tokens = tokenize(value).tokens;
  // A trigger body may end with the statement delimiter. Trailing semicolons
  // and whitespace carry no meaning; inner statement delimiters are preserved.
  while (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    const isSemicolon = (last.type === 'delim' || last.type === 'punct') && last.value === ';';
    if (!isSemicolon) break;
    tokens.pop();
  }
  return canonicalSql(tokens);
}

function displayValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  return canonicalJson(value);
}

function add(
  findings: ComparisonFinding[],
  code: ComparisonCode,
  category: FindingCategory,
  severity: FindingSeverity,
  scope: FindingScope,
  object: string,
  path: string,
  message: string,
  expected: unknown = null,
  actual: unknown = null,
): void {
  const key = `${code}|${scope}|${path}|${message}`;
  if (findings.some((finding) => `${finding.code}|${finding.scope}|${finding.path}|${finding.message}` === key)) return;
  findings.push({
    code,
    severity,
    category,
    scope,
    object,
    path,
    message,
    expected: displayValue(expected),
    actual: displayValue(actual),
  });
}

function sortFindings(findings: ComparisonFinding[]): ComparisonFinding[] {
  return [...findings].sort((a, b) => {
    const left = `${a.code}|${a.path}|${a.message}`;
    const right = `${b.code}|${b.path}|${b.message}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

function summaryWithFindings(base: ComparisonSummary, findings: ComparisonFinding[]): ComparisonSummary {
  return {
    ...base,
    missing: findings.filter((finding) => finding.category === 'missing').length,
    extra: findings.filter((finding) => finding.category === 'extra').length,
    mismatched: findings.filter((finding) => finding.category === 'mismatch').length,
    warnings: findings.filter((finding) => finding.severity === 'warning').length,
  };
}

function buildReport(
  mode: ComparisonMode | 'invalid',
  findings: ComparisonFinding[],
  summary: ComparisonSummary,
  fatal?: SchemaComparisonReport['fatal'],
): SchemaComparisonReport {
  const sorted = sortFindings(findings);
  const errors = sorted.filter((finding) => finding.severity === 'error').length;
  return {
    comparatorVersion: 1,
    mode,
    status: fatal ? 'blocked' : errors > 0 ? 'drift' : 'ok',
    complete: fatal === undefined,
    findings: sorted,
    summary: summaryWithFindings(summary, sorted),
    ...(fatal === undefined ? {} : { fatal }),
  };
}

function blockedReport(
  mode: ComparisonMode | 'invalid',
  code: ComparisonCode,
  message: string,
  details?: string,
): SchemaComparisonReport {
  const findings: ComparisonFinding[] = [];
  add(findings, code, 'blocked', 'error', 'global', 'comparison', 'comparison', message, details ?? null, null);
  return buildReport(mode, findings, { ...EMPTY_SUMMARY }, { code, message, ...(details === undefined ? {} : { details }) });
}

// ---------------------------------------------------------------------------
// Input guards
// ---------------------------------------------------------------------------

function isValidTableSignature(value: unknown): value is TableSignature {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    Array.isArray(value.columns) &&
    Array.isArray(value.indexes) &&
    Array.isArray(value.foreignKeys) &&
    Array.isArray(value.checks)
  );
}

function isValidTriggerSignature(value: unknown): value is TriggerSignature {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.table === 'string' &&
    (value.timing === 'BEFORE' || value.timing === 'AFTER') &&
    (value.event === 'INSERT' || value.event === 'UPDATE' || value.event === 'DELETE') &&
    typeof value.body === 'string'
  );
}

function isValidManifest(value: unknown): value is Manifest {
  if (!isRecord(value) || !isRecord(value.schema)) return false;
  const schema = value.schema as Record<string, unknown>;
  if (!isRecord(schema.tables) || !isRecord(schema.triggers)) return false;
  const tables = schema.tables as Record<string, unknown>;
  const triggers = schema.triggers as Record<string, unknown>;
  return Object.values(tables).every((record) => isRecord(record) && isValidTableSignature(record.signature))
    && Object.values(triggers).every((record) => isRecord(record) && isValidTriggerSignature(record.signature));
}

function isValidRequirements(value: unknown): value is BaselineRequirements {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.requiredTables) &&
    Array.isArray(value.requiredColumns) &&
    Array.isArray(value.requiredIndexes) &&
    Array.isArray(value.requiredForeignKeys) &&
    Array.isArray(value.requiredTriggers)
  );
}

function isValidSnapshot(value: unknown): value is LiveSchemaSnapshot {
  if (!isRecord(value) || !isRecord(value.tables) || !isRecord(value.triggers)) return false;
  if (!Array.isArray(value.runtimeObjects) || !Array.isArray(value.views) || !Array.isArray(value.unsupportedObjects)) return false;
  if (typeof value.snapshotSha256 !== 'string') return false;
  const tables = value.tables as Record<string, unknown>;
  const triggers = value.triggers as Record<string, unknown>;
  return Object.values(tables).every((record) => isRecord(record) && typeof record.exact === 'boolean' && isValidTableSignature(record.signature))
    && Object.values(triggers).every((record) => isRecord(record) && typeof record.exact === 'boolean' && isValidTriggerSignature(record.signature));
}

function normalizeRuntimeObjects(value: unknown): Set<string> | null {
  if (value === undefined) return new Set(DEFAULT_RUNTIME_OBJECTS.map(normalizeName));
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return new Set(value.map(normalizeName));
}

function normalizeTableMap(tables: Record<string, LiveTableSnapshot> | undefined): Map<string, LiveTableSnapshot> {
  const map = new Map<string, LiveTableSnapshot>();
  for (const [name, record] of Object.entries(tables ?? {})) {
    map.set(normalizeName(name), { ...record, name: normalizeName(name) });
  }
  return map;
}

function normalizeTriggerMap(triggers: Record<string, LiveTriggerSnapshot> | undefined): Map<string, LiveTriggerSnapshot> {
  const map = new Map<string, LiveTriggerSnapshot>();
  for (const [name, record] of Object.entries(triggers ?? {})) {
    map.set(normalizeName(name), { ...record, name: normalizeName(name) });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Tier A
// ---------------------------------------------------------------------------

function compareTierA(
  input: SchemaCompareInput,
  snapshot: LiveSchemaSnapshot,
  runtimeFindings: ComparisonFinding[],
): SchemaComparisonReport {
  const findings: ComparisonFinding[] = [...runtimeFindings];
  const liveTables = normalizeTableMap(snapshot.tables);
  const liveTriggers = normalizeTriggerMap(snapshot.triggers);
  const requirements = input.requirements;
  const pinsChecked =
    requirements.requiredTables.length +
    requirements.requiredColumns.length +
    requirements.requiredIndexes.length +
    requirements.requiredForeignKeys.length +
    requirements.requiredTriggers.length;

  for (const view of snapshot.views) {
    add(findings, 'EXTRA_VIEW', 'extra', 'warning', 'tierA', `view:${view}`, `tierA.views.${view}`, 'View is not represented by the baseline manifest', null, view);
  }

  const findTable = (name: string, object: string): LiveTableSnapshot | null => {
    const table = liveTables.get(normalizeName(name));
    if (!table) {
      add(findings, 'MISSING_TABLE', 'missing', 'error', 'tierA', object, `tierA.tables.${normalizeName(name)}`, `Live table '${name}' is missing`, name, null);
      return null;
    }
    return table;
  };

  for (const pin of requirements.requiredTables) {
    const table = findTable(pin.name, pin.name);
    if (!table) continue;
    if (pin.columns) {
      const expected = pin.columns.map(normalizeName);
      const actual = table.signature.columns.map((column) => normalizeName(column.name));
      if (canonicalJson(expected) !== canonicalJson(actual)) {
        add(findings, 'COLUMN_ORDER_MISMATCH', 'mismatch', 'error', 'tierA', pin.name, `tierA.tables.${normalizeName(pin.name)}.columns`, 'Pinned ordered column list differs', expected, actual);
      }
    }
    if (pin.columnCount !== undefined && table.signature.columns.length !== pin.columnCount) {
      add(findings, 'COLUMN_COUNT_MISMATCH', 'mismatch', 'error', 'tierA', pin.name, `tierA.tables.${normalizeName(pin.name)}.columnCount`, 'Pinned column count differs', pin.columnCount, table.signature.columns.length);
    }
  }

  for (const pin of requirements.requiredColumns) {
    const table = findTable(pin.table, pin.table);
    if (!table) continue;
    const column = table.signature.columns.find((candidate) => normalizeName(candidate.name) === normalizeName(pin.column));
    if (!column) {
      add(findings, 'MISSING_COLUMN', 'missing', 'error', 'tierA', `${pin.table}.${pin.column}`, `tierA.tables.${normalizeName(pin.table)}.columns.${normalizeName(pin.column)}`, 'Pinned column is missing', pin.column, null);
      continue;
    }
    if (pin.type !== undefined && normalizeType(pin.type) !== normalizeType(column.type)) {
      add(findings, 'COLUMN_TYPE_MISMATCH', 'mismatch', 'error', 'tierA', `${pin.table}.${pin.column}`, `tierA.tables.${normalizeName(pin.table)}.columns.${normalizeName(pin.column)}.type`, 'Pinned column type differs', pin.type, column.type);
    }
    if (pin.nullable !== undefined && pin.nullable !== column.nullable) {
      add(findings, 'COLUMN_NULLABILITY_MISMATCH', 'mismatch', 'error', 'tierA', `${pin.table}.${pin.column}`, `tierA.tables.${normalizeName(pin.table)}.columns.${normalizeName(pin.column)}.nullable`, 'Pinned nullability differs', pin.nullable, column.nullable);
    }
    if (pin.default !== undefined && normalizeDefault(pin.default, pin.type ?? column.type) !== normalizeDefault(column.default, column.type)) {
      add(findings, 'COLUMN_DEFAULT_MISMATCH', 'mismatch', 'error', 'tierA', `${pin.table}.${pin.column}`, `tierA.tables.${normalizeName(pin.table)}.columns.${normalizeName(pin.column)}.default`, 'Pinned default differs', pin.default, column.default);
    }
    if (pin.autoIncrement !== undefined && pin.autoIncrement !== column.autoIncrement) {
      add(findings, 'COLUMN_AUTO_INCREMENT_MISMATCH', 'mismatch', 'error', 'tierA', `${pin.table}.${pin.column}`, `tierA.tables.${normalizeName(pin.table)}.columns.${normalizeName(pin.column)}.autoIncrement`, 'Pinned autoIncrement differs', pin.autoIncrement, column.autoIncrement);
    }
  }

  for (const pin of requirements.requiredIndexes) {
    const table = findTable(pin.table, pin.table);
    if (!table) continue;
    const index = table.signature.indexes.find((candidate) => normalizeName(candidate.name) === normalizeName(pin.name));
    if (!index) {
      add(findings, 'MISSING_INDEX', 'missing', 'error', 'tierA', `${pin.table}.${pin.name}`, `tierA.tables.${normalizeName(pin.table)}.indexes.${normalizeName(pin.name)}`, 'Pinned index is missing', pin.name, null);
      continue;
    }
    if (index.unique !== pin.unique) {
      add(findings, 'INDEX_UNIQUENESS_MISMATCH', 'mismatch', 'error', 'tierA', `${pin.table}.${pin.name}`, `tierA.tables.${normalizeName(pin.table)}.indexes.${normalizeName(pin.name)}.unique`, 'Pinned index uniqueness differs', pin.unique, index.unique);
    }
    const expected = pin.columns.map(normalizeName);
    const actual = index.columns.map((column) => normalizeName(column.name));
    if (canonicalJson(expected) !== canonicalJson(actual)) {
      add(findings, 'INDEX_COLUMNS_MISMATCH', 'mismatch', 'error', 'tierA', `${pin.table}.${pin.name}`, `tierA.tables.${normalizeName(pin.table)}.indexes.${normalizeName(pin.name)}.columns`, 'Pinned index columns differ', expected, actual);
    }
  }

  for (const pin of requirements.requiredForeignKeys) {
    const table = findTable(pin.table, pin.table);
    if (!table) continue;
    const foreignKey = table.signature.foreignKeys.find((candidate) => normalizeName(candidate.name) === normalizeName(pin.name));
    if (!foreignKey) {
      add(findings, 'MISSING_FOREIGN_KEY', 'missing', 'error', 'tierA', `${pin.table}.${pin.name}`, `tierA.tables.${normalizeName(pin.table)}.foreignKeys.${normalizeName(pin.name)}`, 'Pinned foreign key is missing', pin.name, null);
      continue;
    }
    const expectedColumns = pin.columns.map(normalizeName);
    const actualColumns = foreignKey.columns.map(normalizeName);
    if (canonicalJson(expectedColumns) !== canonicalJson(actualColumns)) {
      add(findings, 'FK_COLUMNS_MISMATCH', 'mismatch', 'error', 'tierA', `${pin.table}.${pin.name}`, `tierA.tables.${normalizeName(pin.table)}.foreignKeys.${normalizeName(pin.name)}.columns`, 'Pinned foreign key columns differ', expectedColumns, actualColumns);
    }
    if (
      normalizeName(foreignKey.referencedTable) !== normalizeName(pin.referencedTable) ||
      canonicalJson(foreignKey.referencedColumns.map(normalizeName)) !== canonicalJson(pin.referencedColumns.map(normalizeName))
    ) {
      add(findings, 'FK_REFERENCE_MISMATCH', 'mismatch', 'error', 'tierA', `${pin.table}.${pin.name}`, `tierA.tables.${normalizeName(pin.table)}.foreignKeys.${normalizeName(pin.name)}.reference`, 'Pinned foreign key reference differs', { table: pin.referencedTable, columns: pin.referencedColumns }, { table: foreignKey.referencedTable, columns: foreignKey.referencedColumns });
    }
    if (normalizeFkAction(foreignKey.onDelete) !== normalizeFkAction(pin.onDelete)) {
      add(findings, 'FK_ACTION_MISMATCH', 'mismatch', 'error', 'tierA', `${pin.table}.${pin.name}`, `tierA.tables.${normalizeName(pin.table)}.foreignKeys.${normalizeName(pin.name)}.onDelete`, 'Pinned ON DELETE action differs', normalizeFkAction(pin.onDelete), normalizeFkAction(foreignKey.onDelete));
    }
    if (normalizeFkAction(foreignKey.onUpdate) !== normalizeFkAction(pin.onUpdate)) {
      add(findings, 'FK_ACTION_MISMATCH', 'mismatch', 'error', 'tierA', `${pin.table}.${pin.name}`, `tierA.tables.${normalizeName(pin.table)}.foreignKeys.${normalizeName(pin.name)}.onUpdate`, 'Pinned ON UPDATE action differs', normalizeFkAction(pin.onUpdate), normalizeFkAction(foreignKey.onUpdate));
    }
  }

  for (const pin of requirements.requiredTriggers) {
    const trigger = liveTriggers.get(normalizeName(pin.name));
    if (!trigger) {
      add(findings, 'MISSING_TRIGGER', 'missing', 'error', 'tierA', pin.name, `tierA.triggers.${normalizeName(pin.name)}`, 'Pinned trigger is missing', pin.name, null);
      continue;
    }
    const identity = trigger.signature;
    if (
      normalizeName(identity.table) !== normalizeName(pin.table) ||
      identity.timing !== pin.timing ||
      identity.event !== pin.event
    ) {
      add(findings, 'TRIGGER_IDENTITY_MISMATCH', 'mismatch', 'error', 'tierA', pin.name, `tierA.triggers.${normalizeName(pin.name)}.identity`, 'Pinned trigger identity differs', { table: pin.table, timing: pin.timing, event: pin.event }, { table: identity.table, timing: identity.timing, event: identity.event });
    }
  }

  return buildReport(
    'tierA',
    findings,
    {
      expectedTables: Object.keys(input.manifest.schema.tables).length,
      liveTables: liveTables.size,
      expectedTriggers: Object.keys(input.manifest.schema.triggers).length,
      liveTriggers: liveTriggers.size,
      pinsChecked,
      ...{ missing: 0, extra: 0, mismatched: 0, warnings: 0 },
    },
  );
}

// ---------------------------------------------------------------------------
// Tier B
// ---------------------------------------------------------------------------

function compareColumns(
  tableName: string,
  expected: ColumnSignature[],
  actual: ColumnSignature[],
  findings: ComparisonFinding[],
  strictOrder: boolean,
): void {
  const expectedByName = new Map(expected.map((column) => [normalizeName(column.name), column]));
  const actualByName = new Map(actual.map((column) => [normalizeName(column.name), column]));
  const expectedNames = expected.map((column) => normalizeName(column.name));
  const actualNames = actual.map((column) => normalizeName(column.name));
  const sameSet = expectedNames.length === actualNames.length && expectedNames.every((name) => actualByName.has(name));

  if (strictOrder && sameSet && canonicalJson(expectedNames) !== canonicalJson(actualNames)) {
    add(findings, 'COLUMN_ORDER_MISMATCH', 'mismatch', 'error', 'tierB', tableName, `tierB.tables.${normalizeName(tableName)}.columns.order`, 'Column order differs', expectedNames, actualNames);
  }

  for (const name of expectedNames) {
    const expectedColumn = expectedByName.get(name);
    const actualColumn = actualByName.get(name);
    if (!expectedColumn) continue;
    if (!actualColumn) {
      add(findings, 'MISSING_COLUMN', 'missing', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.columns.${name}`, 'Column is missing', name, null);
      continue;
    }
    if (normalizeType(expectedColumn.type) !== normalizeType(actualColumn.type)) {
      add(findings, 'COLUMN_TYPE_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.columns.${name}.type`, 'Column type differs', expectedColumn.type, actualColumn.type);
    }
    if (expectedColumn.nullable !== actualColumn.nullable) {
      add(findings, 'COLUMN_NULLABILITY_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.columns.${name}.nullable`, 'Column nullability differs', expectedColumn.nullable, actualColumn.nullable);
    }
    if (normalizeDefault(expectedColumn.default, expectedColumn.type) !== normalizeDefault(actualColumn.default, actualColumn.type)) {
      add(findings, 'COLUMN_DEFAULT_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.columns.${name}.default`, 'Column default differs', expectedColumn.default, actualColumn.default);
    }
    if (expectedColumn.autoIncrement !== actualColumn.autoIncrement) {
      add(findings, 'COLUMN_AUTO_INCREMENT_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.columns.${name}.autoIncrement`, 'Column autoIncrement differs', expectedColumn.autoIncrement, actualColumn.autoIncrement);
    }
    if (normalizeExpression(expectedColumn.generated ?? '') !== normalizeExpression(actualColumn.generated ?? '') || expectedColumn.generatedStorage !== actualColumn.generatedStorage) {
      add(findings, 'COLUMN_GENERATED_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.columns.${name}.generated`, 'Column generated expression/storage differs', { expression: expectedColumn.generated, storage: expectedColumn.generatedStorage }, { expression: actualColumn.generated, storage: actualColumn.generatedStorage });
    }
    if (normalizeExpression(expectedColumn.onUpdate ?? '') !== normalizeExpression(actualColumn.onUpdate ?? '')) {
      add(findings, 'COLUMN_ON_UPDATE_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.columns.${name}.onUpdate`, 'Column ON UPDATE differs', expectedColumn.onUpdate, actualColumn.onUpdate);
    }
    if (normalizeCharset(expectedColumn.characterSet) !== normalizeCharset(actualColumn.characterSet)) {
      add(findings, 'COLUMN_CHARSET_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.columns.${name}.characterSet`, 'Column charset differs', expectedColumn.characterSet, actualColumn.characterSet);
    }
    if (normalizeCharset(expectedColumn.collation) !== normalizeCharset(actualColumn.collation)) {
      add(findings, 'COLUMN_COLLATION_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.columns.${name}.collation`, 'Column collation differs', expectedColumn.collation, actualColumn.collation);
    }
  }

  for (const name of actualNames) {
    if (!expectedByName.has(name)) {
      add(findings, 'EXTRA_COLUMN', 'extra', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.columns.${name}`, 'Unexpected column', null, name);
    }
  }
}

function isImplicitForeignKeyIndex(index: IndexSignature, expectedForeignKeys: ForeignKeySignature[]): boolean {
  if (index.unique || index.kind !== 'KEY') return false;
  // MySQL names the automatically created index after the constraint it
  // supports. Only treat it as implicit when that exact FK exists and the
  // index covers exactly the FK columns in the same order.
  const foreignKey = expectedForeignKeys.find((candidate) => normalizeName(candidate.name) === normalizeName(index.name));
  if (!foreignKey) return false;
  const indexColumns = index.columns.map((column) => normalizeName(column.name));
  const foreignKeyColumns = foreignKey.columns.map(normalizeName);
  if (canonicalJson(indexColumns) !== canonicalJson(foreignKeyColumns)) return false;
  // Implicit FK-support indexes are plain ascending B-tree indexes with no
  // prefix lengths. Anything else was defined independently.
  return index.columns.every((column) => column.desc === false && column.prefixLength === null);
}

function compareIndexes(
  tableName: string,
  expected: IndexSignature[],
  actual: IndexSignature[],
  expectedForeignKeys: ForeignKeySignature[],
  findings: ComparisonFinding[],
): void {
  const expectedByName = new Map(expected.map((index) => [normalizeName(index.name), index]));
  const actualByName = new Map(actual.map((index) => [normalizeName(index.name), index]));

  for (const [name, expectedIndex] of [...expectedByName.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    const actualIndex = actualByName.get(name);
    if (!actualIndex) {
      add(findings, 'MISSING_INDEX', 'missing', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.indexes.${name}`, 'Index is missing', name, null);
      continue;
    }
    if (expectedIndex.kind !== actualIndex.kind) {
      add(findings, 'INDEX_KIND_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.indexes.${name}.kind`, 'Index kind differs', expectedIndex.kind, actualIndex.kind);
    }
    if (expectedIndex.unique !== actualIndex.unique) {
      add(findings, 'INDEX_UNIQUENESS_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.indexes.${name}.unique`, 'Index uniqueness differs', expectedIndex.unique, actualIndex.unique);
    }
    const expectedColumns = expectedIndex.columns.map((column) => normalizeName(column.name));
    const actualColumns = actualIndex.columns.map((column) => normalizeName(column.name));
    if (canonicalJson(expectedColumns) !== canonicalJson(actualColumns)) {
      add(findings, 'INDEX_COLUMNS_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.indexes.${name}.columns`, 'Index columns differ', expectedColumns, actualColumns);
    } else {
      for (let index = 0; index < expectedIndex.columns.length; index += 1) {
        if (expectedIndex.columns[index].desc !== actualIndex.columns[index].desc) {
          add(findings, 'INDEX_DESC_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.indexes.${name}.columns.${index}.desc`, 'Index column descending flag differs', expectedIndex.columns[index].desc, actualIndex.columns[index].desc);
        }
        if (expectedIndex.columns[index].prefixLength !== actualIndex.columns[index].prefixLength) {
          add(findings, 'INDEX_PREFIX_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.indexes.${name}.columns.${index}.prefixLength`, 'Index column prefix length differs', expectedIndex.columns[index].prefixLength, actualIndex.columns[index].prefixLength);
        }
      }
    }
  }
  for (const [name, index] of [...actualByName.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    if (expectedByName.has(name)) continue;
    if (isImplicitForeignKeyIndex(index, expectedForeignKeys)) continue;
    add(findings, 'EXTRA_INDEX', 'extra', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.indexes.${name}`, 'Unexpected index', null, name);
  }
}

function compareForeignKeys(tableName: string, expected: ForeignKeySignature[], actual: ForeignKeySignature[], findings: ComparisonFinding[]): void {
  const expectedByName = new Map(expected.map((foreignKey) => [normalizeName(foreignKey.name), foreignKey]));
  const actualByName = new Map(actual.map((foreignKey) => [normalizeName(foreignKey.name), foreignKey]));

  for (const [name, expectedForeignKey] of [...expectedByName.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    const actualForeignKey = actualByName.get(name);
    if (!actualForeignKey) {
      add(findings, 'MISSING_FOREIGN_KEY', 'missing', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.foreignKeys.${name}`, 'Foreign key is missing', name, null);
      continue;
    }
    const expectedColumns = expectedForeignKey.columns.map(normalizeName);
    const actualColumns = actualForeignKey.columns.map(normalizeName);
    if (canonicalJson(expectedColumns) !== canonicalJson(actualColumns)) {
      add(findings, 'FK_COLUMNS_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.foreignKeys.${name}.columns`, 'Foreign key columns differ', expectedColumns, actualColumns);
    }
    if (
      normalizeName(expectedForeignKey.referencedTable) !== normalizeName(actualForeignKey.referencedTable) ||
      canonicalJson(expectedForeignKey.referencedColumns.map(normalizeName)) !== canonicalJson(actualForeignKey.referencedColumns.map(normalizeName))
    ) {
      add(findings, 'FK_REFERENCE_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.foreignKeys.${name}.reference`, 'Foreign key reference differs', { table: expectedForeignKey.referencedTable, columns: expectedForeignKey.referencedColumns }, { table: actualForeignKey.referencedTable, columns: actualForeignKey.referencedColumns });
    }
    if (normalizeFkAction(expectedForeignKey.onDelete) !== normalizeFkAction(actualForeignKey.onDelete)) {
      add(findings, 'FK_ACTION_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.foreignKeys.${name}.onDelete`, 'Foreign key ON DELETE differs', normalizeFkAction(expectedForeignKey.onDelete), normalizeFkAction(actualForeignKey.onDelete));
    }
    if (normalizeFkAction(expectedForeignKey.onUpdate) !== normalizeFkAction(actualForeignKey.onUpdate)) {
      add(findings, 'FK_ACTION_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.foreignKeys.${name}.onUpdate`, 'Foreign key ON UPDATE differs', normalizeFkAction(expectedForeignKey.onUpdate), normalizeFkAction(actualForeignKey.onUpdate));
    }
  }
  for (const [name] of [...actualByName.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    if (!expectedByName.has(name)) {
      add(findings, 'EXTRA_FOREIGN_KEY', 'extra', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.foreignKeys.${name}`, 'Unexpected foreign key', null, name);
    }
  }
}

function compareChecks(tableName: string, expected: CheckSignature[], actual: CheckSignature[], findings: ComparisonFinding[]): void {
  const expectedNamed = new Map<string, CheckSignature>();
  const expectedAnonymous: CheckSignature[] = [];
  for (const check of expected) {
    if (check.name === null) expectedAnonymous.push(check);
    else expectedNamed.set(normalizeName(check.name), check);
  }
  const liveNamed = new Map<string, { check: CheckSignature; index: number }>();
  actual.forEach((check, index) => {
    if (check.name !== null) liveNamed.set(normalizeName(check.name), { check, index });
  });
  const consumed = new Set<number>();

  for (const [name, expectedCheck] of [...expectedNamed.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    const live = liveNamed.get(name);
    if (!live) {
      add(findings, 'MISSING_CHECK', 'missing', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.checks.${name}`, 'Check constraint is missing', name, null);
      continue;
    }
    consumed.add(live.index);
    if (normalizeExpression(expectedCheck.expression) !== normalizeExpression(live.check.expression)) {
      add(findings, 'CHECK_EXPRESSION_MISMATCH', 'mismatch', 'error', 'tierB', `${tableName}.${name}`, `tierB.tables.${normalizeName(tableName)}.checks.${name}.expression`, 'Check expression differs', expectedCheck.expression, live.check.expression);
    }
  }

  for (const expectedCheck of expectedAnonymous) {
    const expectedExpression = normalizeExpression(expectedCheck.expression);
    const matchIndex = actual.findIndex((check, index) => !consumed.has(index) && normalizeExpression(check.expression) === expectedExpression);
    if (matchIndex === -1) {
      add(findings, 'MISSING_CHECK', 'missing', 'error', 'tierB', `${tableName}.<anonymous>`, `tierB.tables.${normalizeName(tableName)}.checks.<anonymous>`, 'Anonymous check constraint is missing by expression', expectedCheck.expression, null);
    } else {
      consumed.add(matchIndex);
    }
  }

  actual.forEach((check, index) => {
    if (consumed.has(index)) return;
    add(findings, 'EXTRA_CHECK', 'extra', 'error', 'tierB', `${tableName}.${check.name ?? '<anonymous>'}`, `tierB.tables.${normalizeName(tableName)}.checks.${check.name ?? `<anonymous:${index}>`}`, 'Unexpected check constraint', null, check.expression);
  });
}

function compareTierB(
  input: SchemaCompareInput,
  snapshot: LiveSchemaSnapshot,
  runtime: Set<string>,
  runtimeFindings: ComparisonFinding[],
): SchemaComparisonReport {
  const findings: ComparisonFinding[] = [...runtimeFindings];
  const liveTables = normalizeTableMap(snapshot.tables);
  const liveTriggers = normalizeTriggerMap(snapshot.triggers);
  const expectedTables = new Map<string, TableSignature>();
  for (const [name, record] of Object.entries(input.manifest.schema.tables)) {
    expectedTables.set(normalizeName(name), record.signature);
  }
  const expectedTriggers = new Map<string, TriggerSignature>();
  for (const [name, record] of Object.entries(input.manifest.schema.triggers)) {
    expectedTriggers.set(normalizeName(name), record.signature);
  }

  for (const [name, expected] of [...expectedTables.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    const actual = liveTables.get(name);
    if (!actual) {
      add(findings, 'MISSING_TABLE', 'missing', 'error', 'tierB', name, `tierB.tables.${name}`, 'Live table is missing', name, null);
      continue;
    }
    if (normalizeName(expected.engine ?? '') !== normalizeName(actual.signature.engine ?? '')) {
      add(findings, 'TABLE_ENGINE_MISMATCH', 'mismatch', 'error', 'tierB', name, `tierB.tables.${name}.engine`, 'Table engine differs', expected.engine, actual.signature.engine);
    }
    if (normalizeCharset(expected.characterSet) !== normalizeCharset(actual.signature.characterSet)) {
      add(findings, 'TABLE_CHARSET_MISMATCH', 'mismatch', 'error', 'tierB', name, `tierB.tables.${name}.characterSet`, 'Table charset differs', expected.characterSet, actual.signature.characterSet);
    }
    if (normalizeCharset(expected.collation) !== normalizeCharset(actual.signature.collation)) {
      add(findings, 'TABLE_COLLATION_MISMATCH', 'mismatch', 'error', 'tierB', name, `tierB.tables.${name}.collation`, 'Table collation differs', expected.collation, actual.signature.collation);
    }
    compareColumns(name, expected.columns, actual.signature.columns, findings, input.columnOrder === 'strict');
    compareIndexes(name, expected.indexes, actual.signature.indexes, expected.foreignKeys, findings);
    compareForeignKeys(name, expected.foreignKeys, actual.signature.foreignKeys, findings);
    compareChecks(name, expected.checks, actual.signature.checks, findings);
  }

  for (const [name] of [...liveTables.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    if (expectedTables.has(name)) continue;
    if (runtime.has(name)) {
      add(findings, 'RUNTIME_OBJECT_IN_SNAPSHOT', 'indeterminate', 'error', 'tierB', name, `tierB.tables.${name}`, 'Allowlisted runtime object appeared inside the comparison snapshot', name, null);
      continue;
    }
    add(findings, 'EXTRA_TABLE', 'extra', 'error', 'tierB', name, `tierB.tables.${name}`, 'Unexpected live table', null, name);
  }

  for (const view of snapshot.views) {
    add(findings, 'EXTRA_VIEW', 'extra', 'error', 'tierB', `view:${view}`, `tierB.views.${view}`, 'Unexpected live view', null, view);
  }

  for (const [name, expected] of [...expectedTriggers.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    const actual = liveTriggers.get(name);
    if (!actual) {
      add(findings, 'MISSING_TRIGGER', 'missing', 'error', 'tierB', name, `tierB.triggers.${name}`, 'Live trigger is missing', name, null);
      continue;
    }
    const identity = actual.signature;
    if (
      normalizeName(expected.table) !== normalizeName(identity.table) ||
      expected.timing !== identity.timing ||
      expected.event !== identity.event
    ) {
      add(findings, 'TRIGGER_IDENTITY_MISMATCH', 'mismatch', 'error', 'tierB', name, `tierB.triggers.${name}.identity`, 'Trigger identity differs', { table: expected.table, timing: expected.timing, event: expected.event }, { table: identity.table, timing: identity.timing, event: identity.event });
    }
    if (normalizeBody(expected.body) !== normalizeBody(identity.body)) {
      add(findings, 'TRIGGER_BODY_MISMATCH', 'mismatch', 'error', 'tierB', name, `tierB.triggers.${name}.body`, 'Trigger body differs', expected.body, identity.body);
    }
  }
  for (const [name] of [...liveTriggers.entries()].sort(([a], [b]) => compareStrings(a, b))) {
    if (!expectedTriggers.has(name)) {
      add(findings, 'EXTRA_TRIGGER', 'extra', 'error', 'tierB', name, `tierB.triggers.${name}`, 'Unexpected live trigger', null, name);
    }
  }

  return buildReport(
    'tierB',
    findings,
    {
      expectedTables: expectedTables.size,
      liveTables: liveTables.size,
      expectedTriggers: expectedTriggers.size,
      liveTriggers: liveTriggers.size,
      pinsChecked: 0,
      ...{ missing: 0, extra: 0, mismatched: 0, warnings: 0 },
    },
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function compareSchemas(input: SchemaCompareInput): SchemaComparisonReport {
  const mode = input?.mode;
  if (mode !== 'tierA' && mode !== 'tierB') {
    return blockedReport('invalid', 'INVALID_MODE', 'Comparison mode must be exactly tierA or tierB');
  }
  if (!input.staticValidation || input.staticValidation.ok !== true) {
    return blockedReport(mode, 'STATIC_VALIDATION_FAILED', 'V1 static validation must succeed before schema comparison');
  }
  if (!input.live || input.live.ok !== true || input.live.fatal || !input.live.snapshot) {
    return blockedReport(mode, 'LIVE_SNAPSHOT_UNAVAILABLE', 'A successful live metadata snapshot is required');
  }
  if (!isValidManifest(input.manifest) || !isValidRequirements(input.requirements)) {
    return blockedReport(mode, 'INVALID_INPUT', 'Manifest or requirements input is malformed');
  }
  const snapshot = input.live.snapshot;
  if (!isValidSnapshot(snapshot)) {
    return blockedReport(mode, 'INVALID_INPUT', 'Live snapshot structure is malformed');
  }
  if (!Array.isArray(input.live.findings)) {
    return blockedReport(mode, 'INVALID_INPUT', 'Live metadata findings must be an array');
  }
  if (input.live.complete !== true) {
    return blockedReport(mode, 'LIVE_SNAPSHOT_INCOMPLETE', 'Live metadata snapshot is incomplete; object absence cannot be inferred');
  }
  if (input.live.findings.some((finding) => finding.severity === 'error')) {
    return blockedReport(mode, 'LIVE_SNAPSHOT_INCOMPLETE', 'Live metadata contains error findings; object absence cannot be inferred', `${input.live.findings.filter((finding) => finding.severity === 'error').length} error finding(s)`);
  }
  if (snapshot.unsupportedObjects.length > 0) {
    return blockedReport(mode, 'UNSUPPORTED_OBJECT', 'Live snapshot contains unsupported objects', `${snapshot.unsupportedObjects.length} unsupported object(s)`);
  }
  if (Object.values(snapshot.tables).some((table) => table.exact !== true) || Object.values(snapshot.triggers).some((trigger) => trigger.exact !== true)) {
    return blockedReport(mode, 'INDETERMINATE_OBJECT', 'Live snapshot contains inexact signatures; object comparison would be indeterminate');
  }

  const runtime = normalizeRuntimeObjects(input.runtimeObjects);
  if (!runtime) return blockedReport(mode, 'INVALID_INPUT', 'runtimeObjects must be an array of strings');

  for (const name of Object.keys(input.manifest.schema.tables)) {
    if (runtime.has(normalizeName(name))) {
      return blockedReport(mode, 'RUNTIME_OBJECT_EXPECTED', 'Manifest expects a table that is on the runtime allowlist', name);
    }
  }
  for (const name of Object.keys(snapshot.tables)) {
    if (runtime.has(normalizeName(name))) {
      return blockedReport(mode, 'RUNTIME_OBJECT_IN_SNAPSHOT', 'Runtime allowlisted table must not appear in the comparison snapshot', name);
    }
  }

  const runtimeFindings: ComparisonFinding[] = [];
  for (const name of snapshot.runtimeObjects) {
    if (runtime.has(normalizeName(name))) {
      add(runtimeFindings, 'RUNTIME_OBJECT_IGNORED', 'info', 'info', mode, name, `runtimeObjects.${normalizeName(name)}`, 'Runtime object is excluded from schema comparison', name, null);
    } else {
      add(
        runtimeFindings,
        'UNEXPECTED_RUNTIME_OBJECT',
        'extra',
        mode === 'tierB' ? 'error' : 'warning',
        mode,
        name,
        `runtimeObjects.${normalizeName(name)}`,
        'Runtime object is not on the explicit allowlist',
        null,
        name,
      );
    }
  }

  return mode === 'tierA'
    ? compareTierA(input, snapshot, runtimeFindings)
    : compareTierB(input, snapshot, runtime, runtimeFindings);
}
