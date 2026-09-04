import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3023';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';

type RowData = RowDataPacket[];

/**
 * BUG 4 — Check-in event/notification must target the booking OWNER, not the
 * acting org admin. The payload's `userId` drives both the realtime mapper
 * (user:{ownerId} room) and the notification engine recipient. Actor identity
 * remains in the audit trail (controller recordAudit), never in the event.
 */
describe('Booking check-in owner routing (BUG 4)', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number; let userId: number;
  const SLUG = 'checkin-owner-bug-org';
  const PHONE = '+2010111222666';
  const EMAIL = 'checkin-owner-bug@courtzon.test';

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    const [existing] = await pool.execute<RowData>(`SELECT id FROM organisations WHERE slug = ?`, [SLUG]);
    for (const row of existing as any[]) {
      const oid = Number(row.id);
      await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM resources WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id = ?)`, [oid]);
      await pool.execute(`DELETE FROM branches WHERE organisation_id = ?`, [oid]);
      await pool.execute(`DELETE FROM organisations WHERE id = ?`, [oid]);
    }
    await pool.execute(`DELETE FROM users WHERE full_phone = ? OR email = ?`, [PHONE, EMAIL]);

    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'CheckIn Bug Org', ?, 1)`,
      [(ot as any[])[0].id, SLUG],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'CI Branch', 'ci-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
       VALUES (UUID(), 'CI Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
      [branchId],
    );
    resourceId = (r as any).insertId;
    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0111222666', ?, ?, 'x', 'CI Tester', 'male')`,
      [PHONE, EMAIL],
    );
    userId = (u as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM bookings WHERE organisation_id = ?`, [orgId]);
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

  it('check-in booking:check-in payload carries the booking OWNER userId (actor=1 ≠ owner)', async () => {
    const bookingId = await insertBooking();
    const { BookingService } = await import('../application/booking.service.js');
    const svc = new BookingService();

    const emitSpy = vi.spyOn(eventBusV2, 'emit');
    await svc.checkIn(bookingId, 1); // actor 1 is the org admin, not the owner

    const checkInCall = emitSpy.mock.calls.find((c: any) => c[0] === 'booking:check-in');
    expect(checkInCall).toBeTruthy();
    const payload = checkInCall![1] as any;
    expect(Number(payload.userId)).toBe(userId);
    expect(Number(payload.userId)).not.toBe(1);
    emitSpy.mockRestore();
  });

  it('source: checkIn emits booking:check-in with booking.user_id (owner)', () => {
    const src = readFileSync(new URL('../application/booking.service.ts', import.meta.url), 'utf-8');
    const idx = src.indexOf("eventBusV2.emit('booking:check-in'");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 500);
    expect(block).toContain('userId: booking.user_id');
    // The payload no longer uses the raw actor param for the recipient.
    expect(block.match(/userId:\s*userId\b/)).toBeNull();
  });
});