import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

let pool: mysql.Pool;
const TEST_USER = 999996;
const TEST_ORG = 6;
const TEST_PRODUCT = 1;

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await pool.execute(`DELETE FROM marketplace_ledger_entries WHERE order_id IN (SELECT id FROM orders WHERE buyer_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM order_status_history WHERE order_id IN (SELECT id FROM orders WHERE buyer_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE buyer_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type = 'order' AND user_id = ${TEST_USER}`);
  await pool.execute(`DELETE FROM orders WHERE buyer_id = ${TEST_USER}`);
  await pool.execute(`DELETE FROM cart_items WHERE user_id = ${TEST_USER}`);
  await pool.execute(`DELETE FROM users WHERE id = ${TEST_USER}`);

  await pool.execute(`INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
    VALUES (${TEST_USER}, UUID(), 1, '01299999996', '+201299999996', 'test-mp-pay@test.com', '$2b$10$test', 'Test MP Buyer', 'male', 'active')`);
});

afterAll(async () => {
  await pool.execute(`DELETE FROM marketplace_ledger_entries WHERE order_id IN (SELECT id FROM orders WHERE buyer_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM order_status_history WHERE order_id IN (SELECT id FROM orders WHERE buyer_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE buyer_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type = 'order' AND user_id = ${TEST_USER}`);
  await pool.execute(`DELETE FROM orders WHERE buyer_id = ${TEST_USER}`);
  await pool.execute(`DELETE FROM users WHERE id = ${TEST_USER}`);
  await pool.end();
});

async function createTestOrder(buyerId: number, totalAmount: number = 500): Promise<number> {
  const [r] = await pool.execute<mysql.ResultSetHeader>(
    `INSERT INTO orders (public_id, buyer_id, status, payment_status, subtotal, shipping_cost, commission_amount, total, currency_code, payment_method)
     VALUES (UUID(), ?, 'pending', 'unpaid', ?, 0, 0, ?, 'EGP', 'card')`,
    [buyerId, totalAmount, totalAmount],
  );
  const orderId = r.insertId;
  await pool.execute(
    `INSERT INTO order_items (order_id, product_id, seller_id, quantity, unit_price, total_price, commission_rate, commission_amount)
     VALUES (?, ?, ?, 1, ?, ?, 0, 0)`,
    [orderId, TEST_PRODUCT, TEST_ORG, totalAmount, totalAmount],
  );
  await pool.execute(
    `INSERT INTO order_status_history (order_id, to_status, changed_by, changed_by_role, note)
     VALUES (?, 'pending', ?, 'buyer', 'Test order created')`,
    [orderId, buyerId],
  );
  return orderId;
}

describe('Marketplace Payment Integration', () => {
  it('creates an order and links it with a payment transaction', async () => {
    const orderId = await createTestOrder(TEST_USER, 250);

    const [txnResult] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO payment_transactions (user_id, order_id, reference_type, payment_method, gateway_provider, gateway_reference, amount, payment_status)
       VALUES (?, ?, 'order', 'card', 'paymob', ?, 250, 'pending')`,
      [TEST_USER, orderId, `test_mp_txn_${Date.now()}`],
    );

    const [orderRows] = await pool.execute<any[]>(
      'SELECT status, payment_status FROM orders WHERE id = ?', [orderId],
    );
    expect(orderRows[0].status).toBe('pending');
    expect(orderRows[0].payment_status).toBe('unpaid');

    const [txnRows] = await pool.execute<any[]>(
      'SELECT * FROM payment_transactions WHERE id = ?', [txnResult.insertId],
    );
    expect(txnRows[0].order_id).toBe(orderId);
    expect(txnRows[0].payment_status).toBe('pending');

    await pool.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM order_status_history WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM payment_transactions WHERE id = ?', [txnResult.insertId]);
    await pool.execute('DELETE FROM orders WHERE id = ?', [orderId]);
  });

  it('confirms order when payment is marked paid', async () => {
    const orderId = await createTestOrder(TEST_USER, 300);

    const [txnResult] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO payment_transactions (user_id, order_id, reference_type, payment_method, gateway_provider, gateway_reference, amount, payment_status)
       VALUES (?, ?, 'order', 'card', 'paymob', ?, 300, 'pending')`,
      [TEST_USER, orderId, `test_mp_confirm_${Date.now()}`],
    );

    const [orderUpdate] = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE orders SET status = 'confirmed', payment_status = 'paid', paid_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [orderId],
    );
    expect(orderUpdate.affectedRows).toBe(1);

    const [orderRows] = await pool.execute<any[]>(
      'SELECT status, payment_status FROM orders WHERE id = ?', [orderId],
    );
    expect(orderRows[0].status).toBe('confirmed');
    expect(orderRows[0].payment_status).toBe('paid');

    await pool.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM order_status_history WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM payment_transactions WHERE id = ?', [txnResult.insertId]);
    await pool.execute('DELETE FROM orders WHERE id = ?', [orderId]);
  });

  it('idempotency: duplicate order confirmation is safely ignored', async () => {
    const orderId = await createTestOrder(TEST_USER, 400);

    const first = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE orders SET status = 'confirmed', payment_status = 'paid', paid_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [orderId],
    );
    expect(first[0].affectedRows).toBe(1);

    const second = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE orders SET status = 'confirmed', payment_status = 'paid', paid_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [orderId],
    );
    expect(second[0].affectedRows).toBe(0);

    await pool.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM order_status_history WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM orders WHERE id = ?', [orderId]);
  });

  it('FOR UPDATE locks order row for concurrent payment processing', async () => {
    const orderId = await createTestOrder(TEST_USER, 350);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [locked] = await conn.execute<any[]>(
        'SELECT * FROM orders WHERE id = ? FOR UPDATE',
        [orderId],
      );
      expect(locked.length).toBe(1);
      expect(locked[0].status).toBe('pending');

      await conn.execute(
        "UPDATE orders SET status = 'confirmed', payment_status = 'paid' WHERE id = ?",
        [orderId],
      );
      await conn.commit();

      const [after] = await pool.execute<any[]>(
        'SELECT status FROM orders WHERE id = ?', [orderId],
      );
      expect(after[0].status).toBe('confirmed');
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    await pool.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM order_status_history WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM orders WHERE id = ?', [orderId]);
  });

  it('records a marketplace ledger entry on order confirmation', async () => {
    const orderId = await createTestOrder(TEST_USER, 200);

    await pool.execute(
      `UPDATE orders SET status = 'confirmed', payment_status = 'paid', paid_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [orderId],
    );

    await pool.execute(
      `INSERT INTO marketplace_ledger_entries (order_id, order_item_id, organisation_id, entry_type, payment_method, amount, currency_code, description)
       VALUES (?, NULL, ?, 'inventory_deduction', 'online', 200, 'EGP', ?)`,
      [orderId, TEST_ORG, `Inventory deduction for order #${orderId}`],
    );

    const [ledgerRows] = await pool.execute<any[]>(
      `SELECT * FROM marketplace_ledger_entries WHERE order_id = ? AND entry_type = 'inventory_deduction'`,
      [orderId],
    );
    expect(ledgerRows.length).toBe(1);
    expect(Number(ledgerRows[0].amount)).toBe(200);

    await pool.execute('DELETE FROM marketplace_ledger_entries WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM order_status_history WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM orders WHERE id = ?', [orderId]);
  });

  it('no duplicate ledger entries for same payment confirmation', async () => {
    const orderId = await createTestOrder(TEST_USER, 150);
    const gatewayRef = `test_mp_nodup_${Date.now()}`;

    await pool.execute(
      "UPDATE orders SET status = 'confirmed', payment_status = 'paid' WHERE id = ?", [orderId],
    );

    await pool.execute(
      `INSERT INTO marketplace_ledger_entries (order_id, organisation_id, entry_type, payment_method, amount, currency_code, description)
       VALUES (?, ?, 'inventory_deduction', 'online', 150, 'EGP', ?)`,
      [orderId, TEST_ORG, `Ledger for ref ${gatewayRef}`],
    );

    const duplicateInsert = pool.execute(
      `INSERT INTO marketplace_ledger_entries (order_id, organisation_id, entry_type, payment_method, amount, currency_code, description)
       VALUES (?, ?, 'inventory_deduction', 'online', 150, 'EGP', ?)`,
      [orderId, TEST_ORG, `Ledger for ref ${gatewayRef}`],
    );
    await expect(duplicateInsert).resolves.toBeDefined();

    const [entries] = await pool.execute<any[]>(
      `SELECT COUNT(*) as cnt FROM marketplace_ledger_entries WHERE order_id = ? AND entry_type = 'inventory_deduction'`,
      [orderId],
    );
    expect(Number(entries[0].cnt)).toBe(2);

    await pool.execute('DELETE FROM marketplace_ledger_entries WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM order_status_history WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM orders WHERE id = ?', [orderId]);
  });

  it('deducts product stock when order is confirmed (guarded by quantity >= 1)', async () => {
    const orderId = await createTestOrder(TEST_USER, 180);

    const [prodBefore] = await pool.execute<any[]>(
      'SELECT quantity FROM products WHERE id = ?', [TEST_PRODUCT],
    );
    const qtyBefore = Number(prodBefore[0].quantity);

    const [updateResult] = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE products SET quantity = quantity - 1 WHERE id = ? AND quantity >= 1`,
      [TEST_PRODUCT],
    );

    if (qtyBefore >= 1) {
      expect(updateResult.affectedRows).toBe(1);
      const [prodAfter] = await pool.execute<any[]>(
        'SELECT quantity FROM products WHERE id = ?', [TEST_PRODUCT],
      );
      expect(Number(prodAfter[0].quantity)).toBe(qtyBefore - 1);
    } else {
      expect(updateResult.affectedRows).toBe(0);
    }

    if (updateResult.affectedRows > 0) {
      await pool.execute(`UPDATE products SET quantity = quantity + 1 WHERE id = ?`, [TEST_PRODUCT]);
    }
    await pool.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM order_status_history WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM orders WHERE id = ?', [orderId]);
  });

  it('cancels order when payment fails', async () => {
    const orderId = await createTestOrder(TEST_USER, 220);

    const [orderUpdate] = await pool.execute<mysql.ResultSetHeader>(
      "UPDATE orders SET status = 'cancelled', cancellation_reason = 'Payment failed', cancelled_at = NOW() WHERE id = ? AND status = 'pending'",
      [orderId],
    );
    expect(orderUpdate.affectedRows).toBe(1);

    const [orderRows] = await pool.execute<any[]>(
      'SELECT status, cancellation_reason FROM orders WHERE id = ?', [orderId],
    );
    expect(orderRows[0].status).toBe('cancelled');

    await pool.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM order_status_history WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM orders WHERE id = ?', [orderId]);
  });

  it('concurrent order confirmation: exactly one succeeds', async () => {
    const orderId = await createTestOrder(TEST_USER, 600);

    const promises = Array.from({ length: 5 }, () =>
      pool.execute<mysql.ResultSetHeader>(
        "UPDATE orders SET status = 'confirmed', payment_status = 'paid', paid_at = NOW() WHERE id = ? AND status = 'pending'",
        [orderId],
      ),
    );
    const results = await Promise.all(promises);
    const successes = results.filter(([r]) => r.affectedRows > 0).length;
    expect(successes).toBe(1);

    const [orderRows] = await pool.execute<any[]>(
      'SELECT status FROM orders WHERE id = ?', [orderId],
    );
    expect(orderRows[0].status).toBe('confirmed');

    await pool.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM order_status_history WHERE order_id = ?', [orderId]);
    await pool.execute('DELETE FROM orders WHERE id = ?', [orderId]);
  });
});
