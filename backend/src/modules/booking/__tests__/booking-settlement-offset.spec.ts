import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

describe('Booking Settlement Offset + Eligibility', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    await pool.execute(`DELETE FROM booking_settlements WHERE booking_id IN (SELECT id FROM bookings WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'booking-offset-test'))`);
    await pool.execute(`DELETE FROM bookings WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'booking-offset-test')`);
    await pool.execute(`DELETE FROM organisations WHERE slug = 'booking-offset-test'`);
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Booking Offset Test', 'booking-offset-test', 1)`, [(ot as any[])[0].id]);
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(`INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'Test Branch', 'test-branch-offset', 'Africa/Cairo')`, [orgId]);
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(`INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time) VALUES (UUID(), 'Test Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`, [branchId]);
    resourceId = (r as any).insertId;
    const [periods] = await pool.execute<RowData>(`SELECT id FROM accounting_periods WHERE CURDATE() BETWEEN start_date AND end_date AND status = 'open' LIMIT 1`);
    if (!periods.length) {
      const year = new Date().getFullYear(); const month = new Date().getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      await pool.execute(`INSERT INTO accounting_periods (fiscal_year, period_number, start_date, end_date, status) VALUES (?, ?, ?, ?, 'open')`,
        [year, month, `${year}-${String(month).padStart(2, '0')}-01`, `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`]);
    }
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM booking_settlements WHERE booking_id IN (SELECT id FROM bookings WHERE organisation_id = ?)`, [orgId]);
    await pool.execute(`DELETE FROM ledger_entries WHERE source_type = 'booking' AND organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ? AND reference_type LIKE 'booking%'`, [orgId]);
    await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [orgId]);
    if (resourceId) await pool.execute(`DELETE FROM resources WHERE id = ?`, [resourceId]);
    if (branchId) await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.end();
  });

  async function insertBooking(hour: number, opts: { coach?: number; club?: number; status?: string; payment?: string } = {}) {
    const coach = opts.coach ?? 50; const club = opts.club ?? 50;
    const status = opts.status ?? 'completed'; const payment = opts.payment ?? 'paid';
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method)
       VALUES (1, ?, ?, ?, 'private_match', '2026-06-15', ?, ?, 100, 0, 0, ?, ?, ?, ?, 'card')`,
      [orgId, branchId, resourceId, `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`, club, coach, status, payment],
    );
    return (res as any).insertId;
  }

  it('1. future/confirmed booking is NOT eligible', async () => {
    const bookingId = await insertBooking(40, { status: 'confirmed' });
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const e = await bookingSettlementService.getEconomics(bookingId);
    expect(e!.eligibility).toBe('NOT_ELIGIBLE');
  });

  it('2. completed + paid booking IS eligible', async () => {
    const bookingId = await insertBooking(41, { status: 'completed', payment: 'paid' });
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const e = await bookingSettlementService.getEconomics(bookingId);
    expect(e!.eligibility).toBe('ELIGIBLE');
    expect(e!.coachSettleable).toBe(50);
    expect(e!.orgSettleable).toBe(50);
  });

  it('3. cancelled booking is NOT eligible', async () => {
    const bookingId = await insertBooking(42, { status: 'cancelled' });
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const e = await bookingSettlementService.getEconomics(bookingId);
    expect(e!.eligibility).toBe('NOT_ELIGIBLE');
    expect(e!.eligibilityReason).toContain('cancelled');
  });

  it('4. fully refunded booking is NOT eligible (no settleable)', async () => {
    const bookingId = await insertBooking(43, { status: 'completed', payment: 'refunded' });
    await pool.execute(`UPDATE bookings SET refunded_amount = 100 WHERE id = ?`, [bookingId]);
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const e = await bookingSettlementService.getEconomics(bookingId);
    expect(e!.coachSettleable).toBe(0);
    expect(e!.orgSettleable).toBe(0);
  });

  it('5. full settlement with outstanding recovery auto-offsets', async () => {
    const bookingId = await insertBooking(44, { coach: 50, club: 50 });
    // Simulate outstanding recovery: org recovered 25, collected 0
    await pool.execute(`UPDATE bookings SET org_recovered_amount = 25 WHERE id = ?`, [bookingId]);
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const r = await bookingSettlementService.settleBookingEconomics(bookingId, 0, 50, 1);
    expect(r.orgSettled).toBe(50);
    expect(r.orgOffset).toBe(25);
    expect(r.orgCash).toBe(25);

    const [rows] = await pool.execute<RowData>(`SELECT org_recovery_collected FROM bookings WHERE id = ?`, [bookingId]);
    expect(Number((rows as any[])[0].org_recovery_collected)).toBe(25);
  });

  it('6. offset never exceeds recovery outstanding', async () => {
    const bookingId = await insertBooking(45, { coach: 50, club: 50 });
    // outstanding recovery 60, settle 50 → offset 50, cash 0
    await pool.execute(`UPDATE bookings SET coach_recovered_amount = 60 WHERE id = ?`, [bookingId]);
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const r = await bookingSettlementService.settleBookingEconomics(bookingId, 50, 0, 1);
    expect(r.coachOffset).toBe(50);
    expect(r.coachCash).toBe(0);
  });

  it('7. multiple settlements consume recovery cumulatively', async () => {
    const bookingId = await insertBooking(46, { coach: 100, club: 100 });
    await pool.execute(`UPDATE bookings SET coach_recovered_amount = 100 WHERE id = ?`, [bookingId]);
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');

    // Settlement #1 = 40 (offset 40, cash 0)
    const r1 = await bookingSettlementService.settleBookingEconomics(bookingId, 40, 0, 1);
    expect(r1.coachOffset).toBe(40);
    // Settlement #2 = 30 (offset 30, cash 0)
    const r2 = await bookingSettlementService.settleBookingEconomics(bookingId, 30, 0, 1);
    expect(r2.coachOffset).toBe(30);
    // Settlement #3 = 50 but only 30 settleable remains (100 - 40 - 30), and
    // recovery outstanding is now 30 (100 - 40 - 30) → offset 30, cash 0.
    const r3 = await bookingSettlementService.settleBookingEconomics(bookingId, 50, 0, 1);
    expect(r3.coachSettled).toBe(30);
    expect(r3.coachOffset).toBe(30);
    expect(r3.coachCash).toBe(0);

    const [rows] = await pool.execute<RowData>(`SELECT coach_recovery_collected FROM bookings WHERE id = ?`, [bookingId]);
    expect(Number((rows as any[])[0].coach_recovery_collected)).toBe(100);
  });

  it('8. coach recovery does NOT offset org settlement (and vice versa)', async () => {
    const bookingId = await insertBooking(47, { coach: 50, club: 50 });
    await pool.execute(`UPDATE bookings SET coach_recovered_amount = 30 WHERE id = ?`, [bookingId]);
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const r = await bookingSettlementService.settleBookingEconomics(bookingId, 0, 50, 1);
    expect(r.orgOffset).toBe(0); // coach recovery does not offset org
    expect(r.orgCash).toBe(50);
  });

  it('9. explicit collection then offset uses shared outstanding', async () => {
    const bookingId = await insertBooking(48, { coach: 50, club: 50 });
    await pool.execute(`UPDATE bookings SET coach_recovered_amount = 100 WHERE id = ?`, [bookingId]);
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    // Explicit collection = 20
    const c = await bookingSettlementService.collectBookingRecovery(bookingId, 'coach', 20, 1);
    expect(c.collected).toBe(20);
    // Next settlement 50 → offset only remaining 80
    const r = await bookingSettlementService.settleBookingEconomics(bookingId, 50, 0, 1);
    expect(r.coachOffset).toBe(50);
    expect(r.coachCash).toBe(0);
  });

  it('10. offset settlement concepts resolve to L4', async () => {
    const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
    const m = await accountingEngineService.resolveMapping('booking_coach_settlement_offset', null);
    const concepts = m.map((x: any) => x.concept);
    expect(concepts).toContain('coach_payable');
    expect(concepts).toContain('cash_bank');
    expect(concepts).toContain('coach_recovery_receivable');
  });
});
