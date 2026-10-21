import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// backend/src/modules/financial/__tests__ -> five levels up to the repo root.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const SEED_PATH = resolve(REPO_ROOT, 'database', 'seeds', '004_chart_of_accounts.sql');

// The seed contains no `--` inside string literals, so stripping line/block
// comments is sufficient to prove that clauses live in executable SQL rather
// than in a comment.
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
}

interface ExpectedRow {
  name: string;
  type: string;
  description: string;
  parent: string | null;
}

const EXPECTED: Record<string, ExpectedRow> = {
  '1000': { name: 'Assets', type: 'asset', description: 'Total Assets', parent: null },
  '1100': { name: 'Current Assets', type: 'asset', description: 'Current Assets', parent: '1000' },
  '1101': { name: 'Cash', type: 'asset', description: 'Cash on hand and in banks', parent: '1100' },
  '1102': { name: 'Accounts Receivable', type: 'asset', description: 'Customer receivables', parent: '1100' },
  '1103': { name: 'Inventory', type: 'asset', description: 'Product inventory', parent: '1100' },
  '1200': { name: 'Fixed Assets', type: 'asset', description: 'Fixed Assets', parent: '1000' },
  '2000': { name: 'Liabilities', type: 'liability', description: 'Total Liabilities', parent: null },
  '2100': { name: 'Current Liabilities', type: 'liability', description: 'Current Liabilities', parent: '2000' },
  '2101': { name: 'Accounts Payable', type: 'liability', description: 'Supplier payables', parent: '2100' },
  '2102': { name: 'Tax Payable', type: 'liability', description: 'Sales tax / VAT payable', parent: '2100' },
  '2200': { name: 'Long-term Liabilities', type: 'liability', description: 'Long-term Liabilities', parent: '2000' },
  '3000': { name: 'Equity', type: 'equity', description: 'Shareholder Equity', parent: null },
  '3001': { name: 'Retained Earnings', type: 'equity', description: 'Retained earnings', parent: '3000' },
  '4000': { name: 'Revenue', type: 'revenue', description: 'Operating Revenue', parent: null },
  '4100': { name: 'Sales Revenue', type: 'revenue', description: 'Product sales revenue', parent: '4000' },
  '4101': { name: 'Booking Revenue', type: 'revenue', description: 'Court booking revenue', parent: '4000' },
  '4102': { name: 'Membership Revenue', type: 'revenue', description: 'Membership fees', parent: '4000' },
  '4103': { name: 'Academy Revenue', type: 'revenue', description: 'Academy program revenue', parent: '4000' },
  '5000': { name: 'Cost of Goods Sold', type: 'expense', description: 'COGS', parent: null },
  '6000': { name: 'Operating Expenses', type: 'expense', description: 'Operating Expenses', parent: null },
  '6100': { name: 'Salaries', type: 'expense', description: 'Employee salaries', parent: '6000' },
  '6200': { name: 'Rent', type: 'expense', description: 'Rent expense', parent: '6000' },
  '6300': { name: 'Utilities', type: 'expense', description: 'Utility expenses', parent: '6000' },
};

const SQL = readFileSync(SEED_PATH, 'utf8');
const INSERT_MARKER = 'INSERT INTO chart_of_accounts';
const UPDATE_MARKER = '-- Resolve parents by code';
const INSERT_START = SQL.indexOf(INSERT_MARKER);
const UPDATE_START = SQL.indexOf(UPDATE_MARKER);

describe('004_chart_of_accounts seed — static hierarchy contract', () => {
  it('has an INSERT section and a code-based parent-resolution section', () => {
    expect(INSERT_START, 'INSERT section not found').toBeGreaterThanOrEqual(0);
    expect(UPDATE_START, 'parent-resolution section not found').toBeGreaterThan(INSERT_START);
  });

  it('pins the SQL literal collation to chart_of_accounts.code before the seed statements', () => {
    const code = stripSqlComments(SQL);
    const collation = code.search(/SET\s+NAMES\s+utf8mb4\s+COLLATE\s+utf8mb4_unicode_ci\s*;/i);
    const transaction = code.search(/\bSTART\s+TRANSACTION\s*;/i);

    expect(collation, 'SET NAMES ... COLLATE ... not found').toBeGreaterThanOrEqual(0);
    expect(transaction).toBeGreaterThan(collation);
  });

  it('encloses the INSERT and UPDATE in one transaction in the correct order', () => {
    const code = stripSqlComments(SQL);
    const starts = [...code.matchAll(/\bSTART\s+TRANSACTION\s*;/gi)];
    const commits = [...code.matchAll(/\bCOMMIT\s*;/gi)];
    const insert = code.search(/INSERT\s+INTO\s+chart_of_accounts/i);
    const update = code.search(/UPDATE\s+chart_of_accounts\s+c\b/i);

    expect(starts).toHaveLength(1);
    expect(commits).toHaveLength(1);

    const start = starts[0]?.index ?? -1;
    const commit = commits[0]?.index ?? -1;

    expect(start, 'START TRANSACTION not found').toBeGreaterThanOrEqual(0);
    expect(commit, 'COMMIT not found').toBeGreaterThanOrEqual(0);
    expect(start).toBeLessThan(insert);
    expect(insert).toBeLessThan(update);
    expect(update).toBeLessThan(commit);
  });

  const insertSection = INSERT_START >= 0 && UPDATE_START > INSERT_START
    ? SQL.slice(INSERT_START, UPDATE_START)
    : '';
  const updateSection = UPDATE_START >= 0 ? SQL.slice(UPDATE_START) : '';

  it('inserts each of the 23 codes exactly once and preserves names/types/descriptions', () => {
    const rowRe = /\(\s*'(\d{4})'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*\)/g;
    const rows = [...insertSection.matchAll(rowRe)].map((m) => ({
      code: m[1],
      name: m[2],
      type: m[3],
      description: m[4],
    }));

    expect(rows).toHaveLength(Object.keys(EXPECTED).length);
    const codes = rows.map((r) => r.code);
    expect(new Set(codes).size, 'duplicate account codes in INSERT').toBe(codes.length);
    expect(codes.sort()).toEqual(Object.keys(EXPECTED).sort());

    for (const row of rows) {
      const expected = EXPECTED[row.code];
      expect(expected, `unexpected account code ${row.code}`).toBeDefined();
      expect(row.name).toBe(expected.name);
      expect(row.type).toBe(expected.type);
      expect(row.description).toBe(expected.description);
    }
  });

  it('does not use hard-coded numeric parent ids in the INSERT', () => {
    // The column list/rows must not contain parent_id at all; parents are
    // resolved by code in the following UPDATE.
    expect(insertSection).not.toMatch(/\bparent_id\b/);
  });

  it('maps every non-root code to exactly one existing parent; roots have no mapping', () => {
    const mapRe = /SELECT\s+'(\d{4})'(?:\s+AS\s+code)?\s*,\s*'(\d{4})'(?:\s+AS\s+parent_code)?/g;
    const pairs = [...updateSection.matchAll(mapRe)].map((m) => [m[1], m[2]] as const);
    const mapping = new Map(pairs);

    // Exactly one mapping per child code (no duplicate child entries).
    expect(pairs).toHaveLength(mapping.size);

    const insertedCodes = new Set(Object.keys(EXPECTED));
    for (const code of mapping.keys()) {
      expect(insertedCodes.has(code), `mapping for unknown code ${code}`).toBe(true);
    }

    const nonRoots = Object.entries(EXPECTED).filter(([, v]) => v.parent !== null);
    expect(mapping.size, 'one mapping per non-root account').toBe(nonRoots.length);

    for (const [code, value] of Object.entries(EXPECTED)) {
      if (value.parent === null) {
        expect(mapping.has(code), `root ${code} must not have a parent mapping`).toBe(false);
      } else {
        expect(mapping.get(code), `${code} must map to exactly one parent`).toBe(value.parent);
        expect(insertedCodes.has(value.parent), `parent ${value.parent} of ${code} must be inserted`).toBe(true);
      }
    }

    // The corrected hierarchy called out by the release review.
    expect(mapping.get('3001')).toBe('3000');
    for (const code of ['4100', '4101', '4102', '4103']) {
      expect(mapping.get(code), `${code} must sit under 4000`).toBe('4000');
    }
  });

  it('resolves parents by code and restricts the update to global accounts', () => {
    expect(updateSection).toMatch(/m\.code\s*=\s*c\.code/);
    expect(updateSection).toMatch(/p\.code\s*=\s*m\.parent_code/);
    expect(updateSection).toContain('p.organisation_id IS NULL');
    expect(updateSection).toContain('c.organisation_id IS NULL');
  });

  it('keeps the SET action and global predicates in the parent UPDATE statement itself', () => {
    // Strip comments before splitting so a clause in a comment cannot satisfy
    // these assertions, and isolate the statement that performs the reparenting.
    const updateStatements = stripSqlComments(updateSection)
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);

    const setStatements = updateStatements.filter((statement) =>
      /SET\s+c\.parent_id\s*=\s*p\.id\b/i.test(statement),
    );
    expect(setStatements).toHaveLength(1);

    const parentUpdates = updateStatements.filter((statement) =>
      /\bUPDATE\s+chart_of_accounts\s+c\b/i.test(statement) &&
      /SET\s+c\.parent_id\s*=\s*p\.id\b/i.test(statement),
    );
    expect(parentUpdates).toHaveLength(1);

    const parentUpdate = parentUpdates[0];
    expect(parentUpdate).toMatch(/\bUPDATE\s+chart_of_accounts\s+c\b/i);
    expect(parentUpdate).toMatch(/\bJOIN\s+chart_of_accounts\s+p\b/i);
    expect(parentUpdate).toMatch(/SET\s+c\.parent_id\s*=\s*p\.id\b/i);
    expect(parentUpdate).toMatch(/\bc\.organisation_id\s+IS\s+NULL\b/i);
    expect(parentUpdate).toMatch(/\bp\.organisation_id\s+IS\s+NULL\b/i);
    expect(parentUpdate).toMatch(/m\.code\s*=\s*c\.code/i);
    expect(parentUpdate).toMatch(/p\.code\s*=\s*m\.parent_code/i);
  });
});
