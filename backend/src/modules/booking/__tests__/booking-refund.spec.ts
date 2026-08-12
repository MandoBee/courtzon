import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

describe('Booking Partial Refund Accounting', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    await pool.execute(`DELETE FROM bookings WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'booking-refund-test')`);
    await pool.execute(`DELETE FROM organisations WHERE slug = 'booking-refund-test'`);
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Booking Refund Test', 'booking-refund-test', 1)`, [(ot as any[])[0].id]);
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(`INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'Test Branch', 'test-branch-refund', 'Africa/Cairo')`, [orgId]);
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(`INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time) VALUES (UUID(), 'Test Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`, [branchId]);
    resourceId = (r as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM ledger_entries WHERE source_type = 'booking' AND organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ? AND reference_type LIKE 'booking%'`, [orgId]);
    await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [orgId]);
    if (resourceId) await pool.execute(`DELETE FROM resources WHERE id = ?`, [resourceId]);
    if (branchId) await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.end();
  });

  async function insertBooking(hour: number, total: number, tax: number, commission: number, club: number) {
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method)
       VALUES (1, ?, ?, ?, 'private_match', '2026-06-15', ?, ?, ?, ?, ?, ?, 0, 'confirmed', 'paid', 'card')`,
      [orgId, branchId, resourceId,
       `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`,
       total, tax, commission, club],
    );
    return (res as any).insertId;
  }

  it('1. full refund prorates to 100% of economics', async () => {
    const bookingId = await insertBooking(10, 100, 9, 10, 90);
    const { bookingAccounting } = await import('../../financial/application/booking-accounting.service.js');
    const refund = await bookingAccounting.computeRefundEconomics(bookingId, 109); // 90+10+9 = 109
    expect(refund).not.toBeNull();
    expect(refund!.refundRatio).toBeCloseTo(1, 2);
    expect(refund!.orgAmount).toBe(90);
    expect(refund!.commissionAmount).toBe(10);
    expect(refund!.taxAmount).toBe(9);
    expect(refund!.paymentAmount).toBe(109);
  });

  it('2. partial refund (50%) prorates economics', async () => {
    const bookingId = await insertBooking(11, 100, 9, 10, 90);
    const { bookingAccounting } = await import('../../financial/application/booking-accounting.service.js');
    const refund = await bookingAccounting.computeRefundEconomics(bookingId, 54.5); // half of 109
    expect(refund!.refundRatio).toBeCloseTo(0.5, 2);
    expect(refund!.orgAmount).toBeCloseTo(45, 0);
    expect(refund!.commissionAmount).toBeCloseTo(5, 0);
    expect(refund!.taxAmount).toBeCloseTo(4.5, 1);
  });

  it('3. refund ratio clamped to 1 (over-refund protected)', async () => {
    const bookingId = await insertBooking(12, 100, 9, 10, 90);
    const { bookingAccounting } = await import('../../financial/application/booking-accounting.service.js');
    const refund = await bookingAccounting.computeRefundEconomics(bookingId, 500);
    expect(refund!.refundRatio).toBe(1);
    expect(refund!.orgAmount).toBe(90);
    expect(refund!.commissionAmount).toBe(10);
  });

  it('4. refunded_amount tracks cumulative refunds', async () => {
    const bookingId = await insertBooking(13, 100, 9, 10, 90);
    // Simulate two partial refunds
    await pool.execute(`UPDATE bookings SET refunded_amount = refunded_amount + ? WHERE id = ?`, [50, bookingId]);
    await pool.execute(`UPDATE bookings SET refunded_amount = refunded_amount + ? WHERE id = ?`, [30, bookingId]);
    const [rows] = await pool.execute<RowData>(`SELECT refunded_amount FROM bookings WHERE id = ?`, [bookingId]);
    expect(Number((rows as any[])[0].refunded_amount)).toBe(80);
  });

  it('5. booking refund concept reverses org_payable + commission + tax', async () => {
    const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
    const mapping = await accountingEngineService.resolveMapping('booking_refund', null);
    const concepts = mapping.map(m => m.concept);
    expect(concepts).toContain('org_payable');
    expect(concepts).toContain('platform_commission');
    expect(concepts).toContain('tax_liability');
  });

  it('6. refund economics never use current tax rate (snapshot only)', async () => {
    const bookingId = await insertBooking(14, 100, 0, 10, 90);
    // Tax rate snapshot stored = 0 for this booking. A global rate may exist
    // in the system, but refund must prorate the SNAPSHOT (0), not current.
    const { bookingAccounting } = await import('../../financial/application/booking-accounting.service.js');
    const refund = await bookingAccounting.computeRefundEconomics(bookingId, 50);
    // Refund tax = snapshot tax (0) prorated — NOT current rate
    expect(refund!.taxAmount).toBe(0);
  });

  it('7. coach component prorated on refund', async () => {
    const bookingId = await insertBooking(15, 100, 0, 10, 70);
    // Add a coach share snapshot
    await pool.execute(`UPDATE bookings SET coach_amount = 20 WHERE id = ?`, [bookingId]);
    const { bookingAccounting } = await import('../../financial/application/booking-accounting.service.js');
    const econ = await bookingAccounting.resolveBookingEconomics(bookingId);
    expect(econ!.coachAmount).toBeGreaterThan(0);
    const refund = await bookingAccounting.computeRefundEconomics(bookingId, 40);
    expect(refund!.coachAmount).toBeGreaterThan(0);
  });

  it('8. zero refund produces zero economics', async () => {
    const bookingId = await insertBooking(16, 100, 9, 10, 90);
    const { bookingAccounting } = await import('../../financial/application/booking-accounting.service.js');
    const refund = await bookingAccounting.computeRefundEconomics(bookingId, 0);
    expect(refund!.paymentAmount).toBe(0);
    expect(refund!.orgAmount).toBe(0);
  });
});
