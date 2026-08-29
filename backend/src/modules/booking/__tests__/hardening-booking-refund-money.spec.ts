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

  /** Insert a captured payment transaction for a booking (authoritative paid amount). */
  async function insertPayment(bookingId: number, amount: number, method = 'wallet') {
    await pool.execute<RowData>(
      `INSERT INTO payment_transactions (user_id, booking_id, reference_type, payment_method, gateway_provider, gateway_reference, amount, payment_status, trace_id)
       VALUES (?, ?, 'booking', ?, 'wallet_system', ?, ?, 'paid', UUID())`,
      [userId, bookingId, method, `w4_payment_${bookingId}_${Date.now()}`, amount],
    );
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
    // V1 booking: actual captured amount = total (1000) + tax (100) = 1100.
    await insertPayment(bookingId, 1100);
    const before = await wallet();

    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();
    const cancelled = await svc.cancelBooking(bookingId, userId, 'W4 wallet test');

    const after = await wallet();
    // Money moved first: wallet credited with the full (fee-free) refund of the
    // ACTUAL captured amount (1100 = total + tax), never more.
    expect(cancelled.booking_status).toBe('cancelled');
    expect(after.balance).toBeCloseTo(before.balance + 1100, 2);
    const [row] = await pool.execute<RowData>(`SELECT refunded_amount FROM bookings WHERE id = ?`, [bookingId]);
    expect(Number((row as any[])[0].refunded_amount)).toBeCloseTo(1100, 2);
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

describe('P3-9 — booking refund amount derives from the actual paid amount', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number;
  let userId: number; let walletId: number;

  const EMAIL = 'p39@courtzon.test';
  const PHONE = '+2010999888777';

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), ?, 1, 'P3-9 Refund Tax Org', 'p39-refund-tax', 1)`,
      [(ot as any[])[0].id],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'P39 Branch', 'p39-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
       VALUES (UUID(), 'P39 Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
      [branchId],
    );
    resourceId = (r as any).insertId;
    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0999888777', ?, ?, 'x', 'P39 Tester', 'male')`,
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
    await pool.execute(`DELETE FROM cancellation_policies WHERE organisation_id = ?`, [orgId]);
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

  async function insertBooking(total: number, tax: number, commission: number, hour: number) {
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method)
       VALUES (?, ?, ?, ?, 'private_match', '2026-12-01', ?, ?, ?, ?, ?, ?, 0, 'confirmed', 'paid', 'wallet')`,
      [userId, orgId, branchId, resourceId,
       `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`,
       total, tax, commission, total - commission],
    );
    return (res as any).insertId;
  }

  async function insertPayment(bookingId: number, amount: number) {
    await pool.execute<RowData>(
      `INSERT INTO payment_transactions (user_id, booking_id, reference_type, payment_method, gateway_provider, gateway_reference, amount, payment_status, trace_id)
       VALUES (?, ?, 'booking', 'wallet', 'wallet_system', ?, ?, 'paid', UUID())`,
      [userId, bookingId, `p39_${bookingId}_${Date.now()}`, amount],
    );
  }

  async function walletBalance(): Promise<number> {
    const [rows] = await pool.execute<RowData>(`SELECT balance FROM user_wallets WHERE id = ?`, [walletId]);
    return Number((rows as any[])[0].balance);
  }

  async function refundedAmount(bookingId: number): Promise<number> {
    const [rows] = await pool.execute<RowData>(`SELECT refunded_amount FROM bookings WHERE id = ?`, [bookingId]);
    return Number((rows as any[])[0].refunded_amount);
  }

  it('V1 full wallet refund with tax: total=100 tax=9 actual paid=109 → refund/wallet credit 109', async () => {
    const bookingId = await insertBooking(100, 9, 10, 20);
    await insertPayment(bookingId, 109); // V1: actual captured = total + tax
    const before = await walletBalance();

    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();
    await svc.cancelBooking(bookingId, userId, 'P3-9 V1 full');

    expect(await walletBalance()).toBeCloseTo(before + 109, 2);
    expect(await refundedAmount(bookingId)).toBeCloseTo(109, 2);
  });

  it('V2 full refund: actual paid=100 → refund 100, MUST NOT refund 109', async () => {
    const bookingId = await insertBooking(100, 9, 10, 21);
    await insertPayment(bookingId, 100); // V2: actual captured = total only (tax not charged)
    const before = await walletBalance();

    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();
    await svc.cancelBooking(bookingId, userId, 'P3-9 V2 full');

    expect(await walletBalance()).toBeCloseTo(before + 100, 2);
    expect(await refundedAmount(bookingId)).toBeCloseTo(100, 2);
  });

  it('refund cap: requested refund never exceeds the actual paid amount', async () => {
    const bookingId = await insertBooking(100, 9, 10, 22);
    // Paid 100 (V2) but total+tax = 109. Even though _computeRefundCap allows 109,
    // the ceiling must clamp to the actual paid amount (100).
    await insertPayment(bookingId, 100);
    const before = await walletBalance();

    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();
    await svc.cancelBooking(bookingId, userId, 'P3-9 cap');

    expect(await walletBalance()).toBeCloseTo(before + 100, 2);
    expect(await refundedAmount(bookingId)).toBeCloseTo(100, 2);
  });

  it('booking:refunded event refundAmount equals the actual refund amount', async () => {
    const { eventBusV2 } = await import('../../../shared/event-bus/index.js');
    const bookingId = await insertBooking(100, 9, 10, 23);
    await insertPayment(bookingId, 109);
    const emitSpy = vi.spyOn(eventBusV2, 'emit');

    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();
    await svc.cancelBooking(bookingId, userId, 'P3-9 event');

    const refundedEvent = emitSpy.mock.calls.find((c: any) => c[0] === 'booking:refunded');
    expect(refundedEvent).toBeTruthy();
    expect(Number((refundedEvent![1] as any).refundAmount)).toBeCloseTo(109, 2);
    emitSpy.mockRestore();
  });

  it('accounting input equals actual refund amount (booking_wallet_refund uses paymentAmount = actual)', async () => {
    const { bookingAccounting } = await import('../../financial/application/booking-accounting.service.js');
    const bookingId = await insertBooking(100, 9, 10, 24);
    await insertPayment(bookingId, 109);
    // Full V1 refund → full economic reversal: org 90, commission 10, tax 9, payment 109.
    const refund = await bookingAccounting.computeRefundEconomics(bookingId, 109);
    expect(refund).not.toBeNull();
    expect(refund!.refundRatio).toBeCloseTo(1, 2);
    expect(refund!.orgAmount).toBe(90);
    expect(refund!.commissionAmount).toBe(10);
    expect(refund!.taxAmount).toBe(9);
    expect(refund!.paymentAmount).toBe(109);
  });

  it('zero/edge: no captured payment row → refund base falls back to total_amount (no tax minting)', async () => {
    // A booking marked 'paid' with NO payment_transactions row (legacy/COD-like).
    // paidAmount = 0 → refundBase = total_amount (100) → refund 100, NOT 109.
    const bookingId = await insertBooking(100, 9, 10, 25);
    const before = await walletBalance();

    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();
    await svc.cancelBooking(bookingId, userId, 'P3-9 no payment row');

    expect(await walletBalance()).toBeCloseTo(before + 100, 2);
    expect(await refundedAmount(bookingId)).toBeCloseTo(100, 2);
  });
});