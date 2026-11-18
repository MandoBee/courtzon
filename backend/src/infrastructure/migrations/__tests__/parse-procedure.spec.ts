// ============================================================================
// CourtZon — DELIMITER / CREATE PROCEDURE parser contract (no database, no I/O
// outside the repository's committed migration SQL).
//
// Migration 211 wraps a DML-only permission-grant routine in a custom
// delimiter. These tests pin the narrow parser extension that accepts that
// exact construct in migration mode while keeping every fail-closed rule for
// unsupported CREATE targets and concealed schema DDL.
// ============================================================================
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BaselineParseError,
  hasSchemaDdl,
  parseSql,
  type ParseMode,
} from '../baseline/parse-baseline.js';
import { classifyMigration } from '../baseline/baseline-manifest.js';
import { projectRoot } from './migration-guard-test-helper.js';

const MIGRATION_211 = join(
  projectRoot,
  'database/migrations/211_inventory_p1_permissions_grants.sql',
);

function procedure(body: string[] = ['  INSERT INTO `t` (`id`) VALUES (1);']): string {
  return [
    'DELIMITER $$',
    'CREATE PROCEDURE p() SQL SECURITY INVOKER',
    'BEGIN',
    ...body,
    'END$$',
    'DELIMITER ;',
    'CALL p();',
    '',
  ].join('\n');
}

function expectParseError(sql: string, mode: ParseMode, pattern: RegExp): void {
  expect(() => parseSql(sql, mode)).toThrow(BaselineParseError);
  expect(() => parseSql(sql, mode)).toThrow(pattern);
}

describe('CREATE PROCEDURE — supported migration-only construct', () => {
  it('keeps a DELIMITER-terminated routine body in one top-level statement', () => {
    const sql = procedure([
      '  INSERT INTO `t` (`id`) VALUES (1);',
      '  UPDATE `t` SET `id` = 2 WHERE `id` = 1;',
      '  DELETE FROM `t` WHERE `id` = 2;',
    ]);
    const parsed = parseSql(sql, 'migration');

    expect(parsed.statementCount).toBe(2);
    expect(parsed.delimiterDirectives).toEqual([
      { value: '$$', line: 1 },
      { value: ';', line: 8 },
    ]);
    expect(parsed.tables).toEqual([]);
    expect(parsed.triggers).toEqual([]);
    expect(parsed.alters).toEqual([]);
    expect(parsed.droppedTables).toEqual([]);
    expect(parsed.preparedDdl.dropTables).toEqual([]);
    expect(hasSchemaDdl(sql)).toBe(false);
  });

  it('parses statements after the routine normally', () => {
    const parsed = parseSql(procedure(), 'migration');
    expect(parsed.dataStatements).toEqual([]);
    expect(parsed.statementCount).toBe(2);
  });

  it('parses the real migration 211 as a non-schema, PRODUCTION_SAFE head', () => {
    const sql = readFileSync(MIGRATION_211, 'utf8');
    const parsed = parseSql(sql, 'migration');

    expect(parsed.statementCount).toBe(3);
    expect(parsed.delimiterDirectives).toEqual([
      { value: '$$', line: 49 },
      { value: ';', line: 721 },
    ]);
    expect(parsed.tables).toEqual([]);
    expect(parsed.triggers).toEqual([]);
    expect(parsed.alters).toEqual([]);
    expect(parsed.droppedTables).toEqual([]);
    expect(parsed.preparedDdl.dropTables).toEqual([]);
    expect(hasSchemaDdl(sql)).toBe(false);
    expect(classifyMigration(sql).classification).toBe('PRODUCTION_SAFE');
  });
});

describe('CREATE PROCEDURE — fail-closed contract', () => {
  it('is rejected in baseline mode', () => {
    expectParseError(procedure(), 'baseline', /unsupported CREATE target 'PROCEDURE'/);
  });

  it.each([
    ['VIEW', 'CREATE VIEW `v` AS SELECT 1;'],
    ['EVENT', 'CREATE EVENT `e` ON SCHEDULE AT CURRENT_TIMESTAMP DO SELECT 1;'],
    ['FUNCTION', 'CREATE FUNCTION `f`() RETURNS INT RETURN 1;'],
  ])('still rejects unsupported CREATE %s in migration mode', (_kind, sql) => {
    expectParseError(sql, 'migration', /unsupported CREATE target/);
  });

  it('keeps CREATE TRIGGER as a tracked schema object, not an ignored one', () => {
    const sql = 'CREATE TRIGGER `t` BEFORE INSERT ON `x` FOR EACH ROW SET @a = 1;';
    expect(parseSql(sql, 'migration').triggers).toHaveLength(1);
    expect(hasSchemaDdl(sql)).toBe(true);
    expectParseError('CREATE TRIGGER `t`;', 'migration', /expected BEFORE or AFTER/);
  });

  it('still rejects unsupported CREATE TABLE options', () => {
    expectParseError(
      "CREATE TABLE `x` (`id` int) COMPRESSION='zlib';",
      'baseline',
      /unsupported table option/,
    );
  });

  it('rejects schema DDL hidden inside the routine body', () => {
    expectParseError(
      procedure(['  CREATE TABLE `evil` (`id` int);']),
      'migration',
      /schema-mutating statement 'CREATE' is not allowed inside CREATE PROCEDURE/,
    );
    expectParseError(
      procedure(['  DROP TABLE `users`;']),
      'migration',
      /schema-mutating statement 'DROP' is not allowed inside CREATE PROCEDURE/,
    );
    expectParseError(
      procedure(['  ALTER TABLE `users` ADD COLUMN `x` int;']),
      'migration',
      /schema-mutating statement 'ALTER' is not allowed inside CREATE PROCEDURE/,
    );
  });

  it('rejects a routine without a BEGIN block', () => {
    expectParseError(
      [
        'DELIMITER $$',
        'CREATE PROCEDURE p() INSERT INTO `t` VALUES (1);',
        'END$$',
        'DELIMITER ;',
        '',
      ].join('\n'),
      'migration',
      /CREATE PROCEDURE requires a BEGIN block/,
    );
  });

  it('rejects an unterminated routine definition', () => {
    expectParseError(
      ['DELIMITER $$', 'CREATE PROCEDURE p() BEGIN', '  INSERT INTO `t` VALUES (1);', ''].join('\n'),
      'migration',
      /CREATE PROCEDURE must be closed by a custom DELIMITER/,
    );
  });

  it('rejects a routine closed with the default delimiter', () => {
    expectParseError(
      'CREATE PROCEDURE p() BEGIN INSERT INTO `t` VALUES (1); END;',
      'migration',
      /CREATE PROCEDURE must be closed by a custom DELIMITER, not ';'/,
    );
  });

  it('rejects a closing delimiter that was not declared', () => {
    expectParseError(
      ['DELIMITER //', 'CREATE PROCEDURE p() BEGIN INSERT INTO `t` VALUES (1); END$$', ''].join(
        '\n',
      ),
      'migration',
      /CREATE PROCEDURE must be closed by a custom DELIMITER/,
    );
  });

  it('does not let a delimiter change conceal DDL after the routine', () => {
    const concealedCreate = [
      'DELIMITER $$',
      'CREATE PROCEDURE p() BEGIN',
      '  INSERT INTO `t` VALUES (1);',
      'END$$',
      'CREATE TABLE `evil` (`id` int)$$',
      'DELIMITER ;',
      '',
    ].join('\n');
    expect(parseSql(concealedCreate, 'migration').tables.map((t) => t.name)).toContain('evil');
    expect(hasSchemaDdl(concealedCreate)).toBe(true);

    const concealedDrop = [
      'DELIMITER $$',
      'CREATE PROCEDURE p() BEGIN',
      '  INSERT INTO `t` VALUES (1);',
      'END$$',
      'DROP TABLE `users`$$',
      'DELIMITER ;',
      '',
    ].join('\n');
    const dropped = parseSql(concealedDrop, 'migration');
    expect(dropped.droppedTables).toContain('users');
    expect(hasSchemaDdl(concealedDrop)).toBe(true);
  });
});
