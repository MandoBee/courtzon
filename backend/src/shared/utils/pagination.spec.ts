import { describe, it, expect } from 'vitest';
import { buildPagination, paginationClause, limitClause, type Pagination } from './pagination.js';

// ── buildPagination: normal cases ──

describe('buildPagination', () => {
  describe('normal cases', () => {
    it('page=1, limit=20 → page=1 limit=20 offset=0', () => {
      const p = buildPagination(1, 20);
      expect(p).toEqual<Pagination>({ page: 1, limit: 20, offset: 0 });
    });

    it('page=2, limit=20 → page=2 limit=20 offset=20', () => {
      const p = buildPagination(2, 20);
      expect(p).toEqual<Pagination>({ page: 2, limit: 20, offset: 20 });
    });

    it('page=5, limit=10 → page=5 limit=10 offset=40', () => {
      const p = buildPagination(5, 10);
      expect(p).toEqual<Pagination>({ page: 5, limit: 10, offset: 40 });
    });

    it('page=1, limit=100 → page=1 limit=100 offset=0 (max limit)', () => {
      const p = buildPagination(1, 100);
      expect(p).toEqual<Pagination>({ page: 1, limit: 100, offset: 0 });
    });

    it('returns integer values for float inputs (floored before calculation)', () => {
      const p = buildPagination(3.7, 15.2);
      expect(p.page).toBe(3);
      expect(p.limit).toBe(15);
      expect(p.offset).toBe(30);
    });
  });

  describe('page validation', () => {
    it('page=0 → defaults to 1', () => {
      const p = buildPagination(0, 20);
      expect(p.page).toBe(1);
    });

    it('page=-1 → defaults to 1', () => {
      const p = buildPagination(-1, 20);
      expect(p.page).toBe(1);
    });

    it('page=-100 → defaults to 1', () => {
      const p = buildPagination(-100, 20);
      expect(p.page).toBe(1);
    });

    it('page=NaN → defaults to 1', () => {
      const p = buildPagination(Number.NaN, 20);
      expect(p.page).toBe(1);
    });

    it('page=Infinity → defaults to 1', () => {
      const p = buildPagination(Number.POSITIVE_INFINITY, 20);
      expect(p.page).toBe(1);
    });

    it('page="abc" (string) → defaults to 1', () => {
      const p = buildPagination('abc', 20);
      expect(p.page).toBe(1);
    });

    it('page=null → defaults to 1', () => {
      const p = buildPagination(null, 20);
      expect(p.page).toBe(1);
    });

    it('page=undefined → defaults to 1', () => {
      const p = buildPagination(undefined, 20);
      expect(p.page).toBe(1);
    });

    it('page as string "3" → coerced to 3', () => {
      const p = buildPagination('3', 20);
      expect(p.page).toBe(3);
      expect(p.offset).toBe(40);
    });

    it('page as boolean true → coerced to 1', () => {
      const p = buildPagination(true, 20);
      expect(p.page).toBe(1);
    });
  });

  describe('limit validation', () => {
    it('limit=0 → defaults to 20', () => {
      const p = buildPagination(1, 0);
      expect(p.limit).toBe(20);
    });

    it('limit=-5 → defaults to 20', () => {
      const p = buildPagination(1, -5);
      expect(p.limit).toBe(20);
    });

    it('limit=NaN → defaults to 20', () => {
      const p = buildPagination(1, Number.NaN);
      expect(p.limit).toBe(20);
    });

    it('limit=Infinity → defaults to 20 (Infinity is not finite)', () => {
      const p = buildPagination(1, Number.POSITIVE_INFINITY);
      expect(p.limit).toBe(20);
    });

    it('limit=150 → capped to 100 (MAX_LIMIT)', () => {
      const p = buildPagination(1, 150);
      expect(p.limit).toBe(100);
    });

    it('limit=5000 → capped to 100', () => {
      const p = buildPagination(1, 5000);
      expect(p.limit).toBe(100);
    });

    it('limit=101 → capped to 100', () => {
      const p = buildPagination(1, 101);
      expect(p.limit).toBe(100);
    });

    it('limit=100 → not capped (equals MAX_LIMIT)', () => {
      const p = buildPagination(1, 100);
      expect(p.limit).toBe(100);
    });

    it('limit=99 → not capped (below MAX_LIMIT)', () => {
      const p = buildPagination(1, 99);
      expect(p.limit).toBe(99);
    });

    it('limit="abc" → defaults to 20', () => {
      const p = buildPagination(1, 'abc');
      expect(p.limit).toBe(20);
    });

    it('limit=null → defaults to 20', () => {
      const p = buildPagination(1, null);
      expect(p.limit).toBe(20);
    });

    it('limit=undefined → defaults to 20', () => {
      const p = buildPagination(1, undefined);
      expect(p.limit).toBe(20);
    });

    it('limit as string "50" → coerced to 50', () => {
      const p = buildPagination(1, '50');
      expect(p.limit).toBe(50);
    });
  });

  describe('both page and limit invalid', () => {
    it('both invalid → gets both defaults', () => {
      const p = buildPagination(-1, 0);
      expect(p.page).toBe(1);
      expect(p.limit).toBe(20);
      expect(p.offset).toBe(0);
    });

    it('both undefined → gets both defaults', () => {
      const p = buildPagination(undefined, undefined);
      expect(p).toEqual<Pagination>({ page: 1, limit: 20, offset: 0 });
    });
  });

  describe('large page numbers', () => {
    it('page=1000, limit=20 → offset=19980', () => {
      const p = buildPagination(1000, 20);
      expect(p.offset).toBe(19980);
    });

    it('offset never goes negative', () => {
      const p = buildPagination(1, 20);
      expect(p.offset).toBeGreaterThanOrEqual(0);
    });
  });

  describe('immutability / fresh objects', () => {
    it('each call returns independent object', () => {
      const a = buildPagination(1, 20);
      const b = buildPagination(2, 30);
      expect(a.page).not.toBe(b.page);
      expect(a.limit).not.toBe(b.limit);
    });
  });
});

// ── paginationClause ──

describe('paginationClause', () => {
  it('returns LIMIT and OFFSET with correct values', () => {
    const p = buildPagination(2, 20);
    const clause = paginationClause(p);
    expect(clause).toBe(' LIMIT 20 OFFSET 20');
  });

  it('handles first page', () => {
    const p = buildPagination(1, 10);
    expect(paginationClause(p)).toBe(' LIMIT 10 OFFSET 0');
  });

  it('always starts with a space for safe SQL concatenation', () => {
    const p = buildPagination(1, 20);
    const clause = paginationClause(p);
    expect(clause.startsWith(' ')).toBe(true);
  });

  it('contains only numeric values', () => {
    const p = buildPagination(3, 50);
    const clause = paginationClause(p);
    expect(clause).toMatch(/^ LIMIT \d+ OFFSET \d+$/);
  });
});

// ── limitClause ──

describe('limitClause', () => {
  it('returns LIMIT with correct value', () => {
    expect(limitClause(20)).toBe(' LIMIT 20');
  });

  it('defaults limit < 1 to 20', () => {
    expect(limitClause(0)).toBe(' LIMIT 20');
    expect(limitClause(-5)).toBe(' LIMIT 20');
  });

  it('caps to max when limit exceeds max', () => {
    expect(limitClause(200, 50)).toBe(' LIMIT 50');
  });

  it('uses default MAX_LIMIT of 100 when max not provided', () => {
    expect(limitClause(500)).toBe(' LIMIT 100');
  });

  it('allows custom max', () => {
    expect(limitClause(30, 25)).toBe(' LIMIT 25');
    expect(limitClause(15, 25)).toBe(' LIMIT 15');
  });

  it('handles NaN input by defaulting to 20', () => {
    expect(limitClause(Number.NaN)).toBe(' LIMIT 20');
  });

  it('handles Infinity by defaulting (Infinity is not finite)', () => {
    expect(limitClause(Number.POSITIVE_INFINITY)).toBe(' LIMIT 20');
  });

  it('always starts with a space', () => {
    expect(limitClause(10).startsWith(' ')).toBe(true);
  });

  it('contains only numeric value after LIMIT', () => {
    expect(limitClause(42)).toMatch(/^ LIMIT \d+$/);
  });
});

// ── Security: SQL injection ──

describe('SQL injection resistance', () => {
  it('page with SQL injection string is sanitised to default', () => {
    const p = buildPagination("1; DROP TABLE users;--", 20);
    expect(p.page).toBe(1);
  });

  it('limit with SQL injection string is sanitised to default', () => {
    const p = buildPagination(1, "20; DROP TABLE users;--");
    expect(p.limit).toBe(20);
  });

  it('page with "1 UNION SELECT" is sanitised', () => {
    const p = buildPagination("1 UNION SELECT * FROM users", 20);
    expect(p.page).toBe(1);
  });

  it('paginationClause output is safe from injection in page', () => {
    const p = buildPagination("1 OR 1=1", 20);
    const clause = paginationClause(p);
    // Output must only be "LIMIT number OFFSET number"
    expect(clause).toMatch(/^ LIMIT \d+ OFFSET \d+$/);
    expect(clause).not.toMatch(/OR|SELECT|DROP|UNION|--/i);
  });

  it('paginationClause output is safe from injection in limit', () => {
    const p = buildPagination(1, "20 OR 1=1");
    const clause = paginationClause(p);
    expect(clause).toMatch(/^ LIMIT \d+ OFFSET \d+$/);
    expect(clause).not.toMatch(/OR|SELECT|DROP|UNION|--/i);
  });

  it('limitClause is safe from SQL injection', () => {
    const clause = limitClause("20; DROP" as any);
    expect(clause).toMatch(/^ LIMIT \d+$/);
    expect(clause).not.toMatch(/DROP|;|--/i);
  });

  it('objects and arrays as inputs do not throw but return defaults', () => {
    const p1 = buildPagination({} as any, 20);
    expect(p1.page).toBe(1);
    const p2 = buildPagination(1, [] as any);
    expect(p2.limit).toBe(20);
  });
});

// ── Combined usage pattern ──

describe('combined usage (simulating repository pattern)', () => {
  it('safely builds a paged SQL query', () => {
    const p = buildPagination(2, 15);
    const baseSql = 'SELECT * FROM users ORDER BY id';
    const fullSql = `${baseSql}${paginationClause(p)}`;
    expect(fullSql).toBe('SELECT * FROM users ORDER BY id LIMIT 15 OFFSET 15');
  });

  it('works when only limit is needed', () => {
    const clause = limitClause(25, 50);
    const sql = `SELECT * FROM users ORDER BY created_at DESC${clause}`;
    expect(sql).toBe('SELECT * FROM users ORDER BY created_at DESC LIMIT 25');
  });
});
