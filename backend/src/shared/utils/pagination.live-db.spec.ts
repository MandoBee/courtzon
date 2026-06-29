import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { buildPagination, paginationClause, limitClause } from './pagination.js';

let pool: mysql.Pool;
const TEST_PREFIX = 'test_pag_';
const WHERE = `WHERE token_key LIKE '${TEST_PREFIX}%'`;

beforeAll(async () => {
  pool = mysql.createPool({
    host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3',
  });
  await pool.execute(`DELETE FROM design_tokens WHERE token_key LIKE '${TEST_PREFIX}%'`);
});

afterAll(async () => {
  await pool.execute(`DELETE FROM design_tokens WHERE token_key LIKE '${TEST_PREFIX}%'`);
  await pool.end();
});

async function insertRows(count: number): Promise<void> {
  const vals = Array.from({ length: count }, (_, i) =>
    `('${TEST_PREFIX}${String(i + 1).padStart(5, '0')}', 'color', '#000000', 'test')`,
  ).join(', ');
  await pool.execute(`INSERT INTO design_tokens (token_key, token_type, default_value, category) VALUES ${vals}`);
}

async function clean(): Promise<void> {
  await pool.execute(`DELETE FROM design_tokens WHERE token_key LIKE '${TEST_PREFIX}%'`);
}

describe('Pagination Live DB (design_tokens)', () => {
  it('1. empty table: total=0, rows=0', async () => {
    const pag = buildPagination(1, 20);
    const [c] = await pool.execute<any[]>(`SELECT COUNT(*) as cnt FROM design_tokens ${WHERE}`);
    expect(c[0].cnt).toBe(0);
    const [r] = await pool.execute<any[]>(`SELECT * FROM design_tokens ${WHERE} ORDER BY token_key${paginationClause(pag)}`);
    expect(r.length).toBe(0);
  });

  it('2. single row: page1 returns it, page2 empty', async () => {
    await insertRows(1);
    const [c] = await pool.execute<any[]>(`SELECT COUNT(*) as cnt FROM design_tokens ${WHERE}`);
    expect(c[0].cnt).toBe(1);
    const [r1] = await pool.execute<any[]>(`SELECT * FROM design_tokens ${WHERE} ORDER BY token_key${paginationClause(buildPagination(1, 20))}`);
    expect(r1.length).toBe(1);
    const [r2] = await pool.execute<any[]>(`SELECT * FROM design_tokens ${WHERE} ORDER BY token_key${paginationClause(buildPagination(2, 20))}`);
    expect(r2.length).toBe(0);
    await clean();
  });

  it('3. 45 rows x 10/page: 5 pages, no dupes, no skips', async () => {
    const ROW_COUNT = 45; const LIMIT = 10;
    await insertRows(ROW_COUNT);

    const [c] = await pool.execute<any[]>(`SELECT COUNT(*) as cnt FROM design_tokens ${WHERE}`);
    expect(c[0].cnt).toBe(ROW_COUNT);

    const seen = new Set<string>();
    let prev: string | null = null;
    for (let page = 1; page <= 5; page++) {
      const pag = buildPagination(page, LIMIT);
      const [rows] = await pool.execute<any[]>(`SELECT * FROM design_tokens ${WHERE} ORDER BY token_key${paginationClause(pag)}`);
      const keys = rows.map((r: any) => r.token_key);
      expect(keys.length).toBe(page < 5 ? LIMIT : 5);
      for (const k of keys) { expect(seen.has(k)).toBe(false); seen.add(k); }
      if (prev) expect(prev.localeCompare(keys[0])).toBeLessThan(0);
      prev = keys[keys.length - 1];
    }
    expect(seen.size).toBe(ROW_COUNT);
    await clean();
  });

  it('4. limit > total returns all rows', async () => {
    await insertRows(5);
    const [r] = await pool.execute<any[]>(`SELECT * FROM design_tokens ${WHERE} ORDER BY token_key${paginationClause(buildPagination(1, 100))}`);
    expect(r.length).toBe(5);
    await clean();
  });

  it('5. page beyond data returns empty', async () => {
    await insertRows(3);
    const [r] = await pool.execute<any[]>(`SELECT * FROM design_tokens ${WHERE} ORDER BY token_key${paginationClause(buildPagination(10, 20))}`);
    expect(r.length).toBe(0);
    await clean();
  });

  it('6. limitClause works with real query', async () => {
    await insertRows(10);
    const [r] = await pool.execute<any[]>(`SELECT * FROM design_tokens ${WHERE} ORDER BY token_key${limitClause(3)}`);
    expect(r.length).toBe(3);
    await clean();
  });

  it('7. different limits on same page', async () => {
    await insertRows(30);
    expect((await pool.execute<any[]>(`SELECT * FROM design_tokens ${WHERE} ORDER BY token_key${paginationClause(buildPagination(1, 5))}`))[0].length).toBe(5);
    expect((await pool.execute<any[]>(`SELECT * FROM design_tokens ${WHERE} ORDER BY token_key${paginationClause(buildPagination(1, 15))}`))[0].length).toBe(15);
    expect((await pool.execute<any[]>(`SELECT * FROM design_tokens ${WHERE} ORDER BY token_key${paginationClause(buildPagination(1, 50))}`))[0].length).toBe(30);
    await clean();
  });

  it('8. paged = full ordered result (no gaps)', async () => {
    await insertRows(20);
    const [all] = await pool.execute<any[]>(`SELECT token_key FROM design_tokens ${WHERE} ORDER BY token_key`);
    const allKeys = all.map((r: any) => r.token_key);
    const paged: string[] = [];
    for (let p = 1; true; p++) {
      const [rows] = await pool.execute<any[]>(`SELECT token_key FROM design_tokens ${WHERE} ORDER BY token_key${paginationClause(buildPagination(p, 7))}`);
      if (rows.length === 0) break;
      paged.push(...rows.map((r: any) => r.token_key));
    }
    expect(paged).toEqual(allKeys);
    await clean();
  });
});
