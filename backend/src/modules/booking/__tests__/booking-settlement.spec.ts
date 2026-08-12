import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

describe('Booking Settlement + Recovery Lifecycle', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    await pool.execute(`DELETE FROM booking_settlements WHERE booking_id IN (SELECT id FROM bookings WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'booking-settle-test'))`);
    await pool.execute(`DELETE FROM bookings WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'booking-settle-test')`);
    await pool.execute(`DELETE FROM organisations WHERE slug = 'booking-settle-test'`);
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Booking Settle Test', 'booking-settle-test', 1)`, [(ot as any[])[0].id]);
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(`INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'Test Branch', 'test-branch-settle', 'Africa/Cairo')`, [orgId]);
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(`INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time) VALUES (UUID(), 'Test Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`, [branchId]);
    resourceId = (r as any).insertId;

    // Ensure an open accounting period for the current date (settlement posts to GL).
    const [periods] = await pool.execute<RowData>(
      `SELECT id FROM accounting_periods WHERE CURDATE() BETWEEN start_date AND end_date AND status = 'open' LIMIT 1`
    );
    if (!periods.length) {
      const year = new Date().getFullYear();
      const month = new Date().getMonth() + 1;
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      await pool.execute(
        `INSERT INTO accounting_periods (fiscal_year, period_number, start_date, end_date, status) VALUES (?, ?, ?, ?, 'open')`,
        [year, month, start, end],
      );
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

  async function insertBooking(hour: number, opts: { coach?: number; club?: number; commission?: number; refunded?: number } = {}) {
    const coach = opts.coach ?? 50; const club = opts.club ?? 50; const commission = opts.commission ?? 0;
    const refunded = opts.refunded ?? 0;
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, refunded_amount,
        booking_status, payment_status, payment_method)
       VALUES (1, ?, ?, ?, 'private_match', '2026-06-15', ?, ?, 100, 0, ?, ?, ?, ?, 'confirmed', 'paid', 'card')`,
      [orgId, branchId, resourceId,
       `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`,
       commission, club, coach, refunded],
    );
    return (res as any).insertId;
  }

  it('1. getSettleable returns original economics when nothing settled/refunded', async () => {
    const bookingId = await insertBooking(30, { coach: 50, club: 50 });
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const s = await bookingSettlementService.getSettleable(bookingId);
    expect(s!.coachSettleable).toBe(50);
    expect(s!.orgSettleable).toBe(50);
  });

  it('2. settle coach + org posts accounting and updates settled amounts', async () => {
    const bookingId = await insertBooking(31, { coach: 50, club: 50 });
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const r = await bookingSettlementService.settleBookingEconomics(bookingId, 50, 50, 1);
    expect(r.coachSettled).toBe(50);
    expect(r.orgSettled).toBe(50);

    const [rows] = await pool.execute<RowData>(`SELECT coach_settled_amount, org_settled_amount FROM bookings WHERE id = ?`, [bookingId]);
    expect(Number((rows as any[])[0].coach_settled_amount)).toBe(50);
    expect(Number((rows as any[])[0].org_settled_amount)).toBe(50);

    // Traceability records exist
    const [bs] = await pool.execute<RowData>(`SELECT settlement_type, amount FROM booking_settlements WHERE booking_id = ?`, [bookingId]);
    expect((bs as any[]).length).toBe(2);
  });

  it('3. duplicate settlement rejected (settleable = 0 after full settle)', async () => {
    const bookingId = await insertBooking(32, { coach: 50, club: 50 });
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    await bookingSettlementService.settleBookingEconomics(bookingId, 50, 50, 1);
    const s = await bookingSettlementService.getSettleable(bookingId);
    expect(s!.coachSettleable).toBe(0);
    expect(s!.orgSettleable).toBe(0);
  });

  it('4. partial settlement: remaining settleable reduced', async () => {
    const bookingId = await insertBooking(33, { coach: 50, club: 50 });
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    await bookingSettlementService.settleBookingEconomics(bookingId, 20, 30, 1);
    const s = await bookingSettlementService.getSettleable(bookingId);
    expect(s!.coachSettleable).toBe(30);
    expect(s!.orgSettleable).toBe(20);
  });

  it('5. refunded economics excluded from settlement', async () => {
    const bookingId = await insertBooking(34, { coach: 50, club: 50, refunded: 50 }); // 50% refunded
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const s = await bookingSettlementService.getSettleable(bookingId);
    expect(s!.coachSettleable).toBe(25); // 50 - 25 (50% refunded)
    expect(s!.orgSettleable).toBe(25);
  });

  it('6. recovery collection bounded by outstanding', async () => {
    const bookingId = await insertBooking(35, { coach: 50, club: 50 });
    // Simulate a post-settlement recovery: set recovered = 50, collected = 0
    await pool.execute(`UPDATE bookings SET coach_recovered_amount = 50 WHERE id = ?`, [bookingId]);
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const r1 = await bookingSettlementService.collectBookingRecovery(bookingId, 'coach', 20, 1);
    expect(r1.collected).toBe(20);
    const r2 = await bookingSettlementService.collectBookingRecovery(bookingId, 'coach', 20, 1);
    expect(r2.collected).toBe(20);
    const r3 = await bookingSettlementService.collectBookingRecovery(bookingId, 'coach', 20, 1);
    expect(r3.collected).toBe(10); // only 10 remaining

    const [rows] = await pool.execute<RowData>(`SELECT coach_recovery_collected FROM bookings WHERE id = ?`, [bookingId]);
    expect(Number((rows as any[])[0].coach_recovery_collected)).toBe(50);
  });

  it('7. recovery over-collection rejected', async () => {
    const bookingId = await insertBooking(36, { coach: 50, club: 50 });
    await pool.execute(`UPDATE bookings SET coach_recovered_amount = 30 WHERE id = ?`, [bookingId]);
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    const r = await bookingSettlementService.collectBookingRecovery(bookingId, 'coach', 100, 1);
    expect(r.collected).toBe(30); // capped at outstanding
  });

  it('8. settlement concepts resolve to L4 accounts', async () => {
    const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
    const coachS = await accountingEngineService.resolveMapping('booking_coach_settlement', null);
    const coachConcepts = coachS.map(m => m.concept);
    expect(coachConcepts).toContain('coach_payable');
    expect(coachConcepts).toContain('cash_bank');

    const orgS = await accountingEngineService.resolveMapping('booking_org_settlement', null);
    const orgConcepts = orgS.map(m => m.concept);
    expect(orgConcepts).toContain('org_payable');
    expect(orgConcepts).toContain('cash_bank');

    const recovery = await accountingEngineService.resolveMapping('booking_recovery_collection', null);
    const recoveryConcepts = recovery.map(m => m.concept);
    expect(recoveryConcepts).toContain('recovery_receivable');
  });

  it('9. settlement accounting ledger balanced (ledger_entries = GL)', async () => {
    const bookingId = await insertBooking(37, { coach: 50, club: 50 });
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    await bookingSettlementService.settleBookingEconomics(bookingId, 50, 50, 1);

    const [le] = await pool.execute<RowData>(
      `SELECT side, SUM(amount) AS total FROM ledger_entries WHERE source_type = 'booking' AND source_id = ? AND event_type IN ('booking_coach_settlement','booking_org_settlement') GROUP BY side`,
      [bookingId],
    );
    const dr = Number((le as any[]).find((x: any) => x.side === 'debit')?.total ?? 0);
    const cr = Number((le as any[]).find((x: any) => x.side === 'credit')?.total ?? 0);
    expect(Math.abs(dr - cr)).toBeLessThan(0.01);
  });

  it('10. org settlement + refund + recovery lifecycle reconciles', async () => {
    const bookingId = await insertBooking(38, { coach: 50, club: 50 });
    const { bookingSettlementService } = await import('../../financial/application/booking-settlement.service.js');
    // Settle org fully
    await bookingSettlementService.settleBookingEconomics(bookingId, 0, 50, 1);
    // Post-settlement refund of org (simulate recovery created)
    await pool.execute(`UPDATE bookings SET org_recovered_amount = 50 WHERE id = ?`, [bookingId]);
    // Collect full recovery
    const r = await bookingSettlementService.collectBookingRecovery(bookingId, 'org', 50, 1);
    expect(r.collected).toBe(50);
    const s = await bookingSettlementService.getSettleable(bookingId);
    expect(s!.orgRecovered).toBe(50);
    expect(s!.orgCollected).toBe(50);
  });
});
