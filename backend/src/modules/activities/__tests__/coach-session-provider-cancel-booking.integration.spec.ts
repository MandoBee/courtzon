import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import type { FastifyInstance } from 'fastify';

type RowData = RowDataPacket[];

/**
 * AUD-003 G2-E2 Group 2 — Coach/Admin-initiated coach-session cancellation
 * reconciles the linked booking through the canonical booking machinery.
 *
 * Coach cancellation (full refund, no player window, no fee):
 *   - authorized coach cancels linked session → booking cancelled, player
 *     receives a FULL refund (refunded_amount = full total), session cancelled
 *   - coach cancellation OUTSIDE the normal player cancellation window → still
 *     succeeds with a full refund and no fee
 *   - coach cancellation when no money moved (non-COD, no captured payment) →
 *     no fabricated refund, canonical no-refund behavior preserved
 *   - booking/refund failure → error propagates, session NOT falsely cancelled
 *   - unauthorized actor (non-member) → 403 via existing G2-C authorization
 *
 * Admin cancellation (existing canonical admin/organization semantics):
 *   - authorized platform admin cancels linked session → canonical
 *     updateBookingStatus(id,'cancelled') path is used, existing admin
 *     cancellation/fee semantics preserved, session cancelled
 *   - unauthorized non-member → 403
 *   - active session + already-cancelled booking → session safely cancelled,
 *     no booking re-trigger / no duplicate financial effects
 *   - booking cancellation failure → session NOT falsely cancelled
 *
 * Player cancellation behavior (Group 1) is NOT modified here.
 *
 * Uses the shared local Docker MySQL (127.0.0.1:3307 / courtzon_v3) with
 * self-created fixtures + teardown, following the G2-C / Group 1 integration
 * pattern. Assertions on refunds are made on the synchronously-updated
 * bookings.refunded_amount (set by the canonical _emitBookingRefunded), not on
 * payment_status which is advanced by the accounting listener that the bare
 * test harness does not register.
 */

describe('AUD-003 G2-E2 Group 2 — coach/admin cancellation delegates to canonical booking', () => {
  let pool: mysql.Pool;
  let app: FastifyInstance;
  let currentUserId: number | null = null;

  // Fixture identity range (dedicated, high, avoid collisions).
  const PLAYER = 920561;
  const COACH = 920562;
  const OTHER_PLAYER = 920563;
  const ADMIN = 920564;

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
    const ORG_SLUGS = "'g2e2-full-org', 'g2e2-fee-org', 'g2e2-window-org'";

    const SESSION_IDS = `(
      SELECT id FROM coach_sessions WHERE player_id IN (${FIXTURE_IDS})
         OR coach_id IN (SELECT id FROM coach_profiles WHERE user_id IN (${FIXTURE_IDS})))`;
    const BOOKING_IDS = `(
      SELECT id FROM bookings WHERE user_id IN (${FIXTURE_IDS}) OR organisation_id IN (
        SELECT id FROM organisations WHERE slug IN (${ORG_SLUGS})))`;

    await pool.execute(`DELETE FROM coach_session_events WHERE session_id IN ${SESSION_IDS}`);
    await pool.execute(
      `DELETE FROM coach_sessions WHERE player_id IN (${FIXTURE_IDS})
          OR coach_id IN (SELECT id FROM coach_profiles WHERE user_id IN (${FIXTURE_IDS}))`,
    );
    await pool.execute(
      `DELETE FROM transaction_entries WHERE transaction_id IN (
         SELECT id FROM transactions WHERE source_type = 'booking' AND source_id IN ${BOOKING_IDS})`,
    );
    await pool.execute(
      `DELETE FROM transactions WHERE source_type = 'booking' AND source_id IN ${BOOKING_IDS}`,
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
    paymentMethod?: string;
    startDateTime?: string;
    bookingDate?: string;
  } = {}): Promise<number> {
    const bookingDate = opts.bookingDate ?? '2026-12-01';
    const startTime = opts.startDateTime ? opts.startDateTime.slice(11, 16) : '10:00:00';
    const [b] = await pool.execute<RowData>(
      `INSERT INTO bookings (user_id, organisation_id, branch_id, resource_id, booking_type, booking_date, start_time, end_time,
         total_amount, tax_amount, commission_amount, club_amount, coach_amount, booking_status, payment_status, payment_method, aggregate_version)
       VALUES (?, ?, ?, ?, 'coach_session', ?, ?, '11:00:00', 300, 0, 30, 270, 100, ?, ?, ?, 1)`,
      [PLAYER, orgId, branchId, resourceId, bookingDate, startTime,
       opts.bookingStatus ?? 'confirmed', opts.paymentStatus ?? 'paid', opts.paymentMethod ?? 'cod'],
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
      { id: PLAYER, phone: '0129200561', email: 'g2e2-player@test.com', name: 'G2E2 Player' },
      { id: COACH, phone: '0129200562', email: 'g2e2-coach@test.com', name: 'G2E2 Coach' },
      { id: OTHER_PLAYER, phone: '0129200563', email: 'g2e2-other@test.com', name: 'G2E2 Other' },
      { id: ADMIN, phone: '0129200564', email: 'g2e2-admin@test.com', name: 'G2E2 Admin' },
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

    const full = await makeOrg('g2e2-full-org', 'G2E2 Full', 'organisation');
    orgFullId = full.orgId; branchFullId = full.branchId; resourceFullId = full.resourceId;

    const fee = await makeOrg('g2e2-fee-org', 'G2E2 Fee', 'organisation', { window: 1, refund: 50 });
    orgFeeId = fee.orgId; branchFeeId = fee.branchId; resourceFeeId = fee.resourceId;

    const windowOrg = await makeOrg('g2e2-window-org', 'G2E2 Window', 'organisation', { window: 100000, refund: 100 });
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

  // ── COACH: full refund, no window, no fee ────────────────────────────────
  it('1. authorized coach cancels linked session → booking cancelled, FULL refund, session cancelled', async () => {
    const bookingId = await insertBooking(orgFullId, branchFullId, resourceFullId);
    const sessionId = await insertSession(bookingId, 'scheduled');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const spy = vi.spyOn(bookingService, 'cancelBookingByProvider');

    const res = await postCancel(sessionId, COACH);

    expect(res.statusCode).toBe(200);
    expect(await sessionStatus(sessionId)).toBe('cancelled');
    const booking = await bookingRow(bookingId);
    expect(booking.booking_status).toBe('cancelled');
    // FULL refund via canonical COD refund path → refunded_amount = full total.
    expect(Number(booking.refunded_amount)).toBe(300);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(bookingId, COACH, expect.anything());
    spy.mockRestore();
  });

  it('2. coach cancellation outside the normal player cancellation window → still succeeds, FULL refund, no fee', async () => {
    // booking ~2 days ahead in the window org (window=100000 min ≈ 69 days) — a
    // player cancellation here would be rejected outright (window requires ≥
    // 100000 min before start). The coach path bypasses the window entirely.
    const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const bookingDate = start.toISOString().slice(0, 10);
    const startTime = start.toISOString().slice(11, 16);
    const bookingId = await insertBooking(orgWindowId, branchWindowId, resourceWindowId, {
      bookingDate,
      startDateTime: `${bookingDate}T${startTime}:00`,
    });
    const sessionId = await insertSession(bookingId, 'scheduled');

    const res = await postCancel(sessionId, COACH);

    expect(res.statusCode).toBe(200);
    expect(await sessionStatus(sessionId)).toBe('cancelled');
    const booking = await bookingRow(bookingId);
    expect(booking.booking_status).toBe('cancelled');
    // Window org refund=100 → full refund despite the aggressive window.
    expect(Number(booking.refunded_amount)).toBe(300);
  });

  it('3. coach cancellation when no money moved (non-COD, no captured payment) → no fabricated refund', async () => {
    const bookingId = await insertBooking(orgFullId, branchFullId, resourceFullId, {
      paymentMethod: 'card',
      paymentStatus: 'pending',
    });
    const sessionId = await insertSession(bookingId, 'scheduled');

    const res = await postCancel(sessionId, COACH);

    expect(res.statusCode).toBe(200);
    expect(await sessionStatus(sessionId)).toBe('cancelled');
    const booking = await bookingRow(bookingId);
    expect(booking.booking_status).toBe('cancelled');
    // No money moved → canonical behavior: cancelled without a refund.
    expect(Number(booking.refunded_amount)).toBe(0);
    expect(booking.payment_status).toBe('pending');
  });

  it('4. repeated/refund-failure: canonical path failure → error propagates, session NOT falsely cancelled', async () => {
    const bookingId = await insertBooking(orgFullId, branchFullId, resourceFullId);
    const sessionId = await insertSession(bookingId, 'scheduled');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const spy = vi.spyOn(bookingService, 'cancelBookingByProvider')
      .mockRejectedValue(new Error('Payment gateway refund failed for booking'));

    const res = await postCancel(sessionId, COACH);

    expect(res.statusCode).toBe(500);
    expect(res.json().message).toContain('Payment gateway refund failed');
    expect(await sessionStatus(sessionId)).toBe('scheduled');
    const booking = await bookingRow(bookingId);
    expect(booking.booking_status).toBe('confirmed');
    spy.mockRestore();
  });

  it('5. repeated cancellation (session already cancelled) does not re-trigger the booking path', async () => {
    const bookingId = await insertBooking(orgFullId, branchFullId, resourceFullId);
    const sessionId = await insertSession(bookingId, 'cancelled');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const spy = vi.spyOn(bookingService, 'cancelBookingByProvider');

    const res = await postCancel(sessionId, COACH);

    expect(res.statusCode).toBe(200);
    expect(await sessionStatus(sessionId)).toBe('cancelled');
    expect(spy).not.toHaveBeenCalled();
    const booking = await bookingRow(bookingId);
    expect(booking.booking_status).toBe('confirmed');
    spy.mockRestore();
  });

  it('6. unauthorized coach/non-member → 403 via existing G2-C authorization', async () => {
    const bookingId = await insertBooking(orgFullId, branchFullId, resourceFullId);
    const sessionId = await insertSession(bookingId, 'scheduled');

    const res = await postCancel(sessionId, OTHER_PLAYER);

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
    expect(await sessionStatus(sessionId)).toBe('scheduled');
    expect((await bookingRow(bookingId)).booking_status).toBe('confirmed');
  });

  // ── ADMIN: existing canonical admin/organization semantics ───────────────
  it('7. authorized platform admin cancels linked session → canonical admin path, admin fee semantics preserved, session cancelled', async () => {
    // Fee org (refund 50%, window 1 min). Booking ~2 days ahead so the org
    // fee policy genuinely applies (the canonical admin path applies the fee).
    const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const bookingDate = start.toISOString().slice(0, 10);
    const startTime = start.toISOString().slice(11, 16);
    const bookingId = await insertBooking(orgFeeId, branchFeeId, resourceFeeId, {
      bookingDate,
      startDateTime: `${bookingDate}T${startTime}:00`,
    });
    const sessionId = await insertSession(bookingId, 'scheduled');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const spy = vi.spyOn(bookingService, 'updateBookingStatus');

    const res = await postCancel(sessionId, ADMIN);

    expect(res.statusCode).toBe(200);
    expect(await sessionStatus(sessionId)).toBe('cancelled');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(bookingId, 'cancelled', ADMIN);
    const booking = await bookingRow(bookingId);
    expect(booking.booking_status).toBe('cancelled');
    // Admin path applies the org cancellation fee policy → 50% refund (150),
    // and is NOT silently converted into the coach full-refund rule.
    expect(Number(booking.refunded_amount)).toBe(150);
    spy.mockRestore();
  });

  it('8. unauthorized non-member admin → 403 via existing G2-C authorization', async () => {
    const bookingId = await insertBooking(orgFullId, branchFullId, resourceFullId);
    const sessionId = await insertSession(bookingId, 'scheduled');

    const res = await postCancel(sessionId, OTHER_PLAYER);

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
    expect(await sessionStatus(sessionId)).toBe('scheduled');
  });

  it('9. active session + already-cancelled booking → session safely cancelled, no re-trigger / no duplicate effects', async () => {
    const bookingId = await insertBooking(orgFullId, branchFullId, resourceFullId, { bookingStatus: 'cancelled', paymentStatus: 'pending' });
    const sessionId = await insertSession(bookingId, 'scheduled');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const spy = vi.spyOn(bookingService, 'updateBookingStatus');

    const res = await postCancel(sessionId, ADMIN);

    expect(res.statusCode).toBe(200);
    expect(await sessionStatus(sessionId)).toBe('cancelled');
    expect(spy).not.toHaveBeenCalled();
    const booking = await bookingRow(bookingId);
    expect(booking.booking_status).toBe('cancelled');
    expect(Number(booking.refunded_amount)).toBe(0);
    spy.mockRestore();
  });

  it('10. booking cancellation failure → session NOT falsely cancelled, error surfaces', async () => {
    const bookingId = await insertBooking(orgFullId, branchFullId, resourceFullId);
    const sessionId = await insertSession(bookingId, 'scheduled');
    const { bookingService } = await import('../../booking/application/booking.service.js');
    const spy = vi.spyOn(bookingService, 'updateBookingStatus')
      .mockRejectedValue(new Error('admin booking cancellation failed'));

    const res = await postCancel(sessionId, ADMIN);

    expect(res.statusCode).toBe(500);
    expect(res.json().message).toContain('admin booking cancellation failed');
    expect(await sessionStatus(sessionId)).toBe('scheduled');
    const booking = await bookingRow(bookingId);
    expect(booking.booking_status).toBe('confirmed');
    spy.mockRestore();
  });
});
