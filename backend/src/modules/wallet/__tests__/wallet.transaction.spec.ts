import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

let pool: mysql.Pool;
let testWalletId: number;

beforeAll(async () => {
  pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  await pool.execute(`DELETE FROM wallet_transactions WHERE reference_type = 'test_txn'`);
  await pool.execute(`DELETE FROM payment_transactions WHERE gateway_reference LIKE 'test_wbhk_%'`);
  await pool.execute(`DELETE FROM withdrawal_requests WHERE user_id = 999999`);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id = 999999`);
  await pool.execute(`DELETE FROM users WHERE id = 999999`);

  await pool.execute(`INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
    VALUES (999999, UUID(), 1, '01299999999', '+201299999999', 'test-wallet@test.com', '$2b$10$test', 'Test Wallet', 'male', 'active')`);
  await pool.execute(`INSERT INTO user_wallets (user_id, balance, currency_code, version) VALUES (999999, 500, 'EGP', 1)`);
  const [wRow] = await pool.execute<any[]>('SELECT id FROM user_wallets WHERE user_id = 999999');
  testWalletId = wRow[0].id;
});

afterAll(async () => {
  await pool.execute(`DELETE FROM wallet_transactions WHERE reference_type = 'test_txn'`);
  await pool.execute(`DELETE FROM payment_transactions WHERE gateway_reference LIKE 'test_wbhk_%'`);
  await pool.execute(`DELETE FROM withdrawal_requests WHERE user_id = 999999`);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id = 999999`);
  await pool.execute(`DELETE FROM users WHERE id = 999999`);
  await pool.end();
});

describe('Transaction Integrity — Wallet', () => {
  it('deposit: balance + journal are atomic', async () => {
    const conn = await pool.getConnection();
    try {
      const [beforeRows] = await conn.execute<any[]>('SELECT balance, version FROM user_wallets WHERE id = ?', [testWalletId]);
      const startBalance = Number(beforeRows[0].balance);
      const startVersion = beforeRows[0].version;

      await conn.beginTransaction();

      const [locked] = await conn.execute<any[]>('SELECT balance, version FROM user_wallets WHERE id = ? AND is_locked = FALSE FOR UPDATE', [testWalletId]);
      expect(locked.length).toBe(1);

      const newBalance = Number(locked[0].balance) + 100;
      await conn.execute('UPDATE user_wallets SET balance = ?, version = version + 1 WHERE id = ? AND version = ?', [newBalance, testWalletId, locked[0].version]);

      await conn.execute(`INSERT INTO wallet_transactions (public_id, wallet_id, transaction_type, amount, direction, reference_type, reference_id, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, ['test-uuid-0', testWalletId, 'deposit', 100, 'credit', 'test_txn', 0, 'Test']);

      await conn.commit();

      const [afterRows] = await pool.execute<any[]>('SELECT balance, version FROM user_wallets WHERE id = ?', [testWalletId]);
      expect(Number(afterRows[0].balance)).toBe(startBalance + 100);
      expect(afterRows[0].version).toBe(startVersion + 1);
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  });

  it('rollback on failure preserves original balance', async () => {
    const [beforeRows] = await pool.execute<any[]>('SELECT balance FROM user_wallets WHERE id = ?', [testWalletId]);
    const startBalance = Number(beforeRows[0].balance);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE user_wallets SET balance = ? WHERE id = ?', [startBalance + 999, testWalletId]);
      throw new Error('Simulated failure');
    } catch {
      await conn.rollback();
    } finally {
      conn.release();
    }

    const [afterRows] = await pool.execute<any[]>('SELECT balance FROM user_wallets WHERE id = ?', [testWalletId]);
    expect(Number(afterRows[0].balance)).toBe(startBalance);
  });

  it('optimistic lock: stale version update is rejected', async () => {
    // Read current version, then have another connection bump it, then try to update with stale version
    const [r1] = await pool.execute<any[]>('SELECT balance, version FROM user_wallets WHERE id = ?', [testWalletId]);
    const version1 = r1[0].version;

    // Another connection bumps the version
    await pool.execute('UPDATE user_wallets SET balance = balance + 1, version = version + 1 WHERE id = ?', [testWalletId]);

    // Now try to update with the STALE version1 — should fail
    const [result] = await pool.execute<any[]>('UPDATE user_wallets SET balance = ?, version = version + 1 WHERE id = ? AND version = ?',
      [Number(r1[0].balance) + 10, testWalletId, version1]);

    expect((result as any).affectedRows).toBe(0);
  });
});

describe('UNIQUE Constraints', () => {
  it('duplicate gateway_reference is rejected', async () => {
    await pool.execute(`INSERT INTO payment_transactions (user_id, payment_method, gateway_provider, gateway_reference, amount, payment_status)
      VALUES (999999, 'card', 'paymob', 'test_wbhk_001', 100, 'pending')`);
    await expect(
      pool.execute(`INSERT INTO payment_transactions (user_id, payment_method, gateway_provider, gateway_reference, amount, payment_status)
        VALUES (999999, 'card', 'paymob', 'test_wbhk_001', 100, 'pending')`)
    ).rejects.toThrow();
  });

  it('duplicate wallet_transaction reference is rejected', async () => {
    await pool.execute(`INSERT INTO wallet_transactions (public_id, wallet_id, transaction_type, amount, direction, reference_type, reference_id, description)
      VALUES ('test-uuid-1', ?, 'deposit', 50, 'credit', 'test_txn', 1, 'Test')`, [testWalletId]);
    await expect(
      pool.execute(`INSERT INTO wallet_transactions (public_id, wallet_id, transaction_type, amount, direction, reference_type, reference_id, description)
        VALUES ('test-uuid-2', ?, 'deposit', 50, 'credit', 'test_txn', 1, 'Test')`, [testWalletId])
    ).rejects.toThrow();
  });
});

describe('FOR UPDATE Lock', () => {
  it('holds lock until transaction ends', async () => {
    const conn1 = await pool.getConnection();
    const conn2 = await pool.getConnection();
    try {
      await conn1.beginTransaction();
      await conn1.execute<any[]>('SELECT * FROM user_wallets WHERE id = ? FOR UPDATE', [testWalletId]);

      let resolved = false;
      const p2 = conn2.execute<any[]>('SELECT * FROM user_wallets WHERE id = ? FOR UPDATE', [testWalletId])
        .then(() => { resolved = true; });

      await new Promise(r => setTimeout(r, 300));
      expect(resolved).toBe(false);

      await conn1.commit();
      await p2;
      expect(resolved).toBe(true);
    } finally {
      try { conn1.release(); } catch {}
      try { conn2.release(); } catch {}
    }
  });
});
