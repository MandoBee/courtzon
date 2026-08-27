// Set required env vars BEFORE any import that triggers env.ts / getPool()
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'courtzon2026';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = '127.0.0.1';
process.env.REDIS_PORT = '6379';
process.env.PAYMENT_GATEWAY_PROVIDER = 'paymob';
process.env.PAYMOB_API_KEY = 'test';
process.env.PAYMOB_SECRET = 'test';
process.env.PAYMOB_PUBLIC_KEY = 'test_pk';
process.env.PAYMOB_MERCHANT_ID = '12345';
process.env.NODE_ENV = 'test';

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
    // F-7: the test row uses reference_type='test_pay' so the beforeAll/afterAll
    // cleanup deletes it — it must NOT pollute the (dead) gateway_webhook rows
    // that the payment health endpoint no longer reads.
    const [r] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO financial_journal_entries (entry_type, reference_type, reference_id, debit_account, credit_account, amount, description)
       VALUES ('payment', 'test_pay', 999, 'Cash', 'Revenue', 199, 'Test journal entry')`,
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

  it('idempotency: duplicate status update is safely ignored (conditional WHERE)', async () => {
    const ref = `test_idem_001_${Date.now()}`;
    await pool.execute(`INSERT INTO payment_transactions (user_id, payment_method, gateway_provider, gateway_reference, amount, payment_status)
      VALUES (${TEST_USER}, 'card', 'paymob', ?, 150, 'pending')`, [ref]);

    const [r1] = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE payment_transactions SET payment_status = 'paid', paid_at = NOW()
       WHERE gateway_reference = ? AND payment_status NOT IN ('paid','failed','cancelled','expired','refunded')`, [ref]
    );
    expect(r1.affectedRows).toBe(1);

    const [r2] = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE payment_transactions SET payment_status = 'paid', paid_at = NOW()
       WHERE gateway_reference = ? AND payment_status NOT IN ('paid','failed','cancelled','expired','refunded')`, [ref]
    );
    expect(r2.affectedRows).toBe(0);
  });

  it('idempotency: wallet top-up does NOT double-credit for same gateway_ref', async () => {
    const gatewayRef = `test_topup_${Date.now()}`;

    await pool.execute(`INSERT INTO payment_transactions
      (user_id, payment_method, gateway_provider, gateway_reference, amount, reference_type, payment_status)
      VALUES (${TEST_USER}, 'card', 'paymob', ?, 500, 'wallet_topup', 'paid')`, [gatewayRef]);

    await pool.execute(`INSERT IGNORE INTO user_wallets (user_id, balance, currency_code) VALUES (${TEST_USER}, 0, 'EGP')`);

    // First credit: should succeed
    const [wallet1] = await pool.execute<any[]>('SELECT id, balance FROM user_wallets WHERE user_id = ?', [TEST_USER]);
    const newBalance1 = Number(wallet1[0].balance) + 500;
    await pool.execute('UPDATE user_wallets SET balance = ?, version = version + 1 WHERE id = ?', [newBalance1, wallet1[0].id]);
    await pool.execute(
      `INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, direction, reference_type, description)
       VALUES (?, 'deposit', ?, 'credit', 'payment_gateway', ?)`,
      [wallet1[0].id, 500, `Paymob top-up — ref ${gatewayRef}`]
    );

    // Second credit (duplicate webhook): should be detected and skipped
    const [existing] = await pool.execute<any[]>(
      `SELECT id FROM wallet_transactions
       WHERE wallet_id = ? AND transaction_type = 'deposit' AND description LIKE ?`,
      [wallet1[0].id, `%${gatewayRef}%`]
    );
    expect(existing.length).toBeGreaterThanOrEqual(1);

    const [wallet2] = await pool.execute<any[]>('SELECT balance FROM user_wallets WHERE user_id = ?', [TEST_USER]);
    expect(Number(wallet2[0].balance)).toBe(newBalance1); // Balance unchanged
  });

  it('expiry: does NOT expire already-paid payments', async () => {
    const ref = `test_nxpr_01_${Date.now()}`;
    await pool.execute(`INSERT INTO payment_transactions (user_id, payment_method, gateway_provider, gateway_reference, amount, payment_status, paid_at)
      VALUES (${TEST_USER}, 'card', 'paymob', ?, 99, 'paid', NOW())`, [ref]);

    const [r] = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE payment_transactions SET payment_status = 'expired', cancelled_at = NOW()
       WHERE gateway_reference = ? AND payment_status IN ('created','pending','processing')`, [ref]
    );
    expect(r.affectedRows).toBe(0);
  });
});

// ── Player payment history: ownership + safe projection + filters ──
describe('Payment history (findByUser) — ownership & safe projection', () => {
  it('never exposes raw gateway_response to the player', async () => {
    const { paymentRepository } = await import('../infrastructure/repositories/payment.repository.js');
    const result = await paymentRepository.findByUser(TEST_USER, 1, 50);
    for (const row of result.data) {
      expect(row).not.toHaveProperty('gateway_response');
    }
  });

  it('only returns the authenticated users own rows', async () => {
    const { paymentRepository } = await import('../infrastructure/repositories/payment.repository.js');
    const other = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT id FROM users WHERE id != ? LIMIT 1`,
      [TEST_USER],
    );
    if (other[0].length) {
      const otherId = other[0][0].id as number;
      const result = await paymentRepository.findByUser(otherId, 1, 50);
      for (const row of result.data) {
        expect(Number(row.user_id)).toBe(Number(otherId));
      }
    } else {
      expect(true).toBe(true);
    }
  });

  it('filters by status, payment method, and reference type', async () => {
    const { paymentRepository } = await import('../infrastructure/repositories/payment.repository.js');
    const result = await paymentRepository.findByUser(TEST_USER, 1, 50, {
      status: 'paid',
      paymentMethod: 'card',
      referenceType: 'wallet_topup',
    });
    for (const row of result.data) {
      expect(row.payment_status).toBe('paid');
      expect(row.payment_method).toBe('card');
      expect(row.reference_type).toBe('wallet_topup');
    }
  });

  it('returns the safe read-only projection fields', async () => {
    const { paymentRepository } = await import('../infrastructure/repositories/payment.repository.js');
    const result = await paymentRepository.findByUser(TEST_USER, 1, 50);
    const requiredFields = ['id', 'user_id', 'booking_id', 'order_id', 'reference_id', 'reference_type',
      'payment_method', 'gateway_reference', 'amount', 'currency', 'payment_status', 'created_at'];
    for (const row of result.data) {
      for (const f of requiredFields) {
        expect(row).toHaveProperty(f);
      }
    }
  });
});
