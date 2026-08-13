import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Wallet withdrawal accounting unification.
 * Both withdrawal entry points must produce the SAME canonical accounting
 * (withdrawal_request: Dr wallet_liability / Cr withdrawal_clearing) via the
 * `wallet:withdrawal-submitted` event, idempotently.
 */
describe('Wallet Withdrawal Accounting Unification', () => {
  let pool: mysql.Pool;
  const TEST_USER = 888777;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    await pool.execute(`DELETE FROM withdrawal_requests WHERE user_id = ?`, [TEST_USER]);
    await pool.execute(`DELETE FROM ledger_entries WHERE source_type='wallet' AND organisation_id IS NULL AND source_id IN (SELECT id FROM withdrawal_requests WHERE user_id = ?)`, [TEST_USER]);
    await pool.execute(`DELETE FROM user_wallets WHERE user_id = ?`, [TEST_USER]);
    await pool.execute(`DELETE FROM users WHERE id = ?`, [TEST_USER]);
    await pool.execute(
      `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
       VALUES (?, UUID(), 1, '015888777', '+2015888777', 'wd-unify@test.com', '$2b$10$test', 'WD Unify', 'male', 'active')`,
      [TEST_USER],
    );
    await pool.execute(`INSERT INTO user_wallets (user_id, balance, currency_code, version) VALUES (?, 500, 'EGP', 1)`, [TEST_USER]);
    // Register accounting listeners once for this file so the canonical
    // withdrawal_request posting is produced for every test.
    const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
    registerAccountingEventListeners();
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM withdrawal_requests WHERE user_id = ?`, [TEST_USER]);
    await pool.execute(`DELETE FROM ledger_entries WHERE source_type='wallet' AND organisation_id IS NULL AND source_id NOT IN (SELECT id FROM withdrawal_requests WHERE user_id = ?)`, [TEST_USER]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IS NULL AND reference_type LIKE 'wallet%' AND reference_id = 0`, [TEST_USER]);
    await pool.execute(`DELETE FROM user_wallets WHERE user_id = ?`, [TEST_USER]);
    await pool.execute(`DELETE FROM users WHERE id = ?`, [TEST_USER]);
    await pool.end();
  });

  async function accountId(code: string): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code = ? LIMIT 1`, [code],
    );
    return Number((rows as any[])[0].id);
  }

  // Poll for the canonical withdrawal_request posting to appear (the accounting
  // listener runs asynchronously on the event bus; a fixed sleep is flaky under
  // full-suite parallel load).
  async function waitForPosting(withdrawalId: number): Promise<{ c: number; d: number }> {
    for (let i = 0; i < 40; i++) {
      const [rows] = await pool.execute<RowData>(
        `SELECT COALESCE(SUM(CASE WHEN side='credit' THEN amount ELSE 0 END),0) AS c,
                COALESCE(SUM(CASE WHEN side='debit' THEN amount ELSE 0 END),0) AS d
         FROM ledger_entries WHERE source_type='wallet' AND source_id=? AND event_type='withdrawal_request'`,
        [withdrawalId],
      );
      const { c, d } = rows[0] as any;
      if (Number(c) > 0 || Number(d) > 0) return { c: Number(c), d: Number(d) };
      await new Promise((r) => setTimeout(r, 100));
    }
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(CASE WHEN side='credit' THEN amount ELSE 0 END),0) AS c,
              COALESCE(SUM(CASE WHEN side='debit' THEN amount ELSE 0 END),0) AS d
       FROM ledger_entries WHERE source_type='wallet' AND source_id=? AND event_type='withdrawal_request'`,
      [withdrawalId],
    );
    const { c, d } = rows[0] as any;
    return { c: Number(c), d: Number(d) };
  }

  it('1. withdrawalService.submit produces canonical withdrawal_request accounting', async () => {
    const { withdrawalService } = await import('../application/withdrawal.service.js');
    const result = await withdrawalService.submit(TEST_USER, 100, 'test withdrawal');
    const withdrawalId = result.id;

    const { c, d } = await waitForPosting(withdrawalId);
    expect(d).toBe(100); // debit wallet_liability
    expect(c).toBe(100); // credit withdrawal_clearing

    await pool.execute(`DELETE FROM withdrawal_requests WHERE id = ?`, [withdrawalId]);
  });

  it('2. legacy walletService.withdraw also produces canonical withdrawal_request accounting', async () => {
    const { walletService } = await import('../application/wallet.service.js');
    await walletService.withdraw(TEST_USER, 100, 'legacy withdraw');

    // Find the withdrawal request created by the legacy path.
    const [reqRows] = await pool.execute<RowData>(
      `SELECT id FROM withdrawal_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1`, [TEST_USER],
    );
    const withdrawalId = Number((reqRows as any[])[0].id);

    const { c, d } = await waitForPosting(withdrawalId);
    expect(d).toBe(100);
    expect(c).toBe(100);

    await pool.execute(`DELETE FROM withdrawal_requests WHERE id = ?`, [withdrawalId]);
  });

  it('3. duplicate withdrawal-submitted event does not double-post', async () => {
    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');

    // Insert a synthetic withdrawal request row to get a stable id.
    const [r] = await pool.execute<RowData>(
      `INSERT INTO withdrawal_requests (user_id, wallet_id, amount, status, created_at) VALUES (?, (SELECT id FROM user_wallets WHERE user_id=? LIMIT 1), 50, 'pending', NOW())`,
      [TEST_USER, TEST_USER],
    );
    const withdrawalId = Number((r as any).insertId);

    await eventBusV2.emit('wallet:withdrawal-submitted', { withdrawalId, userId: TEST_USER, amount: 50, reason: 'dup test' } as any);
    await eventBusV2.emit('wallet:withdrawal-submitted', { withdrawalId, userId: TEST_USER, amount: 50, reason: 'dup test' } as any);
    await new Promise((res) => setTimeout(res, 400));

    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM ledger_entries WHERE source_type='wallet' AND source_id=? AND event_type='withdrawal_request'`,
      [withdrawalId],
    );
    expect(Number((rows as any[])[0].cnt)).toBe(2); // one debit + one credit, not duplicated

    await pool.execute(`DELETE FROM withdrawal_requests WHERE id = ?`, [withdrawalId]);
  });
});
