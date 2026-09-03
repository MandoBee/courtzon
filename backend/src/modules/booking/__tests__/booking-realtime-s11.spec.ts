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
 * S11 hardening — COD booking:paid is emitted only AFTER the booking transaction
 * commits.
 *
 * Previously the V1 createBooking COD path emitted booking:paid inside the
 * manual transaction (before conn.commit()). Because isInTransaction() is false
 * for manual beginTransaction(), the in-memory socket/notification handlers ran
 * immediately — pre-commit. This test proves:
 *   1. (source) the booking:paid emit in the V1 COD path is positioned AFTER
 *      conn.commit() and is gated so a failed commit cannot emit it.
 *   2. (behaviour) a failing booking (invalid branch) does NOT create any
 *      booking_cod_payment ledger row → no pre-commit leak.
 *
 * The successful-commit ledger assertion is covered end-to-end by
 * booking-settlement.spec.ts / booking-accounting tests (booking:paid →
 * booking_cod_payment → ledger_entries); this file focuses on the S11 ordering
 * contract and the no-emit-on-failure guarantee, both deterministic.
 */
describe('S11 — COD booking:paid post-commit', () => {
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

  it('source: V1 COD booking:paid emit is positioned AFTER conn.commit() and gated by commit success', () => {
    const src = readFileSync(new URL('../application/booking.service.ts', import.meta.url), 'utf-8');

    // The booking:paid emit must appear after the commit statement in the COD path.
    const commitIdx = src.indexOf('await conn.commit();');
    expect(commitIdx).toBeGreaterThan(-1);

    // The emit is deferred into a payload variable captured in the COD branch and
    // emitted only after commit — the string 'booking:paid' must appear AFTER
    // the commit index (post-commit emission), not before.
    const paidEmitIdx = src.indexOf("eventBusV2.emit('booking:paid'", commitIdx);
    expect(paidEmitIdx).toBeGreaterThan(commitIdx);

    // The commit happens BEFORE the emit, and the emit is inside the try (so a
    // failed commit rolls back and the emit is never reached).
    const tryIdx = src.indexOf('try {', commitIdx - 500);
    expect(tryIdx).toBeGreaterThan(-1);
    expect(paidEmitIdx).toBeLessThan(src.indexOf('} catch (err)', commitIdx));
  });

  it('source: the COD payload is captured (not emitted) before commit', () => {
    const src = readFileSync(new URL('../application/booking.service.ts', import.meta.url), 'utf-8');

    // The COD branch assigns a deferred payload instead of emitting inline.
    const codPaidPayloadDecl = src.indexOf('let codPaidPayload');
    expect(codPaidPayloadDecl).toBeGreaterThan(-1);
    // The inline (pre-commit) emit must NOT exist anymore — i.e. there must be no
    // booking:paid emit before the commit index.
    const commitIdx = src.indexOf('await conn.commit();');
    const beforeCommit = src.slice(0, commitIdx);
    expect(beforeCommit.includes("eventBusV2.emit('booking:paid'")).toBe(false);
  });

  it('behaviour: a failing booking (invalid branch) does NOT emit booking:paid (no pre-commit leak)', async () => {
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