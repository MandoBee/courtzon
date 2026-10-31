import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Safety guard for the integration global setup/teardown (B9 remediation).
 *
 * The approved strategy is to use the existing `courtzon_v3` database without
 * destructive table cleanup. This static test proves the global setup contains
 * no DELETE/TRUNCATE/DROP statements and still performs only the controlled
 * period creation it needs. No database connection is made.
 */

const SOURCE_URL = new URL('../../vitest.integration.global-setup.ts', import.meta.url);

describe('integration global setup safety', () => {
  const source = readFileSync(SOURCE_URL, 'utf8');

  it('contains no destructive SQL (DELETE/TRUNCATE/DROP)', () => {
    expect(source).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(source).not.toMatch(/\bTRUNCATE\b/i);
    expect(source).not.toMatch(/\bDROP\s+(TABLE|DATABASE)\b/i);
  });

  it('keeps the controlled accounting-period creation', () => {
    expect(source).toMatch(/INSERT INTO accounting_periods/i);
  });

  it('closes the fixture connection without deleting data', () => {
    expect(source).toMatch(/conn\.end\(\)/);
  });
});
