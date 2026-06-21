import { getPool } from '../../database/mysql.js';
import type { CascadeExec } from './types.js';

export async function cascadeProductSoftDelete(productId: number, conn?: CascadeExec): Promise<void> {
  const db = conn ?? getPool();

  await db.execute(`DELETE FROM cart_items WHERE product_id = ?`, [productId]);
  await db.execute(`DELETE FROM wishlist_items WHERE product_id = ?`, [productId]);

  await db.execute(
    `UPDATE products SET is_active = 0 WHERE id = ? AND deleted_at IS NULL`,
    [productId],
  );
}
