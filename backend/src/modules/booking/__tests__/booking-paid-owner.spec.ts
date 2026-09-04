import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3022';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';

type RowData = RowDataPacket[];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * BUG 3 — COD/cash booking:paid must reach the booking OWNER.
 *
 * The realtime mapper routes booking:paid by `userId` in the payload. Both
 * booking:paid emitters (the S11 post-commit path and updatePaymentStatus) must
 * therefore carry the booking owner's userId — never the acting admin. S11
 * (post-commit emission) and accounting idempotency must remain intact.
 */
describe('COD booking:paid owner routing (BUG 3)', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number; let userId: number;
  const SLUG = 'paid-owner-bug-org';
  const PHONE = '+2010111222555';
  const EMAIL = 'paid-owner-bug@courtzon.test';

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    const [existing] = await pool.execute<RowData>(`SELECT id FROM organisations WHERE slug = ?`, [SLUG]);
    for (const row of existing as any[]) {
      const oid = Number(row.id);
      await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM resources WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM branches WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM organisations WHERE id = ?`, [oid]);
    }
    await pool.execute(`DELETE FROM users WHERE full_phone = ? OR email = ?`, [PHONE, EMAIL]);

    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'PaidOwner Bug Org', ?, 1)`,
      [(ot as any[])[0].id, SLUG],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'PO Branch', 'po-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
       VALUES (UUID(), 'PO Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
      [branchId],
    );
    resourceId = (r as any).insertId;
    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0111222555', ?, ?, 'x', 'PO Tester', 'male')`,
      [PHONE, EMAIL],
    );
    userId = (u as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE organisation_id = ?)`, [orgId]);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ?`, [orgId]);
    if (resourceId) await pool.execute(`DELETE FROM resources WHERE id = ?`, [resourceId]);
    if (branchId) await pool.execute(`DELETE FROM branches WHERE id = ?`, [branchId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.execute(`DELETE FROM users WHERE id = ?`, [userId]);
    await pool.end();
  });

  async function insertBooking(hour = 10): Promise<number> {
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method, aggregate_version)
       VALUES (?, ?, ?, ?, 'private_match', '2026-12-01', ?, ?, 1000, 100, 200, 800, 0, 'confirmed', 'pending', 'cash', 1)`,
      [userId, orgId, branchId, resourceId, `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`],
    );
    return (res as any).insertId;
  }

  it('updatePaymentStatus booking:paid payload carries the booking OWNER userId (actor=1 ≠ owner)', async () => {
    const bookingId = await insertBooking();
    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();

    const emitSpy = vi.spyOn(eventBusV2, 'emit');
    await svc.updatePaymentStatus(bookingId, 'paid', 1); // actor 1 is the admin, not the owner

    const paidCall = emitSpy.mock.calls.find((c: any) => c[0] === 'booking:paid');
    expect(paidCall).toBeTruthy();
    const payload = paidCall![1] as any;
    expect(Number(payload.userId)).toBe(userId);
    expect(Number(payload.userId)).not.toBe(1);
    emitSpy.mockRestore();
  });

  it('S11 source: the post-commit COD booking:paid payload includes the owner userId', () => {
    const src = readFileSync(new URL('../application/booking.service.ts', import.meta.url), 'utf-8');
    const declIdx = src.indexOf('let codPaidPayload');
    expect(declIdx).toBeGreaterThan(-1);
    const block = src.slice(declIdx, declIdx + 1800);
    expect(block).toContain('bookingId, userId,');
    // S11 ordering must be preserved: the emit still sits after conn.commit().
    const commitIdx = src.indexOf('await conn.commit();');
    const paidEmitIdx = src.indexOf("eventBusV2.emit('booking:paid'", commitIdx);
    expect(paidEmitIdx).toBeGreaterThan(commitIdx);
  });

  it('accounting stays exactly once when a COD booking is marked paid', async () => {
    const bookingId = await insertBooking(14);
    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();

    await svc.updatePaymentStatus(bookingId, 'paid', 1);

    // Poll for the async accounting listener (BullMQ) to settle.
    let txCount = 0;
    for (let i = 0; i < 30; i++) {
      const [rows] = await pool.execute<RowData>(
        `SELECT COUNT(DISTINCT transaction_id) AS cnt FROM ledger_entries
         WHERE source_type='booking' AND source_id=? AND event_type='booking_cod_payment'`,
        [bookingId],
      );
      txCount = Number((rows as any[])[0].cnt);
      if (txCount === 1) break;
      await sleep(250);
    }
    expect(txCount).toBe(1);
  }, 30000);
});