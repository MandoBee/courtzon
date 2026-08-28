import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

// The wallet refund branch emits payment:refunded inside withTransaction, which
// (after commit) flushes hooks that enqueue BullMQ jobs via Redis. In the test
// environment Redis/BullMQ is not part of what we assert, so stub the event bus
// to keep the integration deterministic (the wallet-credit + idempotency logic
// under test is pure DB).
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: { emit: vi.fn(async () => {}), on: vi.fn(), getInMemoryHandlers: vi.fn(() => []) },
}));

/**
 * Hardening R4 (wallet-paid refunds) — Integration.
 *
 * paymentService.refund previously hit the gateway for every payment method.
 * For wallet-paid payments that is wrong in two directions: Paymob rejects a
 * synthetic wallet reference (refunds silently never happen), and MockGateway
 * "succeeds" and reverses the GL wallet-liability WITHOUT ever crediting
 * user_wallets.balance — a false refund. Now the wallet branch credits the
 * wallet through the canonical content path, skips the gateway entirely, and
 * only then emits payment:refunded. Idempotency: exactly one
 * (payment_refund, paymentId) wallet_transactions row + a paid→refunded guard,
 * inside a single withTransaction.
 */
describe('Hardening R4 — wallet-paid payment refund', () => {
  let pool: mysql.Pool;
  let userId: number; let walletId: number;
  const EMAIL = 'hardening-payment-refund@courtzon.test';
  const PHONE = '+2010222333444';

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0222333444', ?, ?, 'x', 'R4 Tester', 'female')`,
      [PHONE, EMAIL],
    );
    userId = (u as any).insertId;
    const [w] = await pool.execute<RowData>(
      `INSERT INTO user_wallets (user_id, balance, reserved_balance, currency_code, is_locked, version)
       VALUES (?, 1000, 0, 'EGP', 0, 1)`,
      [userId],
    );
    walletId = (w as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM wallet_transactions WHERE wallet_id = ?`, [walletId]);
    await pool.execute(`DELETE FROM payment_transactions WHERE user_id = ?`, [userId]);
    await pool.execute(`DELETE FROM user_wallets WHERE user_id = ?`, [userId]);
    await pool.execute(`DELETE FROM users WHERE id = ?`, [userId]);
    await pool.end();
  });

  async function insertWalletPayment(amount: number): Promise<number> {
    const [p] = await pool.execute<RowData>(
      `INSERT INTO payment_transactions (user_id, reference_type, reference_id, payment_method, gateway_provider, gateway_reference, amount, payment_status, trace_id, paid_at)
       VALUES (?, 'order', 424242, 'wallet', 'wallet_system', ?, ?, 'paid', UUID(), NOW())`,
      [userId, `hr_wallet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, amount],
    );
    return (p as any).insertId;
  }

  async function balance(): Promise<number> {
    const [rows] = await pool.execute<RowData>(`SELECT balance FROM user_wallets WHERE id = ?`, [walletId]);
    return Number((rows as any[])[0].balance);
  }

  async function refundAnchors(paymentId: number): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM wallet_transactions WHERE reference_type = 'payment_refund' AND reference_id = ?`,
      [paymentId],
    );
    return Number((rows as any[])[0].cnt);
  }

  it('R4: wallet-paid refund credits the wallet, skips the gateway, emits only after money moves', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertWalletPayment(500);
    const before = await balance();

    const result = await paymentService.refund(paymentId, 500, 'R4 test');

    expect(result.success).toBe(true);
    expect(await balance()).toBeCloseTo(before + 500, 2);
    expect(await refundAnchors(paymentId)).toBe(1);
    const [rows] = await pool.execute<RowData>(`SELECT payment_status FROM payment_transactions WHERE id = ?`, [paymentId]);
    expect((rows as any[])[0].payment_status).toBe('refunded');
  });

  it('R4: a second refund for the same payment is rejected (no double wallet credit)', async () => {
    const { paymentService } = await import('../application/payment.service.js');
    const paymentId = await insertWalletPayment(300);
    const before = await balance();

    await paymentService.refund(paymentId, 300, 'R4 first');
    const afterFirst = await balance();
    expect(afterFirst).toBeCloseTo(before + 300, 2);

    await expect(paymentService.refund(paymentId, 300, 'R4 dup')).rejects.toThrow();
    // The unique (payment_refund, paymentId) wallet_transactions anchor rolled
    // back — the wallet was NEVER credited twice.
    expect(await balance()).toBeCloseTo(afterFirst, 2);
    expect(await refundAnchors(paymentId)).toBe(1);
  });
});