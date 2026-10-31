import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

/**
 * P4-04 — REAL concurrency evidence for marketplace stock (no containers).
 *
 * Runs against the running local `courtzon_v3` (127.0.0.1:3307) with a dedicated,
 * self-cleaned fixture product. Proves the conditional UPDATE cannot oversell when
 * decrements overlap, and that concurrent restores never lose an update.
 */

let pool: mysql.Pool;
let productId = 0;
let decrementStock: (productId: number, variantId: number | undefined, quantity: number) => Promise<void>;
let restoreStock: (productId: number, variantId: number | undefined, quantity: number) => Promise<void>;

const TEST_NAME = `P4-04 stock concurrency ${Date.now()}`;

async function quantity(): Promise<number> {
  const [rows] = await pool.execute<any[]>('SELECT quantity FROM products WHERE id = ?', [productId]);
  return Number(rows[0].quantity);
}

async function setQuantity(value: number): Promise<void> {
  await pool.execute('UPDATE products SET quantity = ? WHERE id = ?', [value, productId]);
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'courtzon2026';
  process.env.DB_NAME = 'courtzon_v3';

  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });

  const [cats] = await pool.execute<any[]>('SELECT id FROM product_categories ORDER BY id LIMIT 1');
  if (!cats.length) throw new Error('No product_categories row to attach the fixture product to');

  const [result] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO products (seller_id, category_id, name, price, currency_code, quantity, status, is_active, marketplace_visible)
     VALUES (NULL, ?, ?, 10.00, 'EGP', 5, 'active', 1, 1)`,
    [cats[0].id, TEST_NAME],
  );
  productId = result.insertId;

  const { marketplaceRepository } = await import('../infrastructure/repositories/marketplace.repository.js');
  decrementStock = (p, v, q) => marketplaceRepository.decrementStock(p, v, q);
  restoreStock = (p, v, q) => marketplaceRepository.restoreStock(p, v, q);
});

afterAll(async () => {
  if (productId) await pool.execute('DELETE FROM products WHERE id = ?', [productId]);
  await pool.end();
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
});

describe('marketplace stock — real concurrent decrement/restore', () => {
  it('10 overlapping unit decrements against qty 5: exactly 5 succeed, stock never negative', async () => {
    await setQuantity(5);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => decrementStock(productId, undefined, 1)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    expect(ok).toBe(5);
    expect(rejected).toHaveLength(5);
    expect(rejected.every((r) => /Insufficient stock/.test(String(r.reason?.message)))).toBe(true);
    expect(await quantity()).toBe(0);
  });

  it('5 overlapping decrements of 2 against qty 3: only one succeeds, stock stays at 1', async () => {
    await setQuantity(3);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => decrementStock(productId, undefined, 2)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await quantity()).toBe(1);
  });

  it('concurrent restores are additive (no lost update)', async () => {
    await setQuantity(0);
    await Promise.all(Array.from({ length: 5 }, () => restoreStock(productId, undefined, 1)));
    expect(await quantity()).toBe(5);
  });
});
