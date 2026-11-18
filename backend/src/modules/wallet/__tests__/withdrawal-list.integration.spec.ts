import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

/**
 * UR-02 / W1-F-009 — real database regression for the admin withdrawal list.
 *
 * Reproduces the Live 500 at SQL level: LIMIT/OFFSET must be numeric literals
 * for mysql2's text protocol. Runs only against the approved local Docker DB
 * (127.0.0.1:3307 / courtzon_v3) and removes exactly its own fixture rows.
 */
const USER_ID = 20061201;
let pool: mysql.Pool;

beforeAll(async () => {
  pool = mysql.createPool({
    host: '127.0.0.1', port: 3307, user: 'root',
    password: 'courtzon2026', database: 'courtzon_v3',
  });
  await pool.execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
     VALUES (?, UUID(), 1, ?, ?, ?, '$2b$10$x', 'UR02 Fixture', 'male', 'active')
     ON DUPLICATE KEY UPDATE email = VALUES(email)`,
    [USER_ID, `015${USER_ID}`, `+20${USER_ID}`, `ur02-${USER_ID}@courtzon.test`],
  );
  await pool.execute(
    `INSERT INTO user_wallets (user_id, balance, reserved_balance, currency_code, is_locked, version)
     VALUES (?, 100, 0, 'EGP', 0, 1)
     ON DUPLICATE KEY UPDATE balance = 100`,
    [USER_ID],
  );
  const [wallet] = await pool.execute<any[]>('SELECT id FROM user_wallets WHERE user_id = ?', [USER_ID]);
  await pool.execute(
    `INSERT INTO withdrawal_requests (user_id, wallet_id, amount, reason, method, status)
     VALUES (?, ?, 10, 'UR-02 regression fixture', 'cash', 'pending')`,
    [USER_ID, wallet[0].id],
  );
});

afterAll(async () => {
  await pool.execute('DELETE FROM withdrawal_requests WHERE user_id = ?', [USER_ID]);
  await pool.execute('DELETE FROM user_wallets WHERE user_id = ?', [USER_ID]);
  await pool.execute('DELETE FROM users WHERE id = ?', [USER_ID]);
  await pool.end();
});

describe('withdrawalService.list — real DB regression', () => {
  it('returns the queue without a 1064 parse error', async () => {
    const { withdrawalService } = await import('../application/withdrawal.service.js');
    const result = await withdrawalService.list({ page: 1, limit: 20 });

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.data.some((row: any) => row.user_id === USER_ID)).toBe(true);
  });

  it('paginates with a non-zero offset and still reports the total', async () => {
    const { withdrawalService } = await import('../application/withdrawal.service.js');
    const result = await withdrawalService.list({ page: 2, limit: 1 });

    expect(result.page).toBe(2);
    expect(result.limit).toBe(1);
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(result.data)).toBe(true);
  });
});
