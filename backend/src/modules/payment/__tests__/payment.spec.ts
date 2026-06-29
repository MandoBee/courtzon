import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

let pool: mysql.Pool;
const TEST_USER = 999997;

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await pool.execute(`DELETE FROM financial_journal_entries WHERE reference_type = 'test_pay'`);
  await pool.execute(`DELETE FROM payment_transactions WHERE gateway_reference LIKE 'test_int_%'`);
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type = 'test_pay'`);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id = ${TEST_USER}`);
  await pool.execute(`DELETE FROM users WHERE id = ${TEST_USER}`);

  await pool.execute(`INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
    VALUES (${TEST_USER}, UUID(), 1, '01299999997', '+201299999997', 'test-pay@test.com', '$2b$10$test', 'Test Payer', 'male', 'active')`);
});

afterAll(async () => {
  await pool.execute(`DELETE FROM financial_journal_entries WHERE reference_type = 'test_pay'`);
  await pool.execute(`DELETE FROM payment_transactions WHERE gateway_reference LIKE 'test_int_%'`);
  await pool.execute(`DELETE FROM payment_transactions WHERE reference_type = 'test_pay'`);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id = ${TEST_USER}`);
  await pool.execute(`DELETE FROM users WHERE id = ${TEST_USER}`);
  await pool.end();
});

describe('Payment Integration', () => {
  it('creates a payment transaction with unique gateway_reference', async () => {
    const [r] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO payment_transactions (user_id, payment_method, gateway_provider, gateway_reference, amount, payment_status)
       VALUES (${TEST_USER}, 'card', 'paymob', 'test_int_001', 199, 'pending')`,
    );
    expect(r.insertId).toBeGreaterThan(0);
  });

  it('rejects duplicate gateway_reference (UNIQUE constraint)', async () => {
    await expect(
      pool.execute(`INSERT INTO payment_transactions (user_id, payment_method, gateway_provider, gateway_reference, amount, payment_status)
        VALUES (${TEST_USER}, 'card', 'paymob', 'test_int_001', 199, 'pending')`)
    ).rejects.toThrow();
  });

  it('records a journal entry for payment', async () => {
    // Use the correct table: financial_journal_entries
    const [r] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO financial_journal_entries (entry_type, reference_type, reference_id, debit_account, credit_account, amount, description)
       VALUES ('payment', 'gateway_webhook', 999, 'Cash', 'Revenue', 199, 'Test journal entry')`,
    );
    expect(r.insertId).toBeGreaterThan(0);
  });

  it('FOR UPDATE locks payment row for concurrent webhook processing', async () => {
    // Insert a fresh payment
    await pool.execute(`INSERT INTO payment_transactions (user_id, payment_method, gateway_provider, gateway_reference, amount, payment_status)
      VALUES (${TEST_USER}, 'card', 'paymob', 'test_int_lock', 99, 'pending')`);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [locked] = await conn.execute<any[]>(
        'SELECT * FROM payment_transactions WHERE gateway_reference = ? FOR UPDATE',
        ['test_int_lock'],
      );
      expect(locked.length).toBe(1);
      expect(locked[0].payment_status).toBe('pending');

      await conn.execute(
        "UPDATE payment_transactions SET payment_status = 'paid', paid_at = NOW() WHERE id = ?",
        [locked[0].id],
      );
      await conn.commit();

      const [after] = await pool.execute<any[]>('SELECT payment_status FROM payment_transactions WHERE id = ?', [locked[0].id]);
      expect(after[0].payment_status).toBe('paid');
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  });
});
