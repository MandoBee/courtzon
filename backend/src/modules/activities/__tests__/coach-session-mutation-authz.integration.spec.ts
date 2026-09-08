import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import type { FastifyInstance } from 'fastify';

type RowData = RowDataPacket[];

/**
 * AUD-003 G2-C — Coach-session lifecycle mutation authorization
 * (POST /coach-sessions/:id/confirm|cancel|start|complete|no-show).
 *
 * The mutation handlers previously relied on route-level permission only
 * (except cancel, which had no guard at all) and never checked session
 * ownership, so any coach-family role holder could mutate any session and any
 * authenticated user could cancel any session. Actor roles were also
 * hardcoded ('player'/'coach') in the immutable timeline/audit trail.
 *
 * This regression proves the shared object-level guard
 * (authorizeCoachSessionMutation):
 *   - confirm/start/complete/no-show → session coach OR platform admin → 200
 *   - cancel → session player OR session coach OR platform admin → 200
 *   - any other actor (other coach, other player) → 403 FORBIDDEN
 *   - unauthenticated → 401, unknown session id → 404
 *   - timeline/audit actor identity records the REAL authenticated actor
 *     ('coach'/'player'/'admin'), and cancelledBy reflects the real actor
 *   - idempotent re-transitions never duplicate timeline events
 *   - authorization is evaluated BEFORE transition validation; the existing
 *     InvalidTransitionError behavior for unsupported canonical states is
 *     preserved unchanged
 *
 * AUD-003 G2-D Group 1 extends this to the CANONICAL lifecycle:
 *   - scheduled → in_progress (Start) and scheduled → cancelled (Cancel) are
 *     now valid for the canonical Unified Flow B sessions
 *   - in_progress → completed / cancelled remain valid
 *   - scheduled → confirmed, scheduled → no_show, pending_court → anything
 *     remain invalid (no new transitions were invented)
 *
 * Uses the shared local Docker MySQL (127.0.0.1:3307 / courtzon_v3) with
 * self-created fixtures + teardown, following the G2-B integration pattern.
 */

describe('AUD-003 G2-C — coach-session mutation authorization', () => {
  let pool: mysql.Pool;
  let app: FastifyInstance;
  let currentUserId: number | null = null;

  // Fixture identity range (dedicated, high, avoid collisions with dev data).
  const PLAYER = 900561;
  const COACH = 900562;
  const OTHER_COACH = 900563; // coach, but NOT the session's coach
  const OTHER_PLAYER = 900564; // authenticated user, not involved in the session
  const ADMIN = 900565; // granted super_admin

  let coachProfileId: number;
  let otherCoachProfileId: number;
  let orgId: number;
  let branchAId: number;
  let resourceAId: number;

  async function cleanup() {
    const FIXTURE_IDS = [PLAYER, COACH, OTHER_COACH, OTHER_PLAYER, ADMIN].join(',');
    await pool.execute(
      `DELETE FROM coach_session_events WHERE session_id IN (
         SELECT id FROM coach_sessions WHERE player_id IN (${FIXTURE_IDS})
            OR coach_id IN (SELECT id FROM coach_profiles WHERE user_id IN (${FIXTURE_IDS})))`,
    );
    await pool.execute(
      `DELETE FROM coach_sessions WHERE player_id IN (${FIXTURE_IDS})
          OR coach_id IN (SELECT id FROM coach_profiles WHERE user_id IN (${FIXTURE_IDS}))`,
    );
    await pool.execute(
      `DELETE FROM user_role_scopes WHERE user_role_id IN (
         SELECT id FROM user_roles WHERE user_id IN (${FIXTURE_IDS}))`,
    );
    await pool.execute(`DELETE FROM user_roles WHERE user_id IN (${FIXTURE_IDS})`);
    await pool.execute(
      `DELETE FROM resources WHERE branch_id IN (
         SELECT id FROM branches WHERE organisation_id IN
           (SELECT id FROM organisations WHERE slug = 'csm-org-a'))`,
    );
    await pool.execute(
      `DELETE FROM branches WHERE organisation_id IN
         (SELECT id FROM organisations WHERE slug = 'csm-org-a')`,
    );
    await pool.execute(`DELETE FROM organisations WHERE slug = 'csm-org-a'`);
    await pool.execute(`DELETE FROM coach_profiles WHERE user_id IN (${FIXTURE_IDS})`);
    await pool.execute(`DELETE FROM users WHERE id IN (${FIXTURE_IDS})`);
  }

  async function insertSession(status: string): Promise<number> {
    const [s] = await pool.execute<RowData>(
      `INSERT INTO coach_sessions (coach_id, player_id, organisation_id, branch_id, resource_id, start_time, end_time, price, currency_code, platform_commission_pct, status)
       VALUES (?, ?, ?, ?, ?, '2099-01-05 10:00:00', '2099-01-05 11:00:00', 200.00, 'EGP', 10.00, ?)`,
      [coachProfileId, PLAYER, orgId, branchAId, resourceAId, status],
    );
    return (s as any).insertId;
  }

  async function sessionRow(id: number): Promise<any> {
    const [rows] = await pool.execute<RowData>(`SELECT * FROM coach_sessions WHERE id = ?`, [id]);
    return rows[0];
  }

  async function eventsFor(id: number): Promise<any[]> {
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM coach_session_events WHERE session_id = ? ORDER BY id ASC`,
      [id],
    );
    return rows;
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
      { id: PLAYER, phone: '0129000561', email: 'csm-player@test.com', name: 'CSM Player' },
      { id: COACH, phone: '0129000562', email: 'csm-coach@test.com', name: 'CSM Coach' },
      { id: OTHER_COACH, phone: '0129000563', email: 'csm-other-coach@test.com', name: 'CSM OtherCoach' },
      { id: OTHER_PLAYER, phone: '0129000564', email: 'csm-other-player@test.com', name: 'CSM OtherPlayer' },
      { id: ADMIN, phone: '0129000565', email: 'csm-admin@test.com', name: 'CSM Admin' },
    ]) {
      await pool.execute(
        `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
         VALUES (?, UUID(), 1, ?, CONCAT('+20', ?), ?, '$2b$10$test', ?, 'male', 'active')`,
        [u.id, u.phone, u.phone, u.email, u.name],
      );
    }

    // ── Coach profiles ──
    const [cp] = await pool.execute<RowData>(
      `INSERT INTO coach_profiles (user_id, is_verified, status, platform_status) VALUES (?, 1, 'approved', 'active')`,
      [COACH],
    );
    coachProfileId = (cp as any).insertId;

    const [cp2] = await pool.execute<RowData>(
      `INSERT INTO coach_profiles (user_id, is_verified, status, platform_status) VALUES (?, 1, 'approved', 'active')`,
      [OTHER_COACH],
    );
    otherCoachProfileId = (cp2 as any).insertId;

    // ── Org / branch / resource fixtures ──
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), 1, ?, 'CSM Org', 'csm-org-a', 1)`,
      [COACH],
    );
    orgId = (o as any).insertId;

    const [ba] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone)
       VALUES (UUID(), ?, 'CSM Branch A', 'csm-branch-a', 'Africa/Cairo')`,
      [orgId],
    );
    branchAId = (ba as any).insertId;

    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id)
       VALUES (UUID(), 'CSM Court A', (SELECT id FROM resource_types LIMIT 1), ?)`,
      [branchAId],
    );
    resourceAId = (r as any).insertId;

    // ── Platform admin actor ──
    const [saRole] = await pool.execute<RowData>(`SELECT id FROM roles WHERE slug = 'super_admin' LIMIT 1`);
    await pool.execute(`INSERT INTO user_roles (user_id, role_id, is_active) VALUES (?, ?, 1)`, [ADMIN, (saRole as any[])[0].id]);

    // ── Wire auth middleware with a mutable identity (permission gate always
    //    passes so the object-level guard is what these tests exercise) ──
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
    await cleanup();
    const { closePool } = await import('../../../database/mysql.js');
    await closePool();
    if (app) await app.close();
    await pool.end();
  });

  function setUser(id: number | null) {
    currentUserId = id;
  }

  async function post(action: string, id: number, asUser: number | null, payload?: any) {
    setUser(asUser);
    return app.inject({ method: 'POST', url: `/coach-sessions/${id}/${action}`, payload });
  }

  const FIVE_ACTIONS = ['confirm', 'cancel', 'start', 'complete', 'no-show'];

  // ── Unauthenticated ──────────────────────────────────────────────────────
  it('U1. unauthenticated → 401 on all five mutations', async () => {
    const sessionId = await insertSession('confirmed');
    for (const action of FIVE_ACTIONS) {
      const res = await post(action, sessionId, null);
      expect(res.statusCode, `${action} should 401`).toBe(401);
    }
  });

  // ── Unknown session ──────────────────────────────────────────────────────
  it('U2. unknown session id → 404 on all five mutations', async () => {
    for (const action of FIVE_ACTIONS) {
      const res = await post(action, 999999999, ADMIN);
      expect(res.statusCode, `${action} should 404`).toBe(404);
      expect(res.json().error).toBe('NOT_FOUND');
    }
  });

  // ── Coach owner ──────────────────────────────────────────────────────────
  it('C1. coach owner confirm → 200, status confirmed, actor recorded as coach', async () => {
    const sessionId = await insertSession('pending_acceptance');
    const res = await post('confirm', sessionId, COACH);
    expect(res.statusCode).toBe(200);
    expect((await sessionRow(sessionId)).status).toBe('confirmed');
    const events = await eventsFor(sessionId);
    expect(events.at(-1).actor_id).toBe(COACH);
    expect(events.at(-1).actor_role).toBe('coach');
  });

  it('C2. coach owner cancel → 200, cancelled_by=coach, actor recorded as coach', async () => {
    const sessionId = await insertSession('confirmed');
    const res = await post('cancel', sessionId, COACH);
    expect(res.statusCode).toBe(200);
    const row = await sessionRow(sessionId);
    expect(row.status).toBe('cancelled');
    expect(row.cancelled_by).toBe('coach');
    const events = await eventsFor(sessionId);
    expect(events.at(-1).actor_id).toBe(COACH);
    expect(events.at(-1).actor_role).toBe('coach');
  });

  it('C3. coach owner start → 200, status in_progress, actor recorded as coach', async () => {
    const sessionId = await insertSession('confirmed');
    const res = await post('start', sessionId, COACH);
    expect(res.statusCode).toBe(200);
    expect((await sessionRow(sessionId)).status).toBe('in_progress');
    const events = await eventsFor(sessionId);
    expect(events.at(-1).event).toBe('started');
    expect(events.at(-1).actor_id).toBe(COACH);
    expect(events.at(-1).actor_role).toBe('coach');
  });

  it('C4. coach owner complete → 200, status completed, actor recorded as coach', async () => {
    const sessionId = await insertSession('in_progress');
    const res = await post('complete', sessionId, COACH);
    expect(res.statusCode).toBe(200);
    expect((await sessionRow(sessionId)).status).toBe('completed');
    const events = await eventsFor(sessionId);
    expect(events.at(-1).event).toBe('completed');
    expect(events.at(-1).actor_role).toBe('coach');
  });

  it('C5. coach owner no-show → authorization passes, existing state machine rejects (no state-machine change)', async () => {
    const sessionId = await insertSession('in_progress');
    const res = await post('no-show', sessionId, COACH);
    // No-show is NOT a transition the state machine currently supports
    // (in_progress → completed/cancelled only). The authorization gate passes
    // for the coach owner; the EXISTING InvalidTransitionError is preserved.
    expect(res.statusCode).toBe(500);
    expect(res.json().message).toContain("Cannot transition from 'in_progress' to 'no_show'");
    expect((await sessionRow(sessionId)).status).toBe('in_progress');
  });

  // ── Player owner ─────────────────────────────────────────────────────────
  it('P1. player owner confirm → 403 (players may not confirm)', async () => {
    const sessionId = await insertSession('pending_acceptance');
    const res = await post('confirm', sessionId, PLAYER);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  it('P2. player owner cancel → 200, cancelled_by=player, actor recorded as player', async () => {
    const sessionId = await insertSession('confirmed');
    const res = await post('cancel', sessionId, PLAYER);
    expect(res.statusCode).toBe(200);
    const row = await sessionRow(sessionId);
    expect(row.status).toBe('cancelled');
    expect(row.cancelled_by).toBe('player');
    const events = await eventsFor(sessionId);
    expect(events.at(-1).actor_id).toBe(PLAYER);
    expect(events.at(-1).actor_role).toBe('player');
  });

  it('P3. player owner start → 403', async () => {
    const sessionId = await insertSession('confirmed');
    const res = await post('start', sessionId, PLAYER);
    expect(res.statusCode).toBe(403);
  });

  it('P4. player owner complete → 403', async () => {
    const sessionId = await insertSession('in_progress');
    const res = await post('complete', sessionId, PLAYER);
    expect(res.statusCode).toBe(403);
  });

  it('P5. player owner no-show → 403', async () => {
    const sessionId = await insertSession('in_progress');
    const res = await post('no-show', sessionId, PLAYER);
    expect(res.statusCode).toBe(403);
  });

  // ── Other coach (has a coach profile, NOT the session coach) ─────────────
  it('OC. another coach → 403 on all five mutations', async () => {
    const sessionId = await insertSession('confirmed');
    for (const action of FIVE_ACTIONS) {
      const res = await post(action, sessionId, OTHER_COACH);
      expect(res.statusCode, `${action} should 403 for other coach`).toBe(403);
      expect(res.json().error).toBe('FORBIDDEN');
    }
  });

  // ── Other player (authenticated, unrelated) ──────────────────────────────
  it('OP. another player → 403 on all five mutations', async () => {
    const sessionId = await insertSession('confirmed');
    for (const action of FIVE_ACTIONS) {
      const res = await post(action, sessionId, OTHER_PLAYER);
      expect(res.statusCode, `${action} should 403 for other player`).toBe(403);
      expect(res.json().error).toBe('FORBIDDEN');
    }
  });

  // ── Platform admin ───────────────────────────────────────────────────────
  it('A1. admin confirm → 200, actor recorded as admin', async () => {
    const sessionId = await insertSession('pending_acceptance');
    const res = await post('confirm', sessionId, ADMIN);
    expect(res.statusCode).toBe(200);
    expect((await sessionRow(sessionId)).status).toBe('confirmed');
    const events = await eventsFor(sessionId);
    expect(events.at(-1).actor_id).toBe(ADMIN);
    expect(events.at(-1).actor_role).toBe('admin');
  });

  it('A2. admin cancel → 200, cancelled_by=admin, actor recorded as admin', async () => {
    const sessionId = await insertSession('confirmed');
    const res = await post('cancel', sessionId, ADMIN);
    expect(res.statusCode).toBe(200);
    const row = await sessionRow(sessionId);
    expect(row.status).toBe('cancelled');
    expect(row.cancelled_by).toBe('admin');
    const events = await eventsFor(sessionId);
    expect(events.at(-1).actor_id).toBe(ADMIN);
    expect(events.at(-1).actor_role).toBe('admin');
  });

  it('A3. admin start → 200, actor recorded as admin', async () => {
    const sessionId = await insertSession('confirmed');
    const res = await post('start', sessionId, ADMIN);
    expect(res.statusCode).toBe(200);
    expect((await sessionRow(sessionId)).status).toBe('in_progress');
    const events = await eventsFor(sessionId);
    expect(events.at(-1).actor_role).toBe('admin');
  });

  it('A4. admin complete → 200, actor recorded as admin', async () => {
    const sessionId = await insertSession('in_progress');
    const res = await post('complete', sessionId, ADMIN);
    expect(res.statusCode).toBe(200);
    expect((await sessionRow(sessionId)).status).toBe('completed');
    const events = await eventsFor(sessionId);
    expect(events.at(-1).actor_role).toBe('admin');
  });

  it('A5. admin no-show → authorization passes, existing state machine rejects (no state-machine change)', async () => {
    const sessionId = await insertSession('in_progress');
    const res = await post('no-show', sessionId, ADMIN);
    // Same preserved InvalidTransitionError as C5 — authorization passes for
    // the admin, the state machine still rejects no-show.
    expect(res.statusCode).toBe(500);
    expect(res.json().message).toContain("Cannot transition from 'in_progress' to 'no_show'");
    expect((await sessionRow(sessionId)).status).toBe('in_progress');
  });

  // ── Idempotency ──────────────────────────────────────────────────────────
  it('I1. repeated start is idempotent — no duplicate timeline event', async () => {
    const sessionId = await insertSession('confirmed');
    const first = await post('start', sessionId, COACH);
    expect(first.statusCode).toBe(200);
    const second = await post('start', sessionId, COACH);
    expect(second.statusCode).toBe(200);
    expect((await sessionRow(sessionId)).status).toBe('in_progress');
    const started = (await eventsFor(sessionId)).filter((e) => e.event === 'started');
    expect(started).toHaveLength(1);
  });

  it('I2. repeated start on a canonical scheduled session is idempotent — no duplicate timeline event', async () => {
    const sessionId = await insertSession('scheduled');
    const first = await post('start', sessionId, COACH);
    expect(first.statusCode).toBe(200);
    const second = await post('start', sessionId, COACH);
    expect(second.statusCode).toBe(200);
    expect((await sessionRow(sessionId)).status).toBe('in_progress');
    const events = (await eventsFor(sessionId)).filter((e) => e.event === 'in_progress');
    expect(events).toHaveLength(1);
  });

  // ── G2-D Group 1: CANONICAL scheduled → in_progress (Start) ──────────────
  it('CS1. owner coach start on scheduled → 200, in_progress, actor recorded as coach', async () => {
    const sessionId = await insertSession('scheduled');
    const res = await post('start', sessionId, COACH);
    expect(res.statusCode).toBe(200);
    expect((await sessionRow(sessionId)).status).toBe('in_progress');
    const events = await eventsFor(sessionId);
    expect(events.at(-1).actor_id).toBe(COACH);
    expect(events.at(-1).actor_role).toBe('coach');
  });

  it('CS2. platform admin start on scheduled → 200, actor recorded as admin', async () => {
    const sessionId = await insertSession('scheduled');
    const res = await post('start', sessionId, ADMIN);
    expect(res.statusCode).toBe(200);
    expect((await sessionRow(sessionId)).status).toBe('in_progress');
    const events = await eventsFor(sessionId);
    expect(events.at(-1).actor_id).toBe(ADMIN);
    expect(events.at(-1).actor_role).toBe('admin');
  });

  it('CS3. player owner start on scheduled → 403', async () => {
    const sessionId = await insertSession('scheduled');
    const res = await post('start', sessionId, PLAYER);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  it('CS4. another player start on scheduled → 403', async () => {
    const sessionId = await insertSession('scheduled');
    const res = await post('start', sessionId, OTHER_PLAYER);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  // ── G2-D Group 1: CANONICAL scheduled → cancelled (Cancel) ───────────────
  it('CS5. owner coach cancel on scheduled → 200, cancelled_by=coach, actor recorded as coach', async () => {
    const sessionId = await insertSession('scheduled');
    const res = await post('cancel', sessionId, COACH);
    expect(res.statusCode).toBe(200);
    const row = await sessionRow(sessionId);
    expect(row.status).toBe('cancelled');
    expect(row.cancelled_by).toBe('coach');
    const events = await eventsFor(sessionId);
    expect(events.at(-1).actor_id).toBe(COACH);
    expect(events.at(-1).actor_role).toBe('coach');
  });

  it('CS6. owner player cancel on scheduled → 200, cancelled_by=player, actor recorded as player', async () => {
    const sessionId = await insertSession('scheduled');
    const res = await post('cancel', sessionId, PLAYER);
    expect(res.statusCode).toBe(200);
    const row = await sessionRow(sessionId);
    expect(row.status).toBe('cancelled');
    expect(row.cancelled_by).toBe('player');
    const events = await eventsFor(sessionId);
    expect(events.at(-1).actor_id).toBe(PLAYER);
    expect(events.at(-1).actor_role).toBe('player');
  });

  it('CS7. platform admin cancel on scheduled → 200, cancelled_by=admin, actor recorded as admin', async () => {
    const sessionId = await insertSession('scheduled');
    const res = await post('cancel', sessionId, ADMIN);
    expect(res.statusCode).toBe(200);
    const row = await sessionRow(sessionId);
    expect(row.status).toBe('cancelled');
    expect(row.cancelled_by).toBe('admin');
    const events = await eventsFor(sessionId);
    expect(events.at(-1).actor_id).toBe(ADMIN);
    expect(events.at(-1).actor_role).toBe('admin');
  });

  it('CS8. another coach cancel on scheduled → 403', async () => {
    const sessionId = await insertSession('scheduled');
    const res = await post('cancel', sessionId, OTHER_COACH);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  it('CS9. another player cancel on scheduled → 403', async () => {
    const sessionId = await insertSession('scheduled');
    const res = await post('cancel', sessionId, OTHER_PLAYER);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  // ── Preserved existing transitions ───────────────────────────────────────
  it('CP1. coach owner cancel on in_progress → 200, in_progress → cancelled still valid', async () => {
    const sessionId = await insertSession('in_progress');
    const res = await post('cancel', sessionId, COACH);
    expect(res.statusCode).toBe(200);
    expect((await sessionRow(sessionId)).status).toBe('cancelled');
    expect((await sessionRow(sessionId)).cancelled_by).toBe('coach');
  });

  // ── State machine NOT changed beyond the canonical alignment ─────────────
  it('S1. authorization is evaluated before transition failure (other coach on scheduled → 403, not 500)', async () => {
    const sessionId = await insertSession('scheduled');
    const res = await post('start', sessionId, OTHER_COACH);
    expect(res.statusCode).toBe(403);
  });

  it('S3. authorized coach on scheduled confirm → InvalidTransitionError, no success', async () => {
    const sessionId = await insertSession('scheduled');
    const res = await post('confirm', sessionId, COACH);
    expect(res.statusCode).toBe(500);
    expect(res.json().message).toContain("Cannot transition from 'scheduled' to 'confirmed'");
    expect((await sessionRow(sessionId)).status).toBe('scheduled');
  });

  it('S5. authorized coach on scheduled no-show → InvalidTransitionError, no success', async () => {
    const sessionId = await insertSession('scheduled');
    const res = await post('no-show', sessionId, COACH);
    expect(res.statusCode).toBe(500);
    expect(res.json().message).toContain("Cannot transition from 'scheduled' to 'no_show'");
    expect((await sessionRow(sessionId)).status).toBe('scheduled');
  });

  it('S4. authorized coach on pending_court cancel → InvalidTransitionError', async () => {
    const sessionId = await insertSession('pending_court');
    const res = await post('cancel', sessionId, COACH);
    expect(res.statusCode).toBe(500);
    expect(res.json().message).toContain("Cannot transition from 'pending_court'");
    expect((await sessionRow(sessionId)).status).toBe('pending_court');
  });

  it('S6. authorized coach on pending_court start → InvalidTransitionError', async () => {
    const sessionId = await insertSession('pending_court');
    const res = await post('start', sessionId, COACH);
    expect(res.statusCode).toBe(500);
    expect(res.json().message).toContain("Cannot transition from 'pending_court'");
    expect((await sessionRow(sessionId)).status).toBe('pending_court');
  });
});