import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectRoot } from './migration-guard-test-helper.js';
import {
  compareSchemas,
  type ComparisonMode,
  type SchemaCompareInput,
  type SchemaComparisonReport,
} from '../baseline/schema-compare.js';
import type { BaselineRequirements, Manifest } from '../baseline/baseline-manifest.js';
import type { LiveMetadataReport } from '../baseline/live-metadata.js';
import type { StaticValidationReport } from '../baseline/static-validation.js';

const STATIC_OK: StaticValidationReport = {
  ok: true,
  findings: [],
  summary: {
    baselineSha256: '0'.repeat(64),
    schemaHead: '205',
    tableCount: 329,
    triggerCount: 19,
    pinCount: 74,
    migrationCount: 212,
    objectCount: 348,
    findings: 0,
  },
  hashes: {
    baseline: '0'.repeat(64),
    requirements: '1'.repeat(64),
    inventory: '2'.repeat(64),
    object: '3'.repeat(64),
    schema: '4'.repeat(64),
    migrations: '5'.repeat(64),
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function liveFromManifest(manifest: Manifest): LiveMetadataReport {
  const tables: LiveMetadataReport['snapshot'] extends infer Snapshot
    ? Snapshot extends { tables: infer Tables }
      ? Tables
      : never
    : never = {};
  const triggers: Record<string, unknown> = {};
  // The casts below are fixture construction only; the comparator validates the
  // runtime shape before using it.
  const tableMap = tables as Record<string, unknown>;
  const triggerMap = triggers as Record<string, unknown>;
  for (const [name, record] of Object.entries(manifest.schema.tables)) {
    tableMap[name] = {
      name,
      signature: clone(record.signature),
      objectSha256: record.objectSha256,
      exact: true,
      source: 'show_create',
    };
  }
  for (const [name, record] of Object.entries(manifest.schema.triggers)) {
    triggerMap[name] = {
      name,
      signature: clone(record.signature),
      objectSha256: record.objectSha256,
      exact: true,
      source: 'show_create',
    };
  }
  return {
    ok: true,
    complete: true,
    findings: [],
    snapshot: {
      database: {
        name: 'courtzon_v3',
        version: '8.0.36',
        versionComment: 'MySQL Community Server - GPL',
        serverFamily: 'mysql',
        lowerCaseTableNames: 0,
      },
      tables: tableMap as any,
      triggers: triggerMap as any,
      runtimeObjects: ['migration_history'],
      views: [],
      unsupportedObjects: [],
      snapshotSha256: '0'.repeat(64),
    },
  };
}

let manifest: Manifest;
let requirements: BaselineRequirements;
let live: LiveMetadataReport;

beforeAll(() => {
  manifest = JSON.parse(readFileSync(resolve(projectRoot, 'database/baseline/001_courtzon_v3.manifest.json'), 'utf8')) as Manifest;
  requirements = JSON.parse(readFileSync(resolve(projectRoot, 'database/baseline/baseline-requirements.json'), 'utf8')) as BaselineRequirements;
  live = liveFromManifest(manifest);
});

function baseInput(mode: ComparisonMode): SchemaCompareInput {
  return {
    mode,
    staticValidation: STATIC_OK,
    manifest,
    requirements,
    live,
    runtimeObjects: ['migration_history'],
  };
}

function compare(mode: ComparisonMode, overrides: Partial<SchemaCompareInput> = {}): SchemaComparisonReport {
  return compareSchemas({ ...baseInput(mode), ...overrides });
}

function manifestWith(mutator: (value: Manifest) => void): Manifest {
  const copy = clone(manifest);
  mutator(copy);
  return copy;
}

function liveWith(mutator: (value: LiveMetadataReport) => void): LiveMetadataReport {
  const copy = clone(live);
  mutator(copy);
  return copy;
}

function codes(report: SchemaComparisonReport): string[] {
  return report.findings.map((finding) => finding.code);
}

function expectCode(report: SchemaComparisonReport, code: string): void {
  expect(report.status).not.toBe('ok');
  expect(codes(report)).toContain(code);
}

describe('schema comparison — full committed fixtures', () => {
  it('passes Tier A for all 74 requirements pins without requiring non-pinned tables', () => {
    const report = compare('tierA');
    expect(report.status).toBe('ok');
    expect(report.complete).toBe(true);
    expect(report.summary.pinsChecked).toBe(74);
    expect(report.summary.expectedTables).toBe(329);
    expect(report.summary.liveTables).toBe(329);
    expect(report.summary.expectedTriggers).toBe(19);
    expect(report.summary.liveTriggers).toBe(19);
    expect(report.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
  });

  it('passes Tier B for the complete 329-table / 19-trigger inventory', () => {
    const report = compare('tierB');
    expect(report.status).toBe('ok');
    expect(report.complete).toBe(true);
    expect(report.summary.expectedTables).toBe(329);
    expect(report.summary.liveTables).toBe(329);
    expect(report.summary.expectedTriggers).toBe(19);
    expect(report.summary.liveTriggers).toBe(19);
    expect(report.findings.filter((finding) => finding.severity === 'error')).toEqual([]);
  });
});

describe('schema comparison — Tier A semantics', () => {
  it('does not report a missing non-pinned table as a Tier A failure', () => {
    const missingNonPinned = liveWith((value) => {
      delete value.snapshot!.tables.ad_campaigns;
    });
    const report = compare('tierA', { live: missingNonPinned });
    expect(report.status).toBe('ok');
    expect(codes(report)).not.toContain('MISSING_TABLE');
  });

  it('reports a missing pinned table', () => {
    const missingPinned = liveWith((value) => {
      delete value.snapshot!.tables.payment_allocations;
    });
    const report = compare('tierA', { live: missingPinned });
    expectCode(report, 'MISSING_TABLE');
    expect(report.summary.missing).toBeGreaterThan(0);
  });

  it('reports a pinned index column mismatch', () => {
    const changed = liveWith((value) => {
      const index = value.snapshot!.tables.payment_transactions.signature.indexes.find((candidate) => candidate.name === 'idx_pt_status_created');
      index!.columns = [...index!.columns].reverse();
    });
    expectCode(compare('tierA', { live: changed }), 'INDEX_COLUMNS_MISMATCH');
  });

  it('normalizes omitted/RESTRICT/NO ACTION FK actions', () => {
    const noAction = liveWith((value) => {
      const foreignKey = value.snapshot!.tables.payment_allocations.signature.foreignKeys.find((candidate) => candidate.name === 'fk_pa_payment_transaction');
      foreignKey!.onDelete = 'NO ACTION';
    });
    const normalized = compare('tierA', { live: noAction });
    expect(normalized.status).toBe('ok');
    expect(codes(normalized)).not.toContain('FK_ACTION_MISMATCH');

    const cascade = liveWith((value) => {
      const foreignKey = value.snapshot!.tables.payment_allocations.signature.foreignKeys.find((candidate) => candidate.name === 'fk_pa_payment_transaction');
      foreignKey!.onDelete = 'CASCADE';
    });
    expectCode(compare('tierA', { live: cascade }), 'FK_ACTION_MISMATCH');
  });

  it('reports a missing pinned trigger', () => {
    const missing = liveWith((value) => {
      delete value.snapshot!.triggers.trg_order_status_change;
    });
    const report = compare('tierA', { live: missing });
    expectCode(report, 'MISSING_TRIGGER');
  });
});

describe('schema comparison — Tier B missing / extra / mismatch', () => {
  it('reports a missing table in Tier B', () => {
    const missing = liveWith((value) => {
      delete value.snapshot!.tables.ad_campaigns;
    });
    const report = compare('tierB', { live: missing });
    expectCode(report, 'MISSING_TABLE');
    expect(report.summary.missing).toBe(1);
  });

  it('reports an extra table and extra view in Tier B', () => {
    const extra = liveWith((value) => {
      const source = value.snapshot!.tables.ad_campaigns;
      value.snapshot!.tables.unexpected_table = {
        ...clone(source),
        name: 'unexpected_table',
        signature: { ...clone(source.signature), name: 'unexpected_table' },
      };
      value.snapshot!.views.push('unexpected_view');
    });
    const report = compare('tierB', { live: extra });
    expectCode(report, 'EXTRA_TABLE');
    expectCode(report, 'EXTRA_VIEW');
    expect(report.summary.extra).toBeGreaterThanOrEqual(2);
  });

  it('reports table engine/charset/collation differences', () => {
    const changed = liveWith((value) => {
      const table = value.snapshot!.tables.ad_campaigns.signature;
      table.engine = 'MyISAM';
      table.characterSet = 'latin1';
      table.collation = 'latin1_swedish_ci';
    });
    const report = compare('tierB', { live: changed });
    expectCode(report, 'TABLE_ENGINE_MISMATCH');
    expectCode(report, 'TABLE_CHARSET_MISMATCH');
    expectCode(report, 'TABLE_COLLATION_MISMATCH');
  });

  it('reports type and extra-column differences; column order is non-semantic by default', () => {
    const order = liveWith((value) => {
      const columns = value.snapshot!.tables.payment_allocations.signature.columns;
      [columns[4], columns[5]] = [columns[5], columns[4]];
    });
    expect(codes(compare('tierB', { live: order }))).not.toContain('COLUMN_ORDER_MISMATCH');
    expectCode(compare('tierB', { live: order, columnOrder: 'strict' }), 'COLUMN_ORDER_MISMATCH');

    const type = liveWith((value) => {
      const column = value.snapshot!.tables.payment_allocations.signature.columns.find((candidate) => candidate.name === 'currency');
      column!.type = 'varchar(3)';
    });
    expectCode(compare('tierB', { live: type }), 'COLUMN_TYPE_MISMATCH');

    const extra = liveWith((value) => {
      const table = value.snapshot!.tables.ad_campaigns.signature;
      table.columns.push({ ...clone(table.columns[0]), name: 'unexpected_column' });
    });
    expectCode(compare('tierB', { live: extra }), 'EXTRA_COLUMN');
  });

  it('reports index columns, uniqueness and extra indexes', () => {
    const columns = liveWith((value) => {
      const index = value.snapshot!.tables.payment_transactions.signature.indexes.find((candidate) => candidate.name === 'idx_pt_status_created');
      index!.columns = [...index!.columns].reverse();
    });
    expectCode(compare('tierB', { live: columns }), 'INDEX_COLUMNS_MISMATCH');

    const unique = liveWith((value) => {
      const index = value.snapshot!.tables.payment_allocations.signature.indexes.find((candidate) => candidate.name === 'idx_pa_booking');
      index!.unique = true;
      index!.kind = 'UNIQUE';
    });
    const uniqueReport = compare('tierB', { live: unique });
    expectCode(uniqueReport, 'INDEX_UNIQUENESS_MISMATCH');
    expectCode(uniqueReport, 'INDEX_KIND_MISMATCH');

    const extra = liveWith((value) => {
      const table = value.snapshot!.tables.payment_allocations.signature;
      table.indexes.push({
        name: 'idx_unexpected',
        kind: 'KEY',
        unique: false,
        columns: [{ name: 'id', desc: false, prefixLength: null }],
      });
    });
    expectCode(compare('tierB', { live: extra }), 'EXTRA_INDEX');
  });

  it('reports FK action differences but normalizes NO ACTION', () => {
    const cascade = liveWith((value) => {
      const foreignKey = value.snapshot!.tables.payment_allocations.signature.foreignKeys.find((candidate) => candidate.name === 'fk_pa_payment_transaction');
      foreignKey!.onDelete = 'CASCADE';
    });
    expectCode(compare('tierB', { live: cascade }), 'FK_ACTION_MISMATCH');

    const noAction = liveWith((value) => {
      const foreignKey = value.snapshot!.tables.payment_allocations.signature.foreignKeys.find((candidate) => candidate.name === 'fk_pa_payment_transaction');
      foreignKey!.onDelete = 'NO ACTION';
    });
    expect(compare('tierB', { live: noAction }).status).toBe('ok');
  });

  it('reports named check expression changes', () => {
    const changed = liveWith((value) => {
      const check = value.snapshot!.tables.financial_entitlements.signature.checks[0];
      check.expression = 'json_valid(`metadata`) = 0';
    });
    expectCode(compare('tierB', { live: changed }), 'CHECK_EXPRESSION_MISMATCH');
  });

  it('matches anonymous checks by canonical expression multiset', () => {
    const expected = manifestWith((value) => {
      value.schema.tables.payment_allocations.signature.checks.push({ name: null, expression: '`status` <> \'refunded\'' });
    });
    const matched = liveWith((value) => {
      value.snapshot!.tables.payment_allocations.signature.checks.push({ name: 'tbl_chk_auto', expression: '`status` <> \'refunded\'' });
    });
    expect(compare('tierB', { manifest: expected, live: matched }).status).toBe('ok');

    const changed = liveWith((value) => {
      value.snapshot!.tables.payment_allocations.signature.checks.push({ name: 'tbl_chk_auto', expression: '`status` <> \'allocated\'' });
    });
    const report = compare('tierB', { manifest: expected, live: changed });
    expectCode(report, 'MISSING_CHECK');
    expectCode(report, 'EXTRA_CHECK');
  });

  it('reports missing and extra columns, indexes, foreign keys and checks', () => {
    const missingColumn = liveWith((value) => {
      value.snapshot!.tables.ad_campaigns.signature.columns.pop();
    });
    expectCode(compare('tierB', { live: missingColumn }), 'MISSING_COLUMN');

    const missingIndex = liveWith((value) => {
      const table = value.snapshot!.tables.payment_allocations.signature;
      table.indexes = table.indexes.filter((index) => index.name !== 'idx_pa_booking');
    });
    expectCode(compare('tierB', { live: missingIndex }), 'MISSING_INDEX');

    const missingForeignKey = liveWith((value) => {
      const table = value.snapshot!.tables.payment_allocations.signature;
      table.foreignKeys = table.foreignKeys.filter((foreignKey) => foreignKey.name !== 'fk_pa_booking');
    });
    expectCode(compare('tierB', { live: missingForeignKey }), 'MISSING_FOREIGN_KEY');

    const missingCheck = liveWith((value) => {
      value.snapshot!.tables.financial_entitlements.signature.checks = [];
    });
    expectCode(compare('tierB', { live: missingCheck }), 'MISSING_CHECK');

    const extraForeignKey = liveWith((value) => {
      const table = value.snapshot!.tables.payment_allocations.signature;
      const source = table.foreignKeys.find((foreignKey) => foreignKey.name === 'fk_pa_booking')!;
      table.foreignKeys.push({ ...clone(source), name: 'fk_unexpected' });
    });
    expectCode(compare('tierB', { live: extraForeignKey }), 'EXTRA_FOREIGN_KEY');

    const extraCheck = liveWith((value) => {
      value.snapshot!.tables.financial_entitlements.signature.checks.push({ name: 'chk_unexpected', expression: '1 = 1' });
    });
    expectCode(compare('tierB', { live: extraCheck }), 'EXTRA_CHECK');
  });

  it('reports trigger identity/body and extra/missing triggers', () => {
    const missing = liveWith((value) => {
      delete value.snapshot!.triggers.trg_order_status_change;
    });
    expectCode(compare('tierB', { live: missing }), 'MISSING_TRIGGER');

    const body = liveWith((value) => {
      value.snapshot!.triggers.trg_order_status_change.signature.body = 'BEGIN END';
    });
    expectCode(compare('tierB', { live: body }), 'TRIGGER_BODY_MISMATCH');

    const extra = liveWith((value) => {
      const source = value.snapshot!.triggers.trg_order_status_change;
      value.snapshot!.triggers.trg_unexpected = { ...clone(source), name: 'trg_unexpected', signature: { ...clone(source.signature), name: 'trg_unexpected' } };
    });
    expectCode(compare('tierB', { live: extra }), 'EXTRA_TRIGGER');
  });
});

describe('schema comparison — normalization corrections (P8.6.13)', () => {
  function compareColumn(
    tableName: string,
    columnName: string,
    expected: { type: string; default: string | null },
    actual: { type: string; default: string | null },
  ): SchemaComparisonReport {
    const expectedManifest = manifestWith((value) => {
      const column = value.schema.tables[tableName].signature.columns.find((candidate) => candidate.name === columnName);
      if (!column) throw new Error(`missing fixture column ${tableName}.${columnName}`);
      column.type = expected.type;
      column.default = expected.default;
    });
    const actualLive = liveWith((value) => {
      const column = value.snapshot!.tables[tableName].signature.columns.find((candidate) => candidate.name === columnName);
      if (!column) throw new Error(`missing fixture column ${tableName}.${columnName}`);
      column.type = actual.type;
      column.default = actual.default;
    });
    return compare('tierB', { manifest: expectedManifest, live: actualLive });
  }

  function compareChecks(
    tableName: string,
    checkName: string,
    expectedExpression: string,
    actualExpression: string,
  ): SchemaComparisonReport {
    const expectedManifest = manifestWith((value) => {
      value.schema.tables[tableName].signature.checks = [{ name: checkName, expression: expectedExpression }];
    });
    const actualLive = liveWith((value) => {
      value.snapshot!.tables[tableName].signature.checks = [{ name: checkName, expression: actualExpression }];
    });
    return compare('tierB', { manifest: expectedManifest, live: actualLive });
  }

  it('normalizes quoted numerics, decimal equivalents and absent-vs-NULL defaults', () => {
    const quotedNumeric = compareColumn(
      'year_closings', 'close_count',
      { type: 'int unsigned', default: "'1'" },
      { type: 'int unsigned', default: '1' },
    );
    expect(codes(quotedNumeric)).not.toContain('COLUMN_DEFAULT_MISMATCH');

    const decimalEquivalent = compareColumn(
      'year_close_cycles', 'net_income',
      { type: 'decimal(14,2)', default: "'0.00'" },
      { type: 'decimal(14,2)', default: '0.000' },
    );
    expect(codes(decimalEquivalent)).not.toContain('COLUMN_DEFAULT_MISMATCH');

    const absentVersusNull = compareColumn(
      'academies', 'image_url',
      { type: 'varchar(500)', default: null },
      { type: 'varchar(500)', default: 'null' },
    );
    expect(codes(absentVersusNull)).not.toContain('COLUMN_DEFAULT_MISMATCH');
  });

  it('still reports genuinely different numeric and string defaults', () => {
    const numericDifference = compareColumn(
      'year_closings', 'close_count',
      { type: 'int unsigned', default: "'1'" },
      { type: 'int unsigned', default: '2' },
    );
    expectCode(numericDifference, 'COLUMN_DEFAULT_MISMATCH');

    // A character column must NOT be numerically collapsed: '01' != '1'.
    const stringDifference = compareColumn(
      'year_closings', 'reopen_reason',
      { type: 'varchar(500)', default: "'1'" },
      { type: 'varchar(500)', default: "'01'" },
    );
    expectCode(stringDifference, 'COLUMN_DEFAULT_MISMATCH');
  });

  it('ignores redundant parentheses around an atomic expression', () => {
    const report = compareChecks(
      'coach_reviews', 'coach_reviews_chk_1',
      '((rating between 1 and 5))',
      'rating between 1 and 5',
    );
    expect(codes(report)).not.toContain('CHECK_EXPRESSION_MISMATCH');
  });

  it('does not remove meaningful parentheses or alter string contents', () => {
    const meaningful = compareChecks(
      'coach_reviews', 'coach_reviews_chk_1',
      '(rating = 1 and rating = 2) or rating = 3',
      'rating = 1 and rating = 2 or rating = 3',
    );
    expectCode(meaningful, 'CHECK_EXPRESSION_MISMATCH');

    const operandGroup = compareChecks(
      'coach_reviews', 'coach_reviews_chk_1',
      '(rating = 1) = (rating = 2)',
      'rating = 1 = rating = 2',
    );
    expectCode(operandGroup, 'CHECK_EXPRESSION_MISMATCH');

    const booleanGroup = compareChecks(
      'coach_reviews', 'coach_reviews_chk_1',
      '(rating = 1) and (rating = 2)',
      'rating = 1 and rating = 2',
    );
    expect(codes(booleanGroup)).not.toContain('CHECK_EXPRESSION_MISMATCH');

    const sameString = compareChecks(
      'coach_reviews', 'coach_reviews_chk_1',
      "status = ('x(y)')",
      "status = 'x(y)'",
    );
    expect(codes(sameString)).not.toContain('CHECK_EXPRESSION_MISMATCH');

    const changedString = compareChecks(
      'coach_reviews', 'coach_reviews_chk_1',
      "status = 'x(y)'",
      "status = 'xy'",
    );
    expectCode(changedString, 'CHECK_EXPRESSION_MISMATCH');
  });

  it('ignores charset introducers before string literals in generated expressions', () => {
    const expectedManifest = manifestWith((value) => {
      const column = value.schema.tables.tournament_competitions.signature.columns.find((candidate) => candidate.name === 'default_flag');
      if (!column) throw new Error('missing generated fixture column');
      column.generated = "if(is_default = 1,_utf8mb4'D',null)";
    });
    const actualLive = liveWith((value) => {
      const column = value.snapshot!.tables.tournament_competitions.signature.columns.find((candidate) => candidate.name === 'default_flag');
      if (!column) throw new Error('missing generated fixture column');
      column.generated = "if(is_default = 1,'D',null)";
    });
    const report = compare('tierB', { manifest: expectedManifest, live: actualLive });
    expect(codes(report)).not.toContain('COLUMN_GENERATED_MISMATCH');

    const latin1 = compareChecks(
      'coach_reviews', 'coach_reviews_chk_1',
      "status = _latin1'done'",
      "status = 'done'",
    );
    expect(codes(latin1)).not.toContain('CHECK_EXPRESSION_MISMATCH');
  });

  it('ignores only insignificant trailing trigger delimiters', () => {
    const trailing = liveWith((value) => {
      const trigger = value.snapshot!.triggers.trg_order_after_insert.signature;
      trigger.body = `${trigger.body};   `;
    });
    const trailingReport = compare('tierB', { live: trailing });
    expect(codes(trailingReport)).not.toContain('TRIGGER_BODY_MISMATCH');

    const reorderedManifest = manifestWith((value) => {
      value.schema.triggers.trg_order_after_insert.signature.body = 'begin set @a = 1; set @b = 2; end';
    });
    const reorderedLive = liveWith((value) => {
      value.snapshot!.triggers.trg_order_after_insert.signature.body = 'begin set @b = 2; set @a = 1; end';
    });
    const reorderedReport = compare('tierB', { manifest: reorderedManifest, live: reorderedLive });
    expectCode(reorderedReport, 'TRIGGER_BODY_MISMATCH');
  });

  it('ignores a live index only when it matches an expected FK name and columns', () => {
    const implicit = liveWith((value) => {
      const table = value.snapshot!.tables.wishlist_items.signature;
      table.indexes.push({
        name: 'fk_wish_user',
        kind: 'KEY',
        unique: false,
        columns: [{ name: 'user_id', desc: false, prefixLength: null }],
      });
    });
    expect(codes(compare('tierB', { live: implicit }))).not.toContain('EXTRA_INDEX');

    const differentColumns = liveWith((value) => {
      const table = value.snapshot!.tables.wishlist_items.signature;
      table.indexes.push({
        name: 'fk_wish_user',
        kind: 'KEY',
        unique: false,
        columns: [{ name: 'product_id', desc: false, prefixLength: null }],
      });
    });
    expectCode(compare('tierB', { live: differentColumns }), 'EXTRA_INDEX');

    const independentName = liveWith((value) => {
      const table = value.snapshot!.tables.wishlist_items.signature;
      table.indexes.push({
        name: 'idx_independent_user',
        kind: 'KEY',
        unique: false,
        columns: [{ name: 'user_id', desc: false, prefixLength: null }],
      });
    });
    expectCode(compare('tierB', { live: independentName }), 'EXTRA_INDEX');

    const uniqueImplicitName = liveWith((value) => {
      const table = value.snapshot!.tables.wishlist_items.signature;
      table.indexes.push({
        name: 'fk_wish_user',
        kind: 'UNIQUE',
        unique: true,
        columns: [{ name: 'user_id', desc: false, prefixLength: null }],
      });
    });
    expectCode(compare('tierB', { live: uniqueImplicitName }), 'EXTRA_INDEX');
  });

  it('treats column order as non-semantic by default and strict only on request', () => {
    const reordered = liveWith((value) => {
      const columns = value.snapshot!.tables.wishlist_items.signature.columns;
      [columns[1], columns[2]] = [columns[2], columns[1]];
    });
    expect(codes(compare('tierB', { live: reordered }))).not.toContain('COLUMN_ORDER_MISMATCH');
    expectCode(compare('tierB', { live: reordered, columnOrder: 'strict' }), 'COLUMN_ORDER_MISMATCH');
  });
});

describe('schema comparison — column-order policy (Decision 3B)', () => {
  it('does not fail a pure ordinal move by default', () => {
    const reordered = liveWith((value) => {
      const columns = value.snapshot!.tables.payment_transactions.signature.columns;
      [columns[4], columns[5]] = [columns[5], columns[4]];
    });
    const report = compare('tierB', { live: reordered });
    expect(codes(report)).not.toContain('COLUMN_ORDER_MISMATCH');
  });

  it('reports the same ordinal move when strict order is requested', () => {
    const reordered = liveWith((value) => {
      const columns = value.snapshot!.tables.payment_transactions.signature.columns;
      [columns[4], columns[5]] = [columns[5], columns[4]];
    });
    expectCode(compare('tierB', { live: reordered, columnOrder: 'strict' }), 'COLUMN_ORDER_MISMATCH');
  });

  it('still reports missing columns under the non-semantic default', () => {
    const missing = liveWith((value) => {
      const columns = value.snapshot!.tables.payment_allocations.signature.columns;
      const index = columns.findIndex((column) => column.name === 'currency');
      columns.splice(index, 1);
    });
    expectCode(compare('tierB', { live: missing }), 'MISSING_COLUMN');
  });

  it('still reports type mismatches under the non-semantic default', () => {
    const changed = liveWith((value) => {
      const column = value.snapshot!.tables.payment_allocations.signature.columns.find(
        (candidate) => candidate.name === 'currency',
      );
      column!.type = 'varchar(3)';
    });
    expectCode(compare('tierB', { live: changed }), 'COLUMN_TYPE_MISMATCH');
  });

  it('keeps index column order strict', () => {
    const reordered = liveWith((value) => {
      const index = value.snapshot!.tables.payment_transactions.signature.indexes.find(
        (candidate) => candidate.name === 'idx_pt_status_created',
      );
      index!.columns = [...index!.columns].reverse();
    });
    expectCode(compare('tierB', { live: reordered }), 'INDEX_COLUMNS_MISMATCH');
  });

  it('keeps foreign-key definitions strict', () => {
    const changed = liveWith((value) => {
      const foreignKey = value.snapshot!.tables.payment_allocations.signature.foreignKeys.find(
        (candidate) => candidate.name === 'fk_pa_booking',
      );
      foreignKey!.columns = ['series_id'];
    });
    expectCode(compare('tierB', { live: changed }), 'FK_COLUMNS_MISMATCH');
  });
});

describe('schema comparison — runtime allowlist', () => {
  it('reports allowlisted runtime objects and blocks runtime objects inside the comparison snapshot', () => {
    const info = compare('tierB');
    expect(codes(info)).toContain('RUNTIME_OBJECT_IGNORED');

    const runtimeInSnapshot = liveWith((value) => {
      const source = value.snapshot!.tables.ad_campaigns;
      value.snapshot!.tables.migration_history = {
        ...clone(source),
        name: 'migration_history',
        signature: { ...clone(source.signature), name: 'migration_history' },
      };
    });
    const blocked = compare('tierB', { live: runtimeInSnapshot });
    expect(blocked.status).toBe('blocked');
    expect(blocked.fatal?.code).toBe('RUNTIME_OBJECT_IN_SNAPSHOT');
  });

  it('blocks a manifest that expects a runtime object', () => {
    const expectedRuntime = manifestWith((value) => {
      const source = value.schema.tables.ad_campaigns;
      value.schema.tables.migration_history = { ...clone(source), signature: { ...clone(source.signature), name: 'migration_history' } };
    });
    const report = compare('tierB', { manifest: expectedRuntime });
    expect(report.status).toBe('blocked');
    expect(report.fatal?.code).toBe('RUNTIME_OBJECT_EXPECTED');
  });

  it('reports an unallowlisted runtime object', () => {
    const unknown = liveWith((value) => {
      value.snapshot!.runtimeObjects.push('other_runtime');
    });
    const tierB = compare('tierB', { live: unknown });
    expectCode(tierB, 'UNEXPECTED_RUNTIME_OBJECT');
    const tierA = compare('tierA', { live: unknown });
    expect(tierA.status).toBe('ok');
    const warning = tierA.findings.find((finding) => finding.code === 'UNEXPECTED_RUNTIME_OBJECT');
    expect(warning?.severity).toBe('warning');
  });
});

describe('schema comparison — fail closed', () => {
  it('blocks when V1 static validation failed', () => {
    const report = compare('tierB', { staticValidation: { ...STATIC_OK, ok: false } });
    expect(report.status).toBe('blocked');
    expect(report.complete).toBe(false);
    expect(report.fatal?.code).toBe('STATIC_VALIDATION_FAILED');
    expect(codes(report)).not.toContain('MISSING_TABLE');
  });

  it('blocks incomplete snapshots without producing false missing findings', () => {
    const report = compare('tierB', { live: { ...live, complete: false } });
    expect(report.status).toBe('blocked');
    expect(report.fatal?.code).toBe('LIVE_SNAPSHOT_INCOMPLETE');
    expect(codes(report)).not.toContain('MISSING_TABLE');
  });

  it('blocks inexact and unsupported snapshots', () => {
    const inexact = liveWith((value) => {
      value.snapshot!.tables.payment_allocations.exact = false;
    });
    expect(compare('tierB', { live: inexact }).fatal?.code).toBe('INDETERMINATE_OBJECT');

    const unsupported = liveWith((value) => {
      value.snapshot!.unsupportedObjects.push({ kind: 'index', name: 'x.y', reason: 'functional index' });
    });
    expect(compare('tierB', { live: unsupported }).fatal?.code).toBe('UNSUPPORTED_OBJECT');
  });

  it('blocks unavailable live reports and invalid modes', () => {
    const unavailable = compare('tierB', { live: { ...live, ok: false } });
    expect(unavailable.fatal?.code).toBe('LIVE_SNAPSHOT_UNAVAILABLE');

    const invalidMode = compareSchemas({ ...baseInput('tierA'), mode: 'tierC' as ComparisonMode });
    expect(invalidMode.status).toBe('blocked');
    expect(invalidMode.mode).toBe('invalid');
    expect(invalidMode.fatal?.code).toBe('INVALID_MODE');
  });

  it('blocks malformed manifest input', () => {
    const malformed = clone(manifest) as unknown as Record<string, unknown>;
    (malformed.schema as Record<string, unknown>).tables = null;
    const report = compare('tierB', { manifest: malformed as unknown as Manifest });
    expect(report.status).toBe('blocked');
    expect(report.fatal?.code).toBe('INVALID_INPUT');
  });
});

describe('schema comparison — determinism and summary', () => {
  it('returns deterministic sorted findings and stable summary counts', () => {
    const changed = liveWith((value) => {
      const table = value.snapshot!.tables.payment_allocations.signature;
      table.columns[4].type = 'varchar(3)';
      const index = value.snapshot!.tables.payment_transactions.signature.indexes.find((candidate) => candidate.name === 'idx_pt_status_created');
      index!.columns = [...index!.columns].reverse();
    });
    const first = compare('tierB', { live: changed });
    const second = compare('tierB', { live: changed });
    expect(first.findings).toEqual(second.findings);
    expect(first.summary).toEqual(second.summary);
    expect(first.status).toBe('drift');
    expect(first.summary.mismatched).toBeGreaterThanOrEqual(2);
    const paths = first.findings.map((finding) => `${finding.code}|${finding.path}`);
    expect(paths).toEqual([...paths].sort());
  });
});
