import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';

process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3025';

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

type RowData = RowDataPacket[];

/**
 * Risk #2 — `_calculateCancellationFee` / `_canUserCancel` NaN regression.
 *
 * mysql2 returns `booking_date` as a JS Date (the pool does not set
 * `dateStrings: true`), so the old `new Date(\`${booking_date}T${start_time}\`)`
 * produced an Invalid Date → `hoursUntilBooking = NaN` → `NaN >= 0` was false →
 * the cancellation policy was NEVER applied (full refund always) and
 * `_canUserCancel` always returned false for orgs with a policy (owner could
 * never cancel). The fix normalizes the date part via
 * `_parseBookingStartDate` (toISOString().slice(0,10)) preserving local-time
 * parsing semantics.
 */
describe('Cancellation policy date parsing (Risk #2)', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number; let userId: number;
  const SLUG = 'cancellation-policy-bug-org';
  const PHONE = '+2010111222999';
  const EMAIL = 'cancellation-policy-bug@courtzon.test';

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    const [existing] = await pool.execute<RowData>(`SELECT id FROM organisations WHERE slug = ?`, [SLUG]);
    for (const row of existing as any[]) {
      const oid = Number(row.id);
      await pool.execute(`DELETE FROM cancellation_policies WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM transactions WHERE source_type='booking' AND source_id IN (SELECT id FROM bookings WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM resources WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM branches WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM organisations WHERE id = ?`, [oid]);
    }
    await pool.execute(`DELETE FROM users WHERE full_phone = ? OR email = ?`, [PHONE, EMAIL]);

    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active, cancellation_policy_level)
       VALUES (UUID(), ?, 1, 'Cancellation Policy Org', ?, 1, 'organisation')`,
      [(ot as any[])[0].id, SLUG],
    );
    orgId = (o as any).insertId;
    // 50% refund policy within a 1-minute window.
    await pool.execute<RowData>(
      `INSERT INTO cancellation_policies (organisation_id, cancellation_window_minutes, refund_percent, is_active)
       VALUES (?, 1, 50, 1)`,
      [orgId],
    );
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'CP Branch', 'cp-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
       VALUES (UUID(), 'CP Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
      [branchId],
    );
    resourceId = (r as any).insertId;
    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0111222999', ?, ?, 'x', 'CP Tester', 'male')`,
      [PHONE, EMAIL],
    );
    userId = (u as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgId]);
    if (resourceId) await pool.execute(`DELETE FROM resources WHERE id = ?`, [resourceId]);
    if (branchId) await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchId]);
    await pool.execute(`DELETE FROM cancellation_policies WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.execute(`DELETE FROM users WHERE id = ?`, [userId]);
    await pool.end();
  });

  async function insertBooking(bookingDate = '2026-12-01', paymentStatus = 'paid', hour = 10): Promise<number> {
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method, aggregate_version)
       VALUES (?, ?, ?, ?, 'private_match', ?, ?, ?, 1000, 100, 200, 800, 0, 'confirmed', ?, 'cod', 1)`,
      [userId, orgId, branchId, resourceId, bookingDate, `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`, paymentStatus],
    );
    return (res as any).insertId;
  }

  it('mysql2 returns booking_date as a Date (proves the failure mode is real)', async () => {
    const bookingId = await insertBooking();
    const { bookingRepository } = await import('../infrastructure/repositories/booking.repository.js');
    const booking = await bookingRepository.findById(bookingId);
    expect(booking.booking_date).toBeInstanceOf(Date);
    // The OLD construction would be Invalid Date:
    const old = new Date(`${booking.booking_date}T${booking.start_time}`);
    expect(Number.isNaN(old.getTime())).toBe(true);
  });

  it('_calculateCancellationFee applies the 50% policy (no NaN) — fee=500 refund=500', async () => {
    const bookingId = await insertBooking();
    const { BookingService } = await import('../application/booking.service.js');
    const { bookingRepository } = await import('../infrastructure/repositories/booking.repository.js');
    const svc = new BookingService();
    const booking = await bookingRepository.findById(bookingId);

    const fee = await (svc as any)._calculateCancellationFee(booking);
    expect(fee.feeAmount).toBe(500);
    expect(fee.refundAmount).toBe(500);
  });

  it('_canUserCancel returns true for a future booking within the window', async () => {
    const bookingId = await insertBooking();
    const { BookingService } = await import('../application/booking.service.js');
    const { bookingRepository } = await import('../infrastructure/repositories/booking.repository.js');
    const svc = new BookingService();
    const booking = await bookingRepository.findById(bookingId);

    expect(await (svc as any)._canUserCancel(booking)).toBe(true);
  });

  it('owner cancelBooking proceeds (does not throw "cancellation window passed")', async () => {
    const bookingId = await insertBooking();
    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();
    // Future booking within the window: no ConflictError, and refund is 50%.
    const cancelled = await svc.cancelBooking(bookingId, userId, 'policy test');
    expect(cancelled.booking_status).toBe('cancelled');
    const [row] = await pool.execute<RowData>(`SELECT refunded_amount FROM bookings WHERE id = ?`, [bookingId]);
    expect(Number((row as any[])[0].refunded_amount)).toBeCloseTo(500, 2);
  });

  it('a past booking still skips the policy (full refund) — preserved behavior', async () => {
    const bookingId = await insertBooking('2020-01-01');
    const { BookingService } = await import('../application/booking.service.js');
    const { bookingRepository } = await import('../infrastructure/repositories/booking.repository.js');
    const svc = new BookingService();
    const booking = await bookingRepository.findById(bookingId);

    const fee = await (svc as any)._calculateCancellationFee(booking);
    // Past booking: the `hoursUntilBooking >= 0` guard is false → no fee.
    expect(fee.feeAmount).toBe(0);
    expect(fee.refundAmount).toBe(1000);
  });

  it('source: no new Date(`${booking_date}T${start_time}`) remains in the cancellation path', () => {
    const src = readFileSync(new URL('../application/booking.service.ts', import.meta.url), 'utf-8');
    expect(src.indexOf('new Date(`${booking.booking_date}T${booking.start_time}`)')).toBe(-1);
    expect(src).toContain('_parseBookingStartDate');
  });
});