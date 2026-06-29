import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startContainers, runSchema, stopContainers, applyTestProcessEnv, type TestContext } from '../../tests/helpers/integration-setup.js';
import { createPool } from '../../database/mysql.js';
import { buildPagination, paginationClause, limitClause } from './pagination.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await startContainers();
  await runSchema(ctx.mysqlPort);
  applyTestProcessEnv(ctx);
  createPool({
    host: '127.0.0.1',
    port: ctx.mysqlPort,
    user: 'root',
    password: 'test',
    database: 'courtzon_test',
  });
}, 120000);

afterAll(async () => {
  await stopContainers();
}, 30000);

// Helper: insert N test rows into a table then clean up.
async function withTestRows(table: string, count: number, fn: () => Promise<void>): Promise<void> {
  const { getPool } = await import('../../database/mysql.js');
  const pool = getPool();

  const cols =
    table === 'design_tokens'
      ? '(token_key, token_type, default_value, category)'
      : table === 'users'
      ? '(full_name, email, phone_number, full_phone, password_hash, gender, country_id)'
      : '(id)';

  const valFn =
    table === 'design_tokens'
      ? (i: number) => `('test_key_${i}', 'color', '#000000', 'general')`
      : table === 'users'
      ? (i: number) => `('Test User ${i}', 'test${i}@example.com', '010126377${String(i).padStart(2, '0')}', '+2010126377${String(i).padStart(2, '0')}', '$2b$10$placeholder', 'male', 1)`
      : () => '()';

  const values = Array.from({ length: count }, (_, i) => valFn(i + 1)).join(', ');
  if (values) {
    await pool.execute(`INSERT INTO ${table} ${cols} VALUES ${values}`);
  }

  try {
    await fn();
  } finally {
    // Clean up by pattern
    if (table === 'design_tokens') {
      await pool.execute("DELETE FROM design_tokens WHERE token_key LIKE 'test_key_%'");
    }
    if (table === 'users') {
      await pool.execute("DELETE FROM users WHERE email LIKE 'test%@example.com'");
    }
  }
}

// ── Tests ──

describe('Pagination integration (design_tokens via pool.execute)', () => {
  const TABLE = 'design_tokens';

  it('empty table returns 0 total and empty data', async () => {
    const { getPool } = await import('../../database/mysql.js');
    const pool = getPool();
    const pag = buildPagination(1, 20);

    const [countRows] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM ${TABLE} WHERE token_key LIKE 'test_key_%'`,
    );
    expect(countRows[0].cnt).toBe(0);

    const [rows] = await pool.execute<any[]>(
      `SELECT * FROM ${TABLE} WHERE token_key LIKE 'test_key_%' ORDER BY token_key${paginationClause(pag)}`,
    );
    expect(rows.length).toBe(0);
  });

  it('single row: total=1, page 1 returns the row, page 2 returns empty', async () => {
    await withTestRows(TABLE, 1, async () => {
      const { getPool } = await import('../../database/mysql.js');
      const pool = getPool();

      const baseWhere = `WHERE token_key LIKE 'test_key_%'`;

      // Page 1
      const p1 = buildPagination(1, 20);
      const [countRows] = await pool.execute<any[]>(`SELECT COUNT(*) as cnt FROM ${TABLE} ${baseWhere}`);
      expect(countRows[0].cnt).toBe(1);

      const [rowsP1] = await pool.execute<any[]>(
        `SELECT * FROM ${TABLE} ${baseWhere} ORDER BY token_key${paginationClause(p1)}`,
      );
      expect(rowsP1.length).toBe(1);
      expect(rowsP1[0].token_key).toBe('test_key_1');

      // Page 2
      const p2 = buildPagination(2, 20);
      const [rowsP2] = await pool.execute<any[]>(
        `SELECT * FROM ${TABLE} ${baseWhere} ORDER BY token_key${paginationClause(p2)}`,
      );
      expect(rowsP2.length).toBe(0);
    });
  });

  it('multiple rows: pagination produces correct pages with no duplicates and no skips', async () => {
    const ROW_COUNT = 45;
    await withTestRows(TABLE, ROW_COUNT, async () => {
      const { getPool } = await import('../../database/mysql.js');
      const pool = getPool();
      const baseWhere = `WHERE token_key LIKE 'test_key_%'`;

      // Verify total
      const [countRows] = await pool.execute<any[]>(`SELECT COUNT(*) as cnt FROM ${TABLE} ${baseWhere}`);
      expect(countRows[0].cnt).toBe(ROW_COUNT);

      const LIMIT = 10;
      const collectedKeys = new Set<string>();
      let lastPageKey: string | null = null;

      for (let page = 1; page <= 5; page++) {
        const pag = buildPagination(page, LIMIT);
        const [rows] = await pool.execute<any[]>(
          `SELECT * FROM ${TABLE} ${baseWhere} ORDER BY token_key${paginationClause(pag)}`,
        );

        const keys = rows.map((r: any) => r.token_key);
        const expectedSize = page < 5 ? LIMIT : 5; // last page has 5
        expect(keys.length).toBe(expectedSize);

        // No duplicates across pages
        for (const key of keys) {
          expect(collectedKeys.has(key)).toBe(false);
          collectedKeys.add(key);
        }

        // Row ordering maintained between pages (last key of previous page should come before first key of current page)
        if (lastPageKey !== null) {
          expect(lastPageKey.localeCompare(keys[0])).toBeLessThan(0);
        }
        lastPageKey = keys[keys.length - 1];
      }

      // All 45 rows collected
      expect(collectedKeys.size).toBe(ROW_COUNT);
    });
  });

  it('limit > total rows returns all rows', async () => {
    await withTestRows(TABLE, 5, async () => {
      const { getPool } = await import('../../database/mysql.js');
      const pool = getPool();
      const pag = buildPagination(1, 100);
      const [rows] = await pool.execute<any[]>(
        `SELECT * FROM ${TABLE} WHERE token_key LIKE 'test_key_%' ORDER BY token_key${paginationClause(pag)}`,
      );
      expect(rows.length).toBe(5);
    });
  });

  it('page beyond available data returns empty array', async () => {
    await withTestRows(TABLE, 3, async () => {
      const { getPool } = await import('../../database/mysql.js');
      const pool = getPool();
      const pag = buildPagination(10, 20);
      const [rows] = await pool.execute<any[]>(
        `SELECT * FROM ${TABLE} WHERE token_key LIKE 'test_key_%' ORDER BY token_key${paginationClause(pag)}`,
      );
      expect(rows.length).toBe(0);
    });
  });

  it('limitClause works correctly in a real query', async () => {
    await withTestRows(TABLE, 10, async () => {
      const { getPool } = await import('../../database/mysql.js');
      const pool = getPool();
      const lc = limitClause(3, 100);
      const [rows] = await pool.execute<any[]>(
        `SELECT * FROM ${TABLE} WHERE token_key LIKE 'test_key_%' ORDER BY token_key${lc}`,
      );
      expect(rows.length).toBe(3);
    });
  });
});

describe('Pagination integration (users via pool.execute)', () => {
  const TABLE = 'users';
  const WHERE = "WHERE email LIKE 'test%@example.com'";

  it('paginates users correctly', async () => {
    await withTestRows(TABLE, 25, async () => {
      const { getPool } = await import('../../database/mysql.js');
      const pool = getPool();

      const [countRows] = await pool.execute<any[]>(`SELECT COUNT(*) as cnt FROM ${TABLE} ${WHERE}`);
      expect(countRows[0].cnt).toBe(25);

      // Page 1
      const p1 = buildPagination(1, 10);
      const [r1] = await pool.execute<any[]>(
        `SELECT id, full_name, email FROM ${TABLE} ${WHERE} ORDER BY id${paginationClause(p1)}`,
      );
      expect(r1.length).toBe(10);

      // Page 2
      const p2 = buildPagination(2, 10);
      const [r2] = await pool.execute<any[]>(
        `SELECT id, full_name, email FROM ${TABLE} ${WHERE} ORDER BY id${paginationClause(p2)}`,
      );
      expect(r2.length).toBe(10);

      // Page 3 (last, should have 5)
      const p3 = buildPagination(3, 10);
      const [r3] = await pool.execute<any[]>(
        `SELECT id, full_name, email FROM ${TABLE} ${WHERE} ORDER BY id${paginationClause(p3)}`,
      );
      expect(r3.length).toBe(5);

      // Verify no overlap between pages
      const p1Ids = new Set(r1.map((r: any) => r.id));
      const p2Ids = new Set(r2.map((r: any) => r.id));
      const p3Ids = new Set(r3.map((r: any) => r.id));

      for (const id of p1Ids) {
        expect(p2Ids.has(id)).toBe(false);
        expect(p3Ids.has(id)).toBe(false);
      }
      for (const id of p2Ids) {
        expect(p3Ids.has(id)).toBe(false);
      }

      expect(p1Ids.size + p2Ids.size + p3Ids.size).toBe(25);
    });
  });
});
