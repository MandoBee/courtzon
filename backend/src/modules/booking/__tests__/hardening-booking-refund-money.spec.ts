import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { ConflictError } from '../../../shared/errors/app-error.js';
type RowData = RowDataPacket[];

const paymentSvcMock = vi.hoisted(() => ({ refund: vi.fn(async () => ({ success: true, refundId: 'gw_1' })) }));
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService: paymentSvcMock }));

/**
 * Hardening W1 + W4 (booking side) — Integration.
 *
 *  - W1: COD refunds must NOT touch user_wallets.balance nor insert
 *    wallet_transactions rows. COD funds never enter the wallet (cash is
 *    collected by the org, outside the platform), so refunding them from the
 *    wallet would mint money from nothing. Previously the COD helpers mutated
 *    both. Now they are record-only (operational double entry + canonical
 *    booking:refunded emit).
 *  - W4: a booking refund must throw on money-movement failure instead of
 *    silently posting refund accounting (no false refund). Wallet-paid booking
 *    refunds credit the wallet BEFORE booking:refunded / refunded_amount.
 *    Card bookings with NO payment_transactions row can only be cancelled with
 *    zero refund accounting (a GL reversal without money movement is false).
 */
describe('Hardening Booking Refund Money Movement', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number;
  let userId: number; let walletId: number;

  const EMAIL = 'hardening-refund-money@courtzon.test';
  const PHONE = '+2010111222333';

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    // ── Sandbox org ──
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), ?, 1, 'Hardening Refund Money Org', 'hardening-refund-money', 1)`,
      [(ot as any[])[0].id],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'HRM Branch', 'hrm-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
       VALUES (UUID(), 'HRM Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
      [branchId],
    );
    resourceId = (r as any).insertId;

    // ── Dedicated user + wallet (isolates balance assertions from shared seed data) ──
    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0111222333', ?, ?, 'x', 'Hardening Tester', 'male')`,
      [PHONE, EMAIL],
    );
    userId = (u as any).insertId;
    const [w] = await pool.execute<RowData>(
      `INSERT INTO user_wallets (user_id, balance, reserved_balance, currency_code, is_locked, version)
       VALUES (?, 10000, 0, 'EGP', 0, 1)`,
      [userId],
    );
    walletId = (w as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM wallet_transactions WHERE wallet_id = ?`, [walletId]);
    await pool.execute(`DELETE FROM payment_transactions WHERE user_id = ?`, [userId]);
    await pool.execute(`DELETE FROM processed_commands WHERE subscriber_id LIKE 'CancelBooking%'`);
    await pool.execute(`DELETE FROM transaction_entries WHERE transaction_id IN (SELECT id FROM transactions WHERE source_type = 'booking' AND source_id IN (SELECT id FROM bookings WHERE organisation_id = ?))`, [orgId]);
    await pool.execute(`DELETE FROM transactions WHERE source_type = 'booking' AND source_id IN (SELECT id FROM bookings WHERE organisation_id = ?)`, [orgId]);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [orgId]);
    if (resourceId) await pool.execute(`DELETE FROM resources WHERE id = ?`, [resourceId]);
    if (branchId) await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.execute(`DELETE FROM user_wallets WHERE user_id = ?`, [userId]);
    await pool.execute(`DELETE FROM users WHERE id = ?`, [userId]);
    await pool.end();
  });

  async function insertBooking(paymentMethod: string, paymentStatus: string, hour: number, total = 1000, tax = 100) {
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method)
       VALUES (?, ?, ?, ?, 'private_match', '2026-12-01', ?, ?, ?, ?, ?, ?, 0, 'confirmed', ?, ?)`,
      [userId, orgId, branchId, resourceId,
       `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`,
       total, tax, 200, total - 200, paymentStatus, paymentMethod],
    );
    return (res as any).insertId;
  }

  async function wallet(): Promise<{ balance: number; reserved_balance: number }> {
    const [rows] = await pool.execute<RowData>(`SELECT balance, reserved_balance FROM user_wallets WHERE id = ?`, [walletId]);
    return { balance: Number((rows as any[])[0].balance), reserved_balance: Number((rows as any[])[0].reserved_balance) };
  }

  async function walletTxnCount(bookingId: number): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM wallet_transactions WHERE wallet_id = ? AND reference_type = 'booking' AND reference_id = ?`,
      [walletId, bookingId],
    );
    return Number((rows as any[])[0].cnt);
  }

  it('W1: COD cancellation refunds without touching wallet balance or wallet_transactions', async () => {
    const bookingId = await insertBooking('cod', 'pending', 9);
    const before = await wallet();
    const beforeTxc = await walletTxnCount(bookingId);

    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();
    const cancelled = await svc.cancelBooking(bookingId, userId, 'W1 test');

    expect(cancelled.booking_status).toBe('cancelled');
    const after = await wallet();
    expect(after.balance).toBe(before.balance);
    expect(after.reserved_balance).toBe(before.reserved_balance);
    expect(await walletTxnCount(bookingId)).toBe(beforeTxc);
    // Canonical refund accounting still advances (remaining refundable tracked).
    const [row] = await pool.execute<RowData>(`SELECT refunded_amount FROM bookings WHERE id = ?`, [bookingId]);
    expect(Number((row as any[])[0].refunded_amount)).toBeCloseTo(1000, 2);
  });

  it('W1: repeated COD cancellation is rejected (no double refund)', async () => {
    const bookingId = await insertBooking('cod', 'pending', 10);
    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();
    await svc.cancelBooking(bookingId, userId, 'W1 test');
    await expect(svc.cancelBooking(bookingId, userId, 'again')).rejects.toBeInstanceOf(ConflictError);
    const before = await wallet();
    expect(before.balance).toBe(10000);
    const [row] = await pool.execute<RowData>(`SELECT refunded_amount FROM bookings WHERE id = ?`, [bookingId]);
    expect(Number((row as any[])[0].refunded_amount)).toBeCloseTo(1000, 2);
  });

  it('W4: wallet-paid booking cancellation credits the wallet BEFORE refund accounting', async () => {
    const bookingId = await insertBooking('wallet', 'paid', 11);
    const before = await wallet();

    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();
    const cancelled = await svc.cancelBooking(bookingId, userId, 'W4 wallet test');

    const after = await wallet();
    // Money moved first: wallet credited with the full (fee-free) refund.
    expect(cancelled.booking_status).toBe('cancelled');
    expect(after.balance).toBeCloseTo(before.balance + 1000, 2);
    const [row] = await pool.execute<RowData>(`SELECT refunded_amount FROM bookings WHERE id = ?`, [bookingId]);
    expect(Number((row as any[])[0].refunded_amount)).toBeCloseTo(1000, 2);
  });

  it('W4: card booking with NO payment_transactions → cancel is allowed but refund accounting does NOT advance', async () => {
    const bookingId = await insertBooking('card', 'paid', 12);
    // No payment_transactions row for this booking — money was never captured
    // by a record the platform can reverse.
    const before = await wallet();

    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();
    const cancelled = await svc.cancelBooking(bookingId, userId, 'W4 card no-payment-row test');

    expect(cancelled.booking_status).toBe('cancelled');
    const after = await wallet();
    expect(after.balance).toBe(before.balance);
    const [row] = await pool.execute<RowData>(`SELECT refunded_amount FROM bookings WHERE id = ?`, [bookingId]);
    expect(Number((row as any[])[0].refunded_amount)).toBe(0);
  });

  it('W4: card booking refund THROWS when the gateway refund fails (no false refund)', async () => {
    const bookingId = await insertBooking('card', 'paid', 13);
    await pool.execute<RowData>(
      `INSERT INTO payment_transactions (user_id, booking_id, reference_type, payment_method, gateway_provider, gateway_reference, amount, payment_status, trace_id)
       VALUES (?, ?, 'booking', 'card', 'paymob', ?, 1100, 'paid', UUID())`,
      [userId, bookingId, `hr_gw_${bookingId}`],
    );
    paymentSvcMock.refund.mockResolvedValueOnce({ success: false, errorMessage: 'gateway down' });

    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();
    // The booking status was already committed (state-first), but the refund
    // path must FAIL LOUDLY instead of silently claiming a successful refund.
    await expect(svc.cancelBooking(bookingId, userId, 'W4 gateway fail test')).rejects.toThrow(/Payment gateway refund failed for booking/);
    const [row] = await pool.execute<RowData>(`SELECT refunded_amount FROM bookings WHERE id = ?`, [bookingId]);
    expect(Number((row as any[])[0].refunded_amount)).toBe(0);
  });

  it('W4: wallet-paid booking refund THROWS when the wallet credit cannot happen (no false refund)', async () => {
    const bookingId = await insertBooking('wallet', 'paid', 14);
    const before = await wallet();
    // Lock the wallet: lockAndGetBalance returns null (WHERE is_locked = FALSE)
    // → the money cannot move → the refund must fail loudly and advance NO
    // refund accounting.
    await pool.execute(`UPDATE user_wallets SET is_locked = 1 WHERE id = ?`, [walletId]);

    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();
    await expect(svc.cancelBooking(bookingId, userId, 'W4 wallet fail test')).rejects.toThrow(/locked or missing/);

    await pool.execute(`UPDATE user_wallets SET is_locked = 0 WHERE id = ?`, [walletId]);
    const after = await wallet();
    expect(after.balance).toBe(before.balance);
    const [row] = await pool.execute<RowData>(`SELECT refunded_amount FROM bookings WHERE id = ?`, [bookingId]);
    expect(Number((row as any[])[0].refunded_amount)).toBe(0);
  });
});