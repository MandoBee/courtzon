import type mysql from 'mysql2/promise';

export interface ProductFixture {
  productId: number;
  categoryId: number;
}

/**
 * Minimal deterministic marketplace product fixture for DB-backed integration
 * specs. The specs must not depend on seeded product rows (the shared
 * courtzon_v3 DB's `products` table may be empty). Each spec creates its own
 * category + product, uses the returned ids in `order_items`, and cleans up.
 */
export async function createProductFixture(
  pool: mysql.Pool,
  sellerOrgId: number,
  quantity = 10,
): Promise<ProductFixture> {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const [cat] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO product_categories (name, slug) VALUES (?, ?)`,
    [`Test Category ${suffix}`, `test-cat-${suffix}`],
  );
  const categoryId = cat.insertId;
  const [prod] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO products (seller_id, seller_type, category_id, name, price, currency_code, quantity, status, is_active)
     VALUES (?, 'org', ?, ?, 100.00, 'EGP', ?, 'active', 1)`,
    [sellerOrgId, categoryId, `Test Product ${suffix}`, quantity],
  );
  return { productId: prod.insertId, categoryId };
}

export async function cleanupProductFixture(pool: mysql.Pool, fixture: ProductFixture): Promise<void> {
  if (fixture && fixture.productId) {
    await pool.execute('DELETE FROM products WHERE id = ?', [fixture.productId]);
  }
  if (fixture && fixture.categoryId) {
    await pool.execute('DELETE FROM product_categories WHERE id = ?', [fixture.categoryId]);
  }
}