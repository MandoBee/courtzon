import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3028';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

type RowData = RowDataPacket[];

/**
 * Bug-fix regression for the public-match booking flow.
 *
 * RCA: commit 76583c1 added `bookingRepository.createMatchmakingRequest(...)`
 * to BOTH public-match create paths:
 *
 * 1. CARD (prepare → _createFromPrepare): the `bookings` row is inserted on the
 *    transaction connection (`conn`) but `createMatchmakingRequest` ran on the
 *    POOL connection. Under InnoDB READ REPEATABLE the pool connection cannot
 *    see the uncommitted booking row, so FK `booking_matchmaking_requests_ibfk_1`
 *    (booking_id → bookings.id) failed → transaction rolled back → the Redis
 *    prepare key was deleted in `finally` → retries fail with "Booking
 *    preparation session expired or not found".
 * 2. CASH (createBookingV2): the frontend sends the deadline as an ISO literal
 *    (`2026-09-05T10:00:00Z`). MySQL `STRICT_TRANS_TABLES` rejects that value
 *    into `deadline DATETIME` (ERROR 1292) → the already-committed `pending`
 *    booking was left unconfirmed and the request 500'd.
 *
 * Fix: `createMatchmakingRequest` now accepts an optional `conn` (participates
 * in the caller's transaction) and normalizes the deadline via
 * `toMySqlDateTime(new Date(...))` before inserting.
 */
describe('Public-match matchmaking criteria persistence (booking_matchmaking_requests)', () => {
  let pool: mysql.Pool;
  let orgId: number; let branchId: number; let resourceId: number; let userId: number;
  const SLUG = 'public-match-bug-org';
  const PHONE = '+2010111229998';
  const EMAIL = 'public-match-bug@courtzon.test';

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
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Public Match Bug Org', ?, 1)`,
      [(ot as any[])[0].id, SLUG],
    );
    orgId = (o as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, 'PM Branch', 'pm-branch', 'Africa/Cairo')`,
      [orgId],
    );
    branchId = (b as any).insertId;
    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id, hourly_price, is_active, opening_time, closing_time)
       VALUES (UUID(), 'PM Court', (SELECT id FROM resource_types LIMIT 1), ?, 100, 1, '08:00', '22:00')`,
      [branchId],
    );
    resourceId = (r as any).insertId;
    const [u] = await pool.execute<RowData>(
      `INSERT INTO users (public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
       VALUES (UUID(), (SELECT id FROM countries LIMIT 1), '0111229998', ?, ?, 'x', 'PM Tester', 'male')`,
      [PHONE, EMAIL],
    );
    userId = (u as any).insertId;
  });

  afterAll(async () => {
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

  /** Insert a booking on a transaction connection (mimics _createFromPrepare). */
  async function insertBookingOnConn(conn: mysql.PoolConnection, hour = 10) {
    const [res] = await conn.execute<RowData>(
      `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method, aggregate_version)
       VALUES (UUID(), ?, ?, ?, ?, 'public_match', '2026-12-01', ?, ?, 100, 0, 10, 90, 0, 'pending_payment', 'pending', 'card', 1)`,
      [userId, orgId, branchId, resourceId, `${String(hour).padStart(2, '0')}:00:00`, `${String(hour + 1).padStart(2, '0')}:00:00`],
    );
    return (res as any).insertId as number;
  }

  it('CARD fix: createMatchmakingRequest on the SAME transaction connection sees the uncommitted booking (no FK failure)', async () => {
    const { bookingRepository } = await import('../infrastructure/repositories/booking.repository.js');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const bookingId = await insertBookingOnConn(conn);

      // Passing `conn` must make the insert participate in the open transaction.
      await bookingRepository.createMatchmakingRequest({
        bookingId,
        minAge: 18, maxAge: 40, targetGender: 'any', targetLevelId: 3,
        maxPlayers: 3, deadline: '2026-12-01T08:00:00Z', autoApply: false,
      }, conn);

      const [rows] = await conn.execute<RowData>(
        `SELECT booking_id, min_age, max_age, target_level_id, max_players, CAST(deadline AS CHAR) AS deadline, auto_apply
         FROM booking_matchmaking_requests WHERE booking_id = ?`, [bookingId],
      );
      expect((rows as any[]).length).toBe(1);
      const mm = (rows as any[])[0];
      expect(Number(mm.max_players)).toBe(3);
      expect(Number(mm.min_age)).toBe(18);
      expect(Number(mm.max_age)).toBe(40);
      expect(Number(mm.target_level_id)).toBe(3);
      // Deadline normalized to MySQL DATETIME (no trailing Z), matching DB storage.
      expect(String(mm.deadline)).toBe('2026-12-01 08:00:00');

      await conn.rollback();
    } finally {
      try { await conn.rollback(); } catch { /* already closed */ }
      conn.release();
    }
  });

  it('CASH fix: ISO deadline literal (...:00Z) no longer errors under STRICT_TRANS_TABLES', async () => {
    const { bookingRepository } = await import('../infrastructure/repositories/booking.repository.js');
    const { toMySqlDateTime } = await import('../../../shared/utils/mysql-date.js');

    // The booking is committed here (cash path) — FK is satisfied from the pool.
    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method, aggregate_version)
       VALUES (UUID(), ?, ?, ?, ?, 'public_match', '2026-12-02', ?, ?, 100, 0, 10, 90, 0, 'pending', 'pending', 'cash', 1)`,
      [userId, orgId, branchId, resourceId, '10:00:00', '11:00:00'],
    );
    const bookingId = (res as any).insertId as number;
    const isoDeadline = '2026-12-02T09:00:00Z';

    await expect(bookingRepository.createMatchmakingRequest({
      bookingId,
      minAge: 20, maxAge: 35, targetGender: 'male', targetLevelId: 2,
      maxPlayers: 2, deadline: isoDeadline, autoApply: false,
    })).resolves.toBeUndefined();

    const [[mm]] = await pool.execute<RowData>(
      `SELECT CAST(deadline AS CHAR) AS deadline FROM booking_matchmaking_requests WHERE booking_id = ?`, [bookingId],
    );
    expect(String((mm as any).deadline)).toBe(toMySqlDateTime(new Date(isoDeadline)));
  });

  it('normalizes deadline for the startMatchmaking entry point too', async () => {
    const { bookingRepository } = await import('../infrastructure/repositories/booking.repository.js');

    const [res] = await pool.execute<RowData>(
      `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
        total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method, aggregate_version)
       VALUES (UUID(), ?, ?, ?, ?, 'public_match', '2026-12-03', ?, ?, 100, 0, 10, 90, 0, 'confirmed', 'paid', 'card', 1)`,
      [userId, orgId, branchId, resourceId, '10:00:00', '11:00:00'],
    );
    const bookingId = (res as any).insertId as number;

    await bookingRepository.createMatchmakingRequest({
      bookingId,
      maxPlayers: 4,
      targetGender: 'any',
      deadline: '2026-12-03T09:30:00.000Z',
      autoApply: true,
    });

    const [[mm]] = await pool.execute<RowData>(
      `SELECT CAST(deadline AS CHAR) AS deadline, auto_apply FROM booking_matchmaking_requests WHERE booking_id = ?`, [bookingId],
    );
    expect(String((mm as any).deadline)).toBe('2026-12-03 09:30:00');
    expect(Number((mm as any).auto_apply)).toBe(1);
  });
});