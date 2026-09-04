import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3024';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';

type RowData = RowDataPacket[];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * BUG 5 — V2 cancellation of a paid COD booking must run the SAME canonical
 * financial lifecycle as the legacy path: after the cancel transition it must
 * issue the COD refund (booking:refunded → booking_refunded ledger) or the
 * penalty operational entry — never silently drop the accounting. BOOKING_V2_CANCEL
 * is permanently enabled, so the previous `cancelBookingV2(); return;` early
 * exit skipped the whole refund/penalty block.
 */
describe('V2 cancellation of paid COD booking — canonical financial lifecycle (BUG 5)', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number;
  let userId: number;
  const SLUG = 'v2-cancel-bug-org';
  const PHONE = '+2010111222777';
  const EMAIL = 'v2-cancel-bug@courtzon.test';

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

    // Refundable org: the cancellation policy is present so the V2 cancel path
    // exercises the canonical COD refund lifecycle (booking:refunded →
    // booking_cod_reversal).
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active, cancellation_policy_level)
       VALUES (UUID(), ?, 1, 'V2Cancel Bug Org', ?, 1, 'organisation')`,
      [(ot as any[])[0].id, SLUG],
    );
    orgId = (o as any).insertId;
    await pool.execute<RowData>(
      `INSERT INTO cancellation_policies (organisation_id, cancellation_window_minutes, refund_percent, is_active)
       VALUES (?, 1, 100, 1)`,
      [orgId],
    );
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'VC Branch', 'vc-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
       VALUES (UUID(), 'VC Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
      [branchId],
    );
    resourceId = (r as any).insertId;

    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0111222777', ?, ?, 'x', 'VC Tester', 'male')`,
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

  async function insertBooking(paymentStatus = 'paid', hour = 10): Promise<number> {
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method, aggregate_version)
       VALUES (?, ?, ?, ?, 'private_match', '2026-12-01', ?, ?, 1000, 100, 200, 800, 0, 'confirmed', ?, 'cod', 1)`,
      [userId, orgId, branchId, resourceId, `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`, paymentStatus],
    );
    return (res as any).insertId;
  }

it('V2 cancel of a paid COD booking posts booking:refunded → booking_cod_reversal exactly once', async () => {
    const bookingId = await insertBooking('paid');
    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();

    const emitSpy = vi.spyOn(eventBusV2, 'emit');
    await svc.updateBookingStatus(bookingId, 'cancelled', 1);

    // Cancel transition emitted once; canonical refund event emitted once.
    const cancelledCalls = emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:cancelled');
    const refundedCalls = emitSpy.mock.calls.filter((c: any) => c[0] === 'booking:refunded');
    expect(cancelledCalls).toHaveLength(1);
    expect(refundedCalls).toHaveLength(1);
    expect(Number((refundedCalls[0][1] as any).userId)).toBe(userId);
    emitSpy.mockRestore();

    // DB state: booking cancelled; payment_status stays paid (canonical: the
    // refund is a separate record, not a status overwrite).
    const [rows] = await pool.execute<RowData>(`SELECT booking_status, payment_status, refunded_amount FROM bookings WHERE id = ?`, [bookingId]);
    expect((rows as any[])[0].booking_status).toBe('cancelled');
    expect((rows as any[])[0].payment_status).toBe('paid');
    expect(Number((rows as any[])[0].refunded_amount)).toBe(1000);

    // COD refund accounting reversal exists exactly once (idempotent; poll for
    // the async BullMQ listener). COD refunds post booking_cod_reversal.
    let txCount = 0;
    for (let i = 0; i < 30; i++) {
      const [le] = await pool.execute<RowData>(
        `SELECT COUNT(DISTINCT transaction_id) AS cnt FROM ledger_entries
         WHERE source_type='booking' AND source_id=? AND event_type='booking_cod_reversal'`,
        [bookingId],
      );
      txCount = Number((le as any[])[0].cnt);
      if (txCount === 1) break;
      await sleep(250);
    }
    expect(txCount).toBe(1);
  }, 30000);

  it('source: the cancelled branch no longer early-returns after cancelBookingV2 (financial lifecycle preserved)', () => {
    const src = readFileSync(new URL('../application/booking.service.ts', import.meta.url), 'utf-8');
    const start = src.indexOf('async updateBookingStatus');
    const method = src.slice(start, start + 8000);
    const v2Idx = method.indexOf('await this.cancelBookingV2(id);');
    expect(v2Idx).toBeGreaterThan(-1);
    // No early return immediately after the V2 transition.
    const afterV2 = method.slice(v2Idx, v2Idx + 500);
    expect(afterV2.includes('return;')).toBe(false);
    // The canonical refund path is reachable after the V2 transition.
    expect(afterV2).toContain('_refundCODWallet');
  });

  it('source: the cancelled branch no longer early-returns after cancelBookingV2 (financial lifecycle preserved)', () => {
    const src = readFileSync(new URL('../application/booking.service.ts', import.meta.url), 'utf-8');
    const start = src.indexOf('async updateBookingStatus');
    const method = src.slice(start, start + 8000);
    const v2Idx = method.indexOf('await this.cancelBookingV2(id);');
    expect(v2Idx).toBeGreaterThan(-1);
    // No early return immediately after the V2 transition.
    const afterV2 = method.slice(v2Idx, v2Idx + 500);
    expect(afterV2.includes('return;')).toBe(false);
    // The canonical refund path is reachable after the V2 transition.
    expect(afterV2).toContain('_refundCODWallet');
  });
});