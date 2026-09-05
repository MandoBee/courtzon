import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3032';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

type RowData = RowDataPacket[];

/**
 * Bug-fix regression for the two midnight-boundary booking issues reproduced on
 * production (Court 2, 2026-09-05, 23:00 → 00:00, private + public match).
 *
 * Issue 1 — Public Match priced E£200 instead of E£400:
 *   PricingEngine.calculatePrice never handled an overnight session. For
 *   23:00 → 00:00 it computed totalMinutes = 0 - 1380 = -1380, hours =
 *   Math.max(-23, 0.5) = 0.5 → 400 × 0.5 = 200. splitTimeRange / SlotGenerator
 *   both add 24h when end <= start, but PricingEngine did not.
 *
 * Issue 2 — confirmed+paid 23:00 → 00:00 slot still shown as GREEN/available:
 *   SlotGenerator computed endUtc = localToUtc(businessDate, '00:00'), which
 *   resolves to midnight at the START of the grid day (an inverted window
 *   BEFORE the slot's own start). mergeBookingConflicts then fails the overlap
 *   test (slotEnd > bookingStart) and the booked slot stays 'available'.
 *   The end date must be businessDate + endDayOffset (next calendar day).
 *
 * Both bugs affect every booking type at the midnight boundary (the private
 * 22:00 → 23:00 match worked only because its window never crosses midnight).
 */
describe('Overnight (midnight) booking boundary: pricing + availability', () => {
  const DATE = '2026-09-05'; // matches the production scenario; Cairo = UTC+3
  const SLUG = 'overnight-bug-org';
  const PHONE = '+2010111229999';
  const EMAIL = 'overnight-bug@courtzon.test';
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number; let userId: number;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    const [existing] = await pool.execute<RowData>(`SELECT id FROM organisations WHERE slug = ?`, [SLUG]);
    for (const row of existing as any[]) {
      const oid = Number(row.id);
      await pool.execute(`DELETE FROM booking_matchmaking_requests WHERE booking_id IN (SELECT id FROM bookings WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM resources WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM branches WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM organisations WHERE id = ?`, [oid]);
    }
    await pool.execute(`DELETE FROM users WHERE full_phone = ? OR email = ?`, [PHONE, EMAIL]);

    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Overnight Bug Org', ?, 1)`,
      [(ot as any[])[0].id, SLUG],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'ON Branch', 'on-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    // Court-2-like resource: hourly 400, open 13:00 → 01:00 (overnight session)
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time, slot_duration)
       VALUES (UUID(), 'ON Court', (SELECT id FROM resource_types LIMIT 1), ?, 400, 1, '13:00', '01:00', 60)`,
      [branchId],
    );
    resourceId = (r as any).insertId;
    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0111229999', ?, ?, 'x', 'ON Tester', 'male')`,
      [PHONE, EMAIL],
    );
    userId = (u as any).insertId;

    // Fix the clock to a CPU-independent instant mid-day so availability checks
    // are deterministic (13:00+ local slots are all in the future).
    const { TimeEngine } = await import('../../time/time-engine.js');
    const { FakeClock } = await import('../../time/clock.js');
    TimeEngine.setClock(new FakeClock('2026-09-05T08:00:00.000Z'));
  });

  afterAll(async () => {
    const { TimeEngine } = await import('../../time/time-engine.js');
    TimeEngine.resetClock();
    await pool.execute(`DELETE FROM booking_matchmaking_requests WHERE booking_id IN (SELECT id FROM bookings WHERE organisation_id = ?)`, [orgId]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM resources WHERE id = ?`, [resourceId]);
    await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchId]);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id = ?)`, [orgId]);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.execute(`DELETE FROM users WHERE id = ?`, [userId]);
    await pool.end();
  });

  it('Issue 1: 23:00→00:00 (1h overnight) is priced as a full hour (400), not 200', async () => {
    const { pricingEngine } = await import('../domain/pricing-engine.js');

    const overnight = await pricingEngine.calculatePrice(resourceId, '23:00', '00:00');
    expect(overnight.totalPrice).toBe(400);
    expect(overnight.standardAmount).toBe(400);

    // Standard same-day hour is unaffected
    const sameDay = await pricingEngine.calculatePrice(resourceId, '22:00', '23:00');
    expect(sameDay.totalPrice).toBe(400);

    // Two-hour overnight run (23:00→01:00) is continuous across midnight
    const twoHour = await pricingEngine.calculatePrice(resourceId, '23:00', '01:00');
    expect(twoHour.totalPrice).toBe(800);
  });

  it('Issue 2: generated grid slot 23:00→00:00 has its end on the NEXT calendar day in UTC', async () => {
    const { TimeEngine } = await import('../../time/time-engine.js');

    const slots = TimeEngine.generateSlots(DATE, '13:00', '01:00', 60, 'Africa/Cairo') as any[];

    const s23 = slots.find((s: any) => s.localStartTime === '23:00');
    expect(s23).toBeDefined();
    // 23:00 Cairo = 20:00Z. The slot must END at 00:00 of the NEXT day (21:00Z),
    // not at midnight of the START day (09-04 21:00Z, i.e. before it began).
    expect(s23.startAtUtc).toBe('2026-09-05T20:00:00.000Z');
    expect(s23.endAtUtc).toBe('2026-09-05T21:00:00.000Z');

    // Unaffected: an earlier same-day slot keeps its end on the same day
    const s22 = slots.find((s: any) => s.localStartTime === '22:00');
    expect(s22.endAtUtc).toBe('2026-09-05T20:00:00.000Z');

    // Midnight-start slot maps to the next calendar day
    const s00 = slots.find((s: any) => s.localStartTime === '00:00');
    expect(s00.startAtUtc).toBe('2026-09-05T21:00:00.000Z');
    expect(s00.endAtUtc).toBe('2026-09-05T22:00:00.000Z');
  });

  it('Issue 2: a confirmed+paid 23:00→00:00 booking marks the slot booked (no green)', async () => {
    const { bookingService } = await import('../application/booking.service.js');

    await pool.execute<RowData>(
      `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type,
        booking_date, business_date, start_time, end_time, start_at_utc, end_at_utc, total_amount,
        booking_status, payment_status, payment_method, aggregate_version)
       VALUES (UUID(), ?, ?, ?, ?, 'public_match', ?, ?, '23:00:00', '00:00:00', ?, ?, 400, 'confirmed', 'paid', 'card', 1)`,
      [userId, orgId, branchId, resourceId, DATE, DATE, '2026-09-05 20:00:00', '2026-09-05 21:00:00'],
    );

    const slots = await bookingService.getResourceSlots(resourceId, DATE);
    const s23 = slots.find((s: any) => s.slot_start === '23:00');
    expect(s23).toBeDefined();
    expect(s23.startAtUtc).toBe('2026-09-05T20:00:00.000Z');
    expect(s23.endAtUtc).toBe('2026-09-05T21:00:00.000Z');
    // The booked public-match slot must no longer be offered as available.
    expect(s23.status).not.toBe('available');
    expect(s23.status).toBe('booked');

    // Adjacent slot stays available
    const s22 = slots.find((s: any) => s.slot_start === '22:00');
    expect(s22.status).toBe('available');
  });

  it('legacy booking (start_at_utc NULL) ending at 00:00 converts to the NEXT-day UTC window', async () => {
    const { bookingService } = await import('../application/booking.service.js');

    await pool.execute<RowData>(
      `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type,
        booking_date, business_date, start_time, end_time, start_at_utc, end_at_utc, total_amount,
        booking_status, payment_status, payment_method, aggregate_version)
       VALUES (UUID(), ?, ?, ?, ?, 'public_match', ?, ?, '23:00:00', '00:00:00', NULL, NULL, 400, 'confirmed', 'paid', 'card', 1)`,
      [userId, orgId, branchId, resourceId, DATE, DATE],
    );

    const slots = await bookingService.getResourceSlots(resourceId, DATE);
    const s23 = slots.find((s: any) => s.slot_start === '23:00');
    expect(s23).toBeDefined();
    expect(s23.status).toBe('booked');
  });

  it('checkSlotAvailability blocks a second 23:00→00:00 booking on the same day', async () => {
    const { bookingRepository } = await import('../infrastructure/repositories/booking.repository.js');

    const available = await bookingRepository.checkSlotAvailability(
      resourceId, DATE,
      [{ start: '23:00', end: '00:00', date: DATE }],
    );
    expect(available).toBe(false);
  });
});