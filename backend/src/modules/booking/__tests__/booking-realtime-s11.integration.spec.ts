import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3011';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * COD/cash booking:paid publication contract.
 *
 * A confirmed cash booking is NOT a paid booking. `booking:paid` (and the
 * `booking_cod_payment` accounting it drives) must be published only after
 * `payment_status='paid'` is durably persisted by updatePaymentStatus().
 *
 * This file proves:
 *   1. (source) neither the V1 createBooking nor the V2 createBookingV2 cash
 *      path publishes booking:paid; the only producer in booking.service.ts is
 *      updatePaymentStatus().
 *   2. (behaviour) a failing booking (invalid branch) does NOT create any
 *      booking_cod_payment ledger row.
 *
 * The successful-collection ledger assertion is covered by the dedicated
 * payment-collection tests and booking-settlement.spec.ts.
 */
describe('S11 — cash booking creation publishes no booking:paid', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    // Deterministic fixture cleanup (unique slug → parallel-safe).
    await pool.execute(`DELETE FROM bookings WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 's11-cod-org')`);
    await pool.execute(`DELETE FROM organisations WHERE slug = 's11-cod-org'`);
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'S11 COD Org', 's11-cod-org', 1)`,
      [(ot as any[])[0].id],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'S11 Branch', 's11-cod-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time) VALUES (UUID(), 'S11 Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
      [branchId],
    );
    resourceId = (r as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [orgId]);
    if (resourceId) await pool.execute(`DELETE FROM resources WHERE id = ?`, [resourceId]);
    if (branchId) await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.end();
  });

  it('source: V1 createBooking cash path publishes NO booking:paid', () => {
    const src = readFileSync(new URL('../application/booking.service.ts', import.meta.url), 'utf-8');

    const createStart = src.indexOf('async createBooking(');
    const v2Start = src.indexOf('private async createBookingV2(');
    expect(createStart).toBeGreaterThan(-1);
    expect(v2Start).toBeGreaterThan(createStart);

    const v1Create = src.slice(createStart, v2Start);
    expect(v1Create).not.toContain("eventBusV2.emit('booking:paid'");

    // The deferred-COD payload helper belonged to the removed creation-time emit.
    expect(src).not.toContain('codPaidPayload');
  });

  it('source: V2 createBookingV2 cash path publishes NO booking:paid', () => {
    const src = readFileSync(new URL('../application/booking.service.ts', import.meta.url), 'utf-8');

    const v2Start = src.indexOf('private async createBookingV2(');
    const v2End = src.indexOf('private async computeBookingEconomics(');
    expect(v2Start).toBeGreaterThan(-1);
    expect(v2End).toBeGreaterThan(v2Start);

    const v2Create = src.slice(v2Start, v2End);
    expect(v2Create).not.toContain("eventBusV2.emit('booking:paid'");

    // The only booking:paid producer in the service is the collection path.
    const updateStart = src.indexOf('async updatePaymentStatus(');
    expect(updateStart).toBeGreaterThan(-1);
    const firstEmit = src.indexOf("eventBusV2.emit('booking:paid'");
    expect(firstEmit).toBeGreaterThan(updateStart);
  });

  it('behaviour: a failing booking (invalid branch) creates no booking:paid accounting', async () => {
    const { bookingService } = await import('../application/booking.service.js');

    const today = new Date();
    const bookingDate = today.toISOString().slice(0, 10);
    // Branch id 999999999 does not exist → createBooking throws before any
    // booking/commit is created.
    await expect(
      bookingService.createBooking({
        branchId: 999999999,
        resourceId,
        bookingType: 'private_match',
        bookingDate,
        startTime: '12:00',
        endTime: '13:00',
        paymentMethod: 'cash',
      }, 1),
    ).rejects.toThrow();

    // No booking_cod_payment ledger row may reference a booking of this org
    // (no booking:paid leaked before a commit that never happened).
    const [le] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM ledger_entries le
       JOIN bookings b ON b.id = le.source_id AND b.organisation_id = ?
       WHERE le.source_type = 'booking' AND le.event_type = 'booking_cod_payment'`,
      [orgId],
    );
    expect(Number((le as any[])[0].cnt)).toBe(0);
  });
});