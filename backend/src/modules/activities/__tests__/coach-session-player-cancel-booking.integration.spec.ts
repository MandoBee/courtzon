import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import type { FastifyInstance } from 'fastify';

type RowData = RowDataPacket[];

/**
 * AUD-003 G2-E2 Group 1 — Player-initiated coach-session cancellation
 * delegates the linked booking cancellation to the canonical booking path.
 *
 * Regression coverage:
 *   - player cancels a linked coach session → booking cancelled via
 *     bookingService.cancelBooking (exactly once) AND session cancelled
 *   - canonical cancellation policy/fee/refund behaviour is preserved (the
 *     session module adds no financial logic)
 *   - already-cancelled session → no re-trigger of the booking path
 *   - session active + booking already cancelled → session still cancelled, no
 *     duplicate refund
 *   - booking cancellation failure (outside cancellation window) → session is
 *     NOT falsely cancelled (409 surfaces)
 *   - unlinked session → session-only cancellation (unchanged behaviour)
 *   - unauthorized player → 403 via existing G2-C authorization
 *
 * Uses the shared local Docker MySQL (127.0.0.1:3307 / courtzon_v3) with
 * self-created fixtures + teardown, following the G2-C integration pattern.
 */

describe('AUD-003 G2-E2 Group 1 — player cancellation delegates to booking', () => {
  let pool: mysql.Pool;
  let app: FastifyInstance;
  let currentUserId: number | null = null;

  // Fixture identity range (dedicated, high, avoid collisions).
  const PLAYER = 910561;
  const COACH = 910562;
  const OTHER_PLAYER = 910563;
  const ADMIN = 910564;

  let coachProfileId: number;
  let orgFullId: number;
  let orgFeeId: number;
  let orgWindowId: number;
  let branchFullId: number;
  let branchFeeId: number;
  let branchWindowId: number;
  let resourceFullId: number;
  let resourceFeeId: number;
  let resourceWindowId: number;

  async function cleanup() {
    const FIXTURE_IDS = [PLAYER, COACH, OTHER_PLAYER, ADMIN].join(',');
    const ORG_SLUGS = "'g2e1-full-org', 'g2e1-fee-org', 'g2e1-window-org'";

    // Session events → sessions → bookings (order matters for FKs).
    await pool.execute(
      `DELETE FROM coach_session_events WHERE session_id IN (
         SELECT id FROM coach_sessions WHERE player_id IN (${FIXTURE_IDS})
            OR coach_id IN (SELECT id FROM coach_profiles WHERE user_id IN (${FIXTURE_IDS})))`,
    );
    await pool.execute(
      `DELETE FROM coach_sessions WHERE player_id IN (${FIXTURE_IDS})
          OR coach_id IN (SELECT id FROM coach_profiles WHERE user_id IN (${FIXTURE_IDS}))`,
    );
    // Transaction entries/transactions created by the canonical COD refund path.
    await pool.execute(
      `DELETE FROM transaction_entries WHERE transaction_id IN (
         SELECT id FROM transactions WHERE source_type = 'booking' AND source_id IN (
           SELECT id FROM bookings WHERE user_id IN (${FIXTURE_IDS}) OR organisation_id IN (
             SELECT id FROM organisations WHERE slug IN (${ORG_SLUGS}))))`,
    );
    await pool.execute(
      `DELETE FROM transactions WHERE source_type = 'booking' AND source_id IN (
         SELECT id FROM bookings WHERE user_id IN (${FIXTURE_IDS}) OR organisation_id IN (
           SELECT id FROM organisations WHERE slug IN (${ORG_SLUGS})))`,
    );
    await pool.execute(
      `DELETE FROM bookings WHERE user_id IN (${FIXTURE_IDS}) OR organisation_id IN (
         SELECT id FROM organisations WHERE slug IN (${ORG_SLUGS}))`,
    );
    await pool.execute(
      `DELETE FROM user_role_scopes WHERE user_role_id IN (
         SELECT id FROM user_roles WHERE user_id IN (${FIXTURE_IDS}))`,
    );
    await pool.execute(`DELETE FROM user_roles WHERE user_id IN (${FIXTURE_IDS})`);
    await pool.execute(
      `DELETE FROM resources WHERE branch_id IN (SELECT id FROM branches WHERE organisation_id IN (SELECT id FROM organisations WHERE slug IN (${ORG_SLUGS})))`,
    );
    await pool.execute(
      `DELETE FROM branches WHERE organisation_id IN (SELECT id FROM organisations WHERE slug IN (${ORG_SLUGS}))`,
    );
    await pool.execute(`DELETE FROM cancellation_policies WHERE organisation_id IN (SELECT id FROM organisations WHERE slug IN (${ORG_SLUGS}))`);
    await pool.execute(`DELETE FROM organisations WHERE slug IN (${ORG_SLUGS})`);
    await pool.execute(`DELETE FROM coach_profiles WHERE user_id IN (${FIXTURE_IDS})`);
    await pool.execute(`DELETE FROM users WHERE id IN (${FIXTURE_IDS})`);
  }

  async function insertBooking(orgId: number, branchId: number, resourceId: number, opts: {
    bookingStatus?: string;
    paymentStatus?: string;
    startDateTime?: string;
    bookingDate?: string;
  } = {}): Promise<number> {
    const bookingDate = opts.bookingDate ?? '2026-12-01';
    const startTime = opts.startDateTime ? opts.startDateTime.slice(11, 16) : '10:00:00';
    const [b] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
         total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method, aggregate_version)
       VALUES (?, ?, ?, ?, 'coach_session', ?, ?, '11:00:00', 300, 0, 30, 270, 100, ?, ?, 'cod', 1)`,
      [PLAYER, orgId, branchId, resourceId, bookingDate, startTime, opts.bookingStatus ?? 'confirmed', opts.paymentStatus ?? 'paid'],
    );
    return (b as any).insertId;
  }

  async function insertSession(bookingId: number | null, status = 'scheduled'): Promise<number> {
    const [s] = await pool.execute<RowData>(
      `INSERT INTO coach_sessions (coach_id, player_id, organisation_id, branch_id, resource_id, booking_id, start_time, end_time, price, currency_code, platform_commission_pct, status)
       VALUES (?, ?, ?, ?, ?, ?, '2099-01-05 10:00:00', '2099-01-05 11:00:00', 100, 'EGP', 10, ?)`,
      [coachProfileId, PLAYER, orgFullId, branchFullId, resourceFullId, bookingId, status],
    );
    return (s as any).insertId;
  }

  async function sessionStatus(id: number): Promise<string> {
    const [rows] = await pool.execute<RowData>(`SELECT status FROM coach_sessions WHERE id = ?`, [id]);
    return (rows[0] as any).status;
  }

  async function bookingRow(id: number): Promise<any> {
    const [rows] = await pool.execute<RowData>(`SELECT * FROM bookings WHERE id = ?`, [id]);
    return rows[0];
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_DB = '0';
    process.env.REDIS_PASSWORD = '';
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = '3307';
    process.env.DB_USER = 'root';
    process.env.DB_PASSWORD = 'courtzon2026';
    process.env.DB_NAME = 'courtzon_v3';
    process.env.ENABLE_API_DOCS = 'false';

    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
    await cleanup();

    const { createPool } = await import('../../../database/mysql.js');
    createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });

    // ── Users ──
    for (const u of [
      { id: PLAYER, phone: '0129100561', email: 'g2e1-player@test.com', name: 'G2E1 Player' },
      { id: COACH, phone: '0129100562', email: 'g2e1-coach@test.com', name: 'G2E1 Coach' },
      { id: OTHER_PLAYER, phone: '0129100563', email: 'g2e1-other@test.com', name: 'G2E1 Other' },
      { id: ADMIN, phone: '0129100564', email: 'g2e1-admin@test.com', name: 'G2E1 Admin' },
    ]) {
      await pool.execute(
        `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
         VALUES (?, UUID(), 1, ?, CONCAT('+20', ?), ?, '$2b$10$test', ?, 'male', 'active')`,
        [u.id, u.phone, u.phone, u.email, u.name],
      );
    }

    const [cp] = await pool.execute<RowData>(
      `INSERT INTO coach_profiles (user_id, is_verified, status, platform_status) VALUES (?, 1, 'approved', 'active')`,
      [COACH],
    );
    coachProfileId = (cp as any).insertId;

    // ── Platform admin actor ──
    const [saRole] = await pool.execute<RowData>(`SELECT id FROM roles WHERE slug = 'super_admin' LIMIT 1`);
    await pool.execute(`INSERT INTO user_roles (user_id, role_id, is_active) VALUES (?, ?, 1)`, [ADMIN, (saRole as any[])[0].id]);

    // ── Org / branch / resource fixtures ──
    async function makeOrg(slug: string, name: string, policyLevel: string | null, policy?: { window: number; refund: number }) {
      const [o] = await pool.execute<RowData>(
        `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active, cancellation_policy_level)
         VALUES (UUID(), (SELECT id FROM organisation_types LIMIT 1), ?, ?, ?, 1, ?)`,
        [COACH, name, slug, policyLevel],
      );
      const orgId = (o as any).insertId;
      if (policy) {
        await pool.execute<RowData>(
          `INSERT INTO cancellation_policies (organisation_id, cancellation_window_minutes, refund_percent, is_active) VALUES (?, ?, ?, 1)`,
          [orgId, policy.window, policy.refund],
        );
      }
      const [b] = await pool.execute<RowData>(
        `INSERT INTO branches (public_id, organisation_id, name, slug, timezone) VALUES (UUID(), ?, ?, ?, 'Africa/Cairo')`,
        [orgId, `${name} Branch`, `${slug}-branch`],
      );
      const branchId = (b as any).insertId;
      const [r] = await pool.execute<RowData>(
        `INSERT INTO resources (public_id, name, resource_type_id, branch_id) VALUES (UUID(), ?, (SELECT id FROM resource_types LIMIT 1), ?)`,
        [`${name} Court`, branchId],
      );
      const resourceId = (r as any).insertId;
      return { orgId, branchId, resourceId };
    }

    const full = await makeOrg('g2e1-full-org', 'G2E1 Full', 'organisation');
    orgFullId = full.orgId; branchFullId = full.branchId; resourceFullId = full.resourceId;

    const fee = await makeOrg('g2e1-fee-org', 'G2E1 Fee', 'organisation', { window: 1, refund: 50 });
    orgFeeId = fee.orgId; branchFeeId = fee.branchId; resourceFeeId = fee.resourceId;

    const windowOrg = await makeOrg('g2e1-window-org', 'G2E1 Window', 'organisation', { window: 100000, refund: 100 });
    orgWindowId = windowOrg.orgId; branchWindowId = windowOrg.branchId; resourceWindowId = windowOrg.resourceId;

    // ── Wire auth middleware with a mutable identity (G2-C harness) ──
    const { initAuthMiddleware } = await import('../../../shared/middleware/auth.middleware.js');
    try {
      initAuthMiddleware({
        resolveUser: async () => currentUserId,
        checkRole: async () => false,
        checkPermission: async () => true,
        checkOrgApproved: async () => false,
      });
    } catch { /* already initialized */ }

    const Fastify = (await import('fastify')).default;
    const { activitiesRoutes } = await import('../presentation/activities.routes.js');
    const { AppError } = await import('../../../shared/errors/app-error.js');

    app = Fastify();
    app.setErrorHandler((error: any, _request: any, reply: any) => {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send({ error: error.errorCode, message: error.message });
      }
      throw error;
    });
    await activitiesRoutes(app, { requireFeatureFlag: () => async () => undefined });
    await app.ready();
  }, 60000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await cleanup();
    const { closePool } = await import('../../../database/mysql.js');
    await closePool();
    if (app) await app.close();
    await pool.end();
  });

  function setUser(id: number | null) {
    currentUserId = id;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function postCancel(sessionId: number, asUser: number | null, body?: any) {
    setUser(asUser);
    return app.inject({ method: 'POST', url: `/coach-sessions/${sessionId}/cancel`, payload: body });
  }

  it('1. player cancels linked session → booking cancelled+refunded via canonical path exactly once, session cancelled', async () => {
    const bookingId = await insertBooking(orgFullId, branchFullId, resourceFullId);
    const sessionId = await insertSession(bookingId, 'scheduled');
    const spy = vi.spyOn(await import('../../booking/application/booking.service.js').then((m) => m.bookingService), 'cancelBooking');

    const res = await postCancel(sessionId, PLAYER);

    expect(res.statusCode).toBe(200);
    expect(await sessionStatus(sessionId)).toBe('cancelled');
    const booking = await bookingRow(bookingId);
    expect(booking.booking_status).toBe('cancelled');
    // Canonical COD refund issued once (refunded_amount advanced via the
    // booking module; payment_status is advanced by the accounting listener).
    expect(Number(booking.refunded_amount)).toBe(300);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(bookingId, PLAYER, expect.anything());
    spy.mockRestore();
  });

  it('2. repeated cancel (session already cancelled) does not re-trigger the booking path', async () => {
    const bookingId = await insertBooking(orgFullId, branchFullId, resourceFullId);
    const sessionId = await insertSession(bookingId, 'cancelled');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const spy = vi.spyOn(bookingService, 'cancelBooking');

    const res = await postCancel(sessionId, PLAYER);

    expect(res.statusCode).toBe(200);
    expect(await sessionStatus(sessionId)).toBe('cancelled');
    expect(spy).not.toHaveBeenCalled();
    const booking = await bookingRow(bookingId);
    expect(booking.booking_status).toBe('confirmed');
    expect(booking.payment_status).toBe('paid');
    spy.mockRestore();
  });

  it('3. session active + booking already cancelled → session cancelled, no duplicate refund', async () => {
    const bookingId = await insertBooking(orgFullId, branchFullId, resourceFullId, { bookingStatus: 'cancelled', paymentStatus: 'pending' });
    const sessionId = await insertSession(bookingId, 'scheduled');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const spy = vi.spyOn(bookingService, 'cancelBooking');

    const res = await postCancel(sessionId, PLAYER);

    expect(res.statusCode).toBe(200);
    expect(await sessionStatus(sessionId)).toBe('cancelled');
    expect(spy).not.toHaveBeenCalled();
    const booking = await bookingRow(bookingId);
    expect(booking.booking_status).toBe('cancelled');
    expect(booking.payment_status).toBe('pending');
    spy.mockRestore();
  });

  it('4. booking cancellation failure (outside window) → session NOT falsely cancelled, 409 surfaces', async () => {
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const bookingDate = start.toISOString().slice(0, 10);
    const startTime = start.toISOString().slice(11, 16);
    const bookingId = await insertBooking(orgWindowId, branchWindowId, resourceWindowId, {
      bookingDate,
      startDateTime: `${bookingDate}T${startTime}:00`,
    });
    const sessionId = await insertSession(bookingId, 'scheduled');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const spy = vi.spyOn(bookingService, 'cancelBooking');

    const res = await postCancel(sessionId, PLAYER);

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('CONFLICT');
    expect(await sessionStatus(sessionId)).toBe('scheduled');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('5. canonical cancellation policy/fee is respected via the delegated path', async () => {
    const bookingId = await insertBooking(orgFeeId, branchFeeId, resourceFeeId);
    const sessionId = await insertSession(bookingId, 'scheduled');

    const res = await postCancel(sessionId, PLAYER);

    expect(res.statusCode).toBe(200);
    expect(await sessionStatus(sessionId)).toBe('cancelled');
    const booking = await bookingRow(bookingId);
    expect(booking.booking_status).toBe('cancelled');
    // 50% refund policy → 50% of the 300 total refunded (150), fee retained,
    // all via the canonical path.
    expect(Number(booking.refunded_amount)).toBe(150);
  });

  it('6. unlinked session → session-only cancellation, booking path untouched', async () => {
    const sessionId = await insertSession(null, 'scheduled');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const spy = vi.spyOn(bookingService, 'cancelBooking');

    const res = await postCancel(sessionId, PLAYER);

    expect(res.statusCode).toBe(200);
    expect(await sessionStatus(sessionId)).toBe('cancelled');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('7. unauthorized player → 403 via existing G2-C authorization', async () => {
    const bookingId = await insertBooking(orgFullId, branchFullId, resourceFullId);
    const sessionId = await insertSession(bookingId, 'scheduled');

    const res = await postCancel(sessionId, OTHER_PLAYER);

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
    expect(await sessionStatus(sessionId)).toBe('scheduled');
    expect((await bookingRow(bookingId)).booking_status).toBe('confirmed');
  });
});