import { describe, it, expect, vi } from 'vitest';

// The repository constructor calls getPool(); mock the pool module so this
// offline test never parses DB env config or opens a MySQL pool.
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: vi.fn(), query: vi.fn() }),
  createPool: vi.fn(),
  acquireConnection: vi.fn(),
  closePool: vi.fn(),
}));

/**
 * P5-06 — booking-slot protection: `checkSlotAvailability` (OFFLINE).
 *
 * The real `BookingRepository.checkSlotAvailability` runs against a stub
 * `PoolConnection`, so the exact SQL/parameter contract is asserted with **no
 * database and no network**:
 *   - the `resources` row lock is taken FIRST (single serialization point);
 *   - the overlap count treats held `pending_payment` slots as blocking and
 *     excludes only terminal statuses (`cancelled`, `expired`, `no_show`);
 *   - overlap uses strict `<` / `>` comparisons, so adjacent windows are free;
 *   - overnight slots use the wrap-midnight SQL branch;
 *   - active academy court holds block, while expired pending holds do not.
 *
 * Real-concurrency proof (two simultaneous inserts against MySQL) is the P4-03
 * integration evidence and is NOT re-run here — it requires DB writes.
 */

type SqlCall = { sql: string; params?: any[] };

function fakeConn(counts: { bookings?: number[]; academy?: number[] } = {}) {
  const calls: SqlCall[] = [];
  let bookingIdx = 0;
  let academyIdx = 0;

  const execute = vi.fn(async (sql: string, params?: any[]) => {
    calls.push({ sql, params });
    if (/FROM resources WHERE id = \? FOR UPDATE/.test(sql)) return [[], []];
    if (/FROM bookings/.test(sql)) {
      const value = counts.bookings?.[bookingIdx++] ?? 0;
      return [[{ cnt: value }], []];
    }
    if (/FROM academy_group_sessions/.test(sql)) {
      const value = counts.academy?.[academyIdx++] ?? 0;
      return [[{ cnt: value }], []];
    }
    return [[], []];
  });

  return { conn: { execute } as any, calls };
}

async function repo() {
  return (await import('../infrastructure/repositories/booking.repository.js')).bookingRepository;
}

describe('P5-06 slot protection — checkSlotAvailability serialization', () => {
  it('locks the resource row BEFORE counting overlaps (single serialization point)', async () => {
    const { conn, calls } = fakeConn();
    const bookingRepository = await repo();

    await bookingRepository.checkSlotAvailability(7, '2026-11-01', [{ start: '10:00', end: '11:00' }], conn);

    expect(calls[0].sql).toMatch(/SELECT id FROM resources WHERE id = \? FOR UPDATE/);
    expect(calls[0].params).toEqual([7]);
    expect(calls.some((c) => /FROM bookings/.test(c.sql))).toBe(true);
  });

  it('skips the resource lock when no resource id is supplied', async () => {
    const { conn, calls } = fakeConn();
    const bookingRepository = await repo();

    await bookingRepository.checkSlotAvailability(0, '2026-11-01', [{ start: '10:00', end: '11:00' }], conn);

    expect(calls[0].sql).toMatch(/FROM bookings/);
    expect(calls.some((c) => /FOR UPDATE/.test(c.sql))).toBe(false);
  });

  it('treats pending_payment as blocking and excludes only terminal statuses', async () => {
    const { conn, calls } = fakeConn({ bookings: [1] });
    const bookingRepository = await repo();

    const available = await bookingRepository.checkSlotAvailability(
      7, '2026-11-01', [{ start: '10:00', end: '11:00' }], conn,
    );

    expect(available).toBe(false);
    const bookingSql = calls.find((c) => /FROM bookings/.test(c.sql))!.sql;
    expect(bookingSql).toContain("booking_status NOT IN ('cancelled', 'expired', 'no_show')");
    // Only terminal statuses are excluded — a held pending_payment slot still blocks.
    expect(bookingSql).not.toContain('pending_payment');
    // Strict overlap operators: touching boundaries ([10,11) vs [11,12)) do not overlap.
    expect(bookingSql).toContain('start_time < ? AND end_time > ?');
  });

  it('returns true when the overlap count is zero', async () => {
    const { conn } = fakeConn({ bookings: [0] });
    const bookingRepository = await repo();

    const available = await bookingRepository.checkSlotAvailability(
      7, '2026-11-01', [{ start: '10:00', end: '11:00' }], conn,
    );

    expect(available).toBe(true);
  });

  it('rejects when ANY slot of a multi-slot request overlaps (sum across slots)', async () => {
    const { conn, calls } = fakeConn({ bookings: [0, 1] });
    const bookingRepository = await repo();

    const available = await bookingRepository.checkSlotAvailability(
      7, '2026-11-01',
      [{ start: '10:00', end: '11:00' }, { start: '11:00', end: '12:00' }],
      conn,
    );

    expect(available).toBe(false);
    expect(calls.filter((c) => /FROM bookings/.test(c.sql))).toHaveLength(2);
  });

  it('uses the overnight SQL branch when the slot wraps midnight', async () => {
    const { conn, calls } = fakeConn({ bookings: [1] });
    const bookingRepository = await repo();

    const available = await bookingRepository.checkSlotAvailability(
      7, '2026-11-01', [{ start: '23:00', end: '01:00' }], conn,
    );

    expect(available).toBe(false);
    const bookingCall = calls.find((c) => /FROM bookings/.test(c.sql))!;
    expect(bookingCall.sql).toContain('DATE_ADD(?, INTERVAL 1 DAY)');
    expect(bookingCall.params).toEqual([7, '2026-11-01', '23:00', '2026-11-01', '01:00']);
  });

  it('counts active academy court holds as blocking too', async () => {
    const { conn, calls } = fakeConn({ bookings: [0], academy: [1] });
    const bookingRepository = await repo();

    const available = await bookingRepository.checkSlotAvailability(
      7, '2026-11-01', [{ start: '10:00', end: '11:00' }], conn,
    );

    expect(available).toBe(false);
    const academyCall = calls.find((c) => /FROM academy_group_sessions/.test(c.sql))!;
    expect(academyCall.sql).toContain("reservation_status IN ('pending_court','resolved','confirmed')");
    // Expired pending holds must not block a slot forever.
    expect(academyCall.sql).toContain('s.pending_expires_at IS NULL OR s.pending_expires_at > NOW()');
  });

  it('can exclude the session being rescheduled from its own conflict check', async () => {
    const { conn, calls } = fakeConn({ bookings: [0], academy: [0] });
    const bookingRepository = await repo();

    await bookingRepository.checkSlotAvailability(
      7, '2026-11-01', [{ start: '10:00', end: '11:00' }], conn, { excludeAcademySessionId: 55 },
    );

    const academyCall = calls.find((c) => /FROM academy_group_sessions/.test(c.sql))!;
    expect(academyCall.sql).toContain('AND s.id != ?');
    expect(academyCall.params).toContain(55);
  });
});
