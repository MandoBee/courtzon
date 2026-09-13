// ============================================================================
// PHASE 0 / GROUP 1 — Booking refund idempotency + concurrency hardening
// ============================================================================
// Proves the hardened Booking refund path (booking.service.ts):
//   - a single refund moves money exactly once, anchored on a unique
//     wallet_transactions (booking_refund, <payment_transactions.id>) row
//   - same-refund retry and concurrent identical requests collapse to ONE
//     money movement (the booking row FOR UPDATE serializes the cap; the
//     wallet anchor is the DB backstop)
//   - concurrent/partial refund requests never exceed the refundable amount
//   - a failed refund does not consume the refundable amount
//   - wallet-as-payment remains disabled
// Runs against the shared local Docker MySQL (courtzon_v3).
// ============================================================================
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3036';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

type RowData = RowDataPacket[];

describe('PHASE 0 — Booking refund idempotency + concurrency', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number;
  let userId: number; let walletId: number;
  let BookingService: any;

  const EMAIL = 'refund-idem@courtzon.test';
  const PHONE = '+2010111222999';
  let seq = 0;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 10, charset: 'utf8mb4' });

    // Deterministic cleanup of a prior interrupted run.
    const [existing] = await pool.execute<RowData>(`SELECT id FROM organisations WHERE slug = 'refund-idem-org'`);
    for (const row of existing as any[]) {
      const oid = Number(row.id);
      await pool.execute(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM user_wallets WHERE user_id IN (SELECT id FROM users WHERE id IN (SELECT owner_id FROM organisations WHERE id = ?)))`, [oid]);
      await pool.execute(`DELETE FROM payment_transactions WHERE user_id IN (SELECT owner_id FROM organisations WHERE id = ?)`, [oid]);
      await pool.execute(`DELETE FROM booking_slots WHERE booking_id IN (SELECT id FROM bookings WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM resources WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM branches WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM user_wallets WHERE user_id IN (SELECT id FROM users WHERE full_phone = ? OR email = ?)`, [PHONE, EMAIL]);
      await pool.execute(`DELETE FROM users WHERE full_phone = ? OR email = ?`, [PHONE, EMAIL]);
      await pool.execute(`DELETE FROM organisations WHERE id = ?`, [oid]);
    }

    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), ?, 1, 'Refund Idem Org', 'refund-idem-org', 1)`,
      [(ot as any[])[0].id],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'RI Branch', 'ri-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
       VALUES (UUID(), 'RI Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
      [branchId],
    );
    resourceId = (r as any).insertId;

    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0111222999', ?, ?, 'x', 'Refund Idem Tester', 'male')`,
      [PHONE, EMAIL],
    );
    userId = (u as any).insertId;
    const [w] = await pool.execute<RowData>(
      `INSERT INTO user_wallets (user_id, balance, reserved_balance, currency_code, is_locked, version)
       VALUES (?, 10000, 0, 'EGP', 0, 1)`,
      [userId],
    );
    walletId = (w as any).insertId;

    const mod = await import('../application/booking.service.js');
    BookingService = mod.BookingService;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM wallet_transactions WHERE wallet_id = ?`, [walletId]);
    await pool.execute(`DELETE FROM payment_transactions WHERE user_id = ?`, [userId]);
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

  async function insertBooking(paymentMethod: string, paymentStatus: string): Promise<number> {
    seq += 1;
    const hour = 8 + (seq % 10);
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method)
       VALUES (?, ?, ?, ?, 'private_match', '2026-12-01', ?, ?, 1000, 100, 200, 800, 0, 'confirmed', ?, ?)`,
      [userId, orgId, branchId, resourceId,
       `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`,
       paymentStatus, paymentMethod],
    );
    return (res as any).insertId;
  }

  async function insertPayment(bookingId: number, amount = 1100): Promise<number> {
    const [res] = await pool.execute<RowData>(
      `INSERT INTO payment_transactions (user_id, booking_id, reference_type, payment_method, gateway_provider, gateway_reference, amount, payment_status, trace_id)
       VALUES (?, ?, 'booking', 'wallet', 'wallet_system', ?, ?, 'paid', UUID())`,
      [userId, bookingId, `ri_pay_${bookingId}_${Date.now()}`, amount],
    );
    return (res as any).insertId;
  }

  async function wallet(): Promise<number> {
    const [rows] = await pool.execute<RowData>(`SELECT balance FROM user_wallets WHERE id = ?`, [walletId]);
    return Number((rows as any[])[0].balance);
  }

  async function refundedAmount(bookingId: number): Promise<number> {
    const [rows] = await pool.execute<RowData>(`SELECT COALESCE(refunded_amount, 0) AS a FROM bookings WHERE id = ?`, [bookingId]);
    return Number((rows as any[])[0].a);
  }

  async function anchorCount(paymentTxId: number): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS c FROM wallet_transactions WHERE reference_type = 'booking_refund' AND reference_id = ?`,
      [paymentTxId],
    );
    return Number((rows as any[])[0].c);
  }

  async function bookingRow(bookingId: number): Promise<any> {
    const [rows] = await pool.execute<RowData>(
      `SELECT id, user_id, organisation_id, branch_id, total_amount, tax_amount, payment_method, payment_status, refunded_amount
       FROM bookings WHERE id = ?`,
      [bookingId],
    );
    return (rows as any[])[0];
  }

  const refund = async (booking: any, amount: number) => {
    const svc = new BookingService();
    await (svc as any)._processGatewayRefund(booking, amount);
  };

  it('1. single wallet refund succeeds: wallet credited once, refunded_amount set, unique anchor', async () => {
    const bookingId = await insertBooking('wallet', 'paid');
    const paymentTxId = await insertPayment(bookingId, 1100);
    const before = await wallet();

    await refund(await bookingRow(bookingId), 1100);

    expect(await wallet()).toBeCloseTo(before + 1100, 2);
    expect(await refundedAmount(bookingId)).toBeCloseTo(1100, 2);
    expect(await anchorCount(paymentTxId)).toBe(1);
  });

  it('2. same refund request repeated → only ONE money movement (idempotent)', async () => {
    const bookingId = await insertBooking('wallet', 'paid');
    const paymentTxId = await insertPayment(bookingId, 1100);
    const before = await wallet();
    const row = await bookingRow(bookingId);

    await refund(row, 1100);
    await refund(row, 1100); // retry of the SAME logical refund
    await refund(row, 1100); // and again

    expect(await wallet()).toBeCloseTo(before + 1100, 2);
    expect(await refundedAmount(bookingId)).toBeCloseTo(1100, 2);
    expect(await anchorCount(paymentTxId)).toBe(1);
  });

  it('3. concurrent identical refund requests → exactly ONE money movement', async () => {
    const bookingId = await insertBooking('wallet', 'paid');
    const paymentTxId = await insertPayment(bookingId, 1100);
    const before = await wallet();
    const row = await bookingRow(bookingId);

    await Promise.all([refund(row, 1100), refund(row, 1100), refund(row, 1100)]);

    expect(await wallet()).toBeCloseTo(before + 1100, 2);
    expect(await refundedAmount(bookingId)).toBeCloseTo(1100, 2);
    expect(await anchorCount(paymentTxId)).toBe(1);
  });

  it('4. concurrent refund requests never exceed the refundable amount', async () => {
    const bookingId = await insertBooking('wallet', 'paid');
    const paymentTxId = await insertPayment(bookingId, 1100);
    const before = await wallet();
    const row = await bookingRow(bookingId);

    // Two concurrent refunds each requesting 700 on a 1100 booking must not
    // move 1400 — the booking-row serialization + cap keep the total at 1100.
    await Promise.all([refund(row, 700), refund(row, 700)]);

    const credited = (await wallet()) - before;
    expect(credited).toBeLessThanOrEqual(1100);
    expect(await refundedAmount(bookingId)).toBeLessThanOrEqual(1100);
    expect(await anchorCount(paymentTxId)).toBe(1);
    expect(credited).toBeCloseTo(await refundedAmount(bookingId), 2);
  });

  it('5. wallet anchor is unique/idempotent (one booking_refund row per payment)', async () => {
    const bookingId = await insertBooking('wallet', 'paid');
    const paymentTxId = await insertPayment(bookingId, 1100);
    const row = await bookingRow(bookingId);

    await Promise.all([refund(row, 1100), refund(row, 1100)]);
    expect(await anchorCount(paymentTxId)).toBe(1);
  });

  it('6. refunded_amount is updated atomically with the money movement', async () => {
    const bookingId = await insertBooking('wallet', 'paid');
    const paymentTxId = await insertPayment(bookingId, 1100);
    const before = await wallet();
    const row = await bookingRow(bookingId);

    await refund(row, 400); // partial refund 1
    expect(await wallet()).toBeCloseTo(before + 400, 2);
    expect(await refundedAmount(bookingId)).toBeCloseTo(400, 2);

    await refund(row, 400); // partial refund 2 (same payment → idempotent, no new movement)
    expect(await wallet()).toBeCloseTo(before + 400, 2);
    expect(await refundedAmount(bookingId)).toBeCloseTo(400, 2);
    expect(await anchorCount(paymentTxId)).toBe(1);
  });

  it('7. retry after success returns the existing result (no movement, no error)', async () => {
    const bookingId = await insertBooking('wallet', 'paid');
    await insertPayment(bookingId, 1100);
    const before = await wallet();
    const row = await bookingRow(bookingId);

    await refund(row, 1100);
    await expect(refund(row, 1100)).resolves.toBeUndefined(); // no-op, no throw
    expect(await wallet()).toBeCloseTo(before + 1100, 2);
  });

  it('8. failed refund does NOT consume the refundable amount', async () => {
    const bookingId = await insertBooking('wallet', 'paid');
    const paymentTxId = await insertPayment(bookingId, 1100);
    const before = await wallet();
    const row = await bookingRow(bookingId);

    // Lock the wallet → lockAndGetBalance returns null → money cannot move →
    // the whole refund transaction must roll back (no refunded_amount advance).
    await pool.execute(`UPDATE user_wallets SET is_locked = 1 WHERE id = ?`, [walletId]);
    await expect(refund(row, 1100)).rejects.toThrow(/locked or missing/);
    await pool.execute(`UPDATE user_wallets SET is_locked = 0 WHERE id = ?`, [walletId]);

    expect(await wallet()).toBe(before);
    expect(await refundedAmount(bookingId)).toBe(0);
    expect(await anchorCount(paymentTxId)).toBe(0);

    // The refund is retryable after the transient failure.
    await refund(row, 1100);
    expect(await wallet()).toBeCloseTo(before + 1100, 2);
    expect(await refundedAmount(bookingId)).toBeCloseTo(1100, 2);
  });

  it('9. wallet-as-payment remains disabled (shared PaymentService)', async () => {
    const { paymentService } = await import('../../payment/application/payment.service.js');
    await expect(paymentService.charge(userId, {
      referenceType: 'booking', referenceId: 1, amount: 100, currency: 'EGP', paymentMethod: 'wallet',
    })).rejects.toThrow(/Wallet is temporarily unavailable as a payment method/);
  });
});