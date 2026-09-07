import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3021';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { ConflictError } from '../../../shared/errors/app-error.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';

type RowData = RowDataPacket[];

/**
 * BUG 1 + BUG 2 — No-show lifecycle.
 *
 * confirmed → no_show and checked_in → no_show must transition to the REAL
 * `no_show` booking status (never `cancelled`), emit ONLY the canonical
 * `booking:no-show` event (never `booking:cancelled`), and produce exactly one
 * no-show notification. Invalid no-show transitions must surface as 4xx
 * (ConflictError), not a generic 500.
 */
describe('Booking no-show lifecycle (BUG 1 + BUG 2)', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number; let userId: number;
  const SLUG = 'noshow-bug-org';
  const PHONE = '+2010111222444';
  const EMAIL = 'noshow-bug@courtzon.test';

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    // Deterministic fixture cleanup (unique slug + phone/email → parallel-safe).
    const [existing] = await pool.execute<RowData>(`SELECT id FROM organisations WHERE slug = ?`, [SLUG]);
    for (const row of existing as any[]) {
      const oid = Number(row.id);
      await pool.execute(`DELETE FROM booking_slots WHERE booking_id IN (SELECT id FROM bookings WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM transaction_entries WHERE transaction_id IN (SELECT id FROM transactions WHERE source_type='booking' AND source_id IN (SELECT id FROM bookings WHERE organisation_id = ?))`, [oid]);
      await pool.execute(`DELETE FROM transactions WHERE source_type='booking' AND source_id IN (SELECT id FROM bookings WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM resources WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM branches WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM organisations WHERE id = ?`, [oid]);
    }
    await pool.execute(`DELETE FROM users WHERE full_phone = ? OR email = ?`, [PHONE, EMAIL]);

    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'NoShow Bug Org', ?, 1)`,
      [(ot as any[])[0].id, SLUG],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'NS Branch', 'ns-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
       VALUES (UUID(), 'NS Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
      [branchId],
    );
    resourceId = (r as any).insertId;
    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0111222444', ?, ?, 'x', 'NS Tester', 'male')`,
      [PHONE, EMAIL],
    );
    userId = (u as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM transactions WHERE source_type='booking' AND source_id IN (SELECT id FROM bookings WHERE organisation_id = ?)`, [orgId]);
    if (resourceId) await pool.execute(`DELETE FROM resources WHERE id = ?`, [resourceId]);
    if (branchId) await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.execute(`DELETE FROM users WHERE id = ?`, [userId]);
    await pool.end();
  });

  /** Future-dated COD booking in `confirmed` state with aggregate_version=1. */
  async function insertBooking(status = 'confirmed', paymentStatus = 'pending', hour = 10): Promise<number> {
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method, aggregate_version)
       VALUES (?, ?, ?, ?, 'private_match', '2026-12-01', ?, ?, 1000, 100, 200, 800, 0, ?, ?, 'cash', 1)`,
      [userId, orgId, branchId, resourceId,
       `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`,
       status, paymentStatus],
    );
    return (res as any).insertId;
  }

  it('confirmed → no_show persists booking_status=no_show (not cancelled)', async () => {
    const bookingId = await insertBooking();
    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();

    const emitSpy = vi.spyOn(eventBusV2, 'emit');
    await svc.updateBookingStatus(bookingId, 'no_show', 1);

    const [rows] = await pool.execute<RowData>(`SELECT booking_status FROM bookings WHERE id = ?`, [bookingId]);
    expect((rows as any[])[0].booking_status).toBe('no_show');

    const noShowCalls = emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:no-show');
    const cancelledCalls = emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:cancelled');
    expect(noShowCalls).toHaveLength(1);
    expect(cancelledCalls).toHaveLength(0);
    expect(Number((noShowCalls[0][1] as any).userId)).toBe(userId);
    emitSpy.mockRestore();
  });

  it('checked_in → no_show persists booking_status=no_show (aggregate allows it)', async () => {
    const bookingId = await insertBooking();
    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();

    await svc.checkIn(bookingId, 1);
    const [ciRows] = await pool.execute<RowData>(`SELECT booking_status FROM bookings WHERE id = ?`, [bookingId]);
    expect((ciRows as any[])[0].booking_status).toBe('checked_in');

    await svc.updateBookingStatus(bookingId, 'no_show', 1);
    const [rows] = await pool.execute<RowData>(`SELECT booking_status FROM bookings WHERE id = ?`, [bookingId]);
    expect((rows as any[])[0].booking_status).toBe('no_show');
  });

  it('completed → no_show is rejected with ConflictError (4xx), not a generic 500', async () => {
    const bookingId = await insertBooking('completed', 'paid', 12);
    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();

    await expect(svc.updateBookingStatus(bookingId, 'no_show', 1)).rejects.toBeInstanceOf(ConflictError);
    const [rows] = await pool.execute<RowData>(`SELECT booking_status FROM bookings WHERE id = ?`, [bookingId]);
    expect((rows as any[])[0].booking_status).toBe('completed');
  });

  it('source: the no_show branch uses the dedicated NoShowBooking command and never CancelBooking', () => {
    const src = readFileSync(new URL('../application/booking.service.ts', import.meta.url), 'utf-8');
    const noShowIdx = src.indexOf("if (status === 'no_show') {");
    expect(noShowIdx).toBeGreaterThan(-1);
    const branch = src.slice(noShowIdx, noShowIdx + 1200);
    expect(branch).toContain("executeBookingCommand('NoShowBooking', noShowBookingHandler");
    expect(branch).not.toContain("executeBookingCommand('CancelBooking'");
  });

  it('COD no-show keeps the booking in no_show state and never emits booking:cancelled', async () => {
    const bookingId = await insertBooking();
    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();

    const emitSpy = vi.spyOn(eventBusV2, 'emit');
    await svc.updateBookingStatus(bookingId, 'no_show', 1);
    expect(emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:cancelled')).toHaveLength(0);
    expect(emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:no-show')).toHaveLength(1);
    emitSpy.mockRestore();

    const [rows] = await pool.execute<RowData>(`SELECT booking_status FROM bookings WHERE id = ?`, [bookingId]);
    expect((rows as any[])[0].booking_status).toBe('no_show');
  });
});