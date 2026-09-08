import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import type { FastifyInstance } from 'fastify';

type RowData = RowDataPacket[];

/**
 * AUD-003 G2-B — GET /coach-sessions/:id object-level authorization.
 *
 * The detail endpoint previously exposed any session by guessed id to any
 * authenticated user. This regression proves the object-level guard in
 * getCoachSessionDetailHandler:
 *   - the session's coach (via coach_profiles.user_id)  → 200
 *   - the session's player                             → 200
 *   - a platform admin (super_admin)                   → 200
 *   - anybody else (unrelated, other-org, other-branch)→ 403 FORBIDDEN
 *   - unauthenticated                                  → 401
 *   - unknown session id                               → 404 (authz only after existence)
 *
 * No booking-owner fallback. Uses the shared local Docker MySQL
 * (127.0.0.1:3307 / courtzon_v3) with full self-created fixtures + teardown,
 * following the coach-profile-save integration pattern.
 */

describe('AUD-003 G2-B — GET /coach-sessions/:id object-level authorization', () => {
  let pool: mysql.Pool;
  let app: FastifyInstance;
  let currentUserId: number | null = null;

  // Fixture identity range (dedicated, high, avoid collisions with dev data).
  const PLAYER = 900551;
  const COACH = 900552;
  const UNRELATED = 900553;
  const CROSS_ORG = 900554;     // owner of a DIFFERENT organisation
  const CROSS_BRANCH = 900555;  // branch-scoped member of another branch (same org)
  const ADMIN = 900556;         // granted super_admin

  let coachProfileId: number;
  let orgId: number;
  let branchAId: number;
  let branchBId: number;
  let resourceAId: number;
  let crossBranchUserRoleId: number;
  let sessionId: number;

  async function cleanup() {
    const FIXTURE_IDS = [PLAYER, COACH, UNRELATED, CROSS_ORG, CROSS_BRANCH, ADMIN].join(',');
    // Sessions belonging to fixture users (player_id) or fixture coach profiles.
    await pool.execute(
      `DELETE FROM coach_session_events WHERE session_id IN (
         SELECT id FROM coach_sessions WHERE player_id IN (${FIXTURE_IDS})
            OR coach_id IN (SELECT id FROM coach_profiles WHERE user_id IN (${FIXTURE_IDS})))`,
    );
    await pool.execute(
      `DELETE FROM coach_sessions WHERE player_id IN (${FIXTURE_IDS})
          OR coach_id IN (SELECT id FROM coach_profiles WHERE user_id IN (${FIXTURE_IDS}))`,
    );
    // Permission scopes on fixture user_roles, then the user_roles themselves.
    await pool.execute(
      `DELETE FROM user_role_scopes WHERE user_role_id IN (
         SELECT id FROM user_roles WHERE user_id IN (${FIXTURE_IDS}))`,
    );
    await pool.execute(`DELETE FROM user_roles WHERE user_id IN (${FIXTURE_IDS})`);
    // Org-owned resources/branches, then the fixture orgs (by slug — re-run safe).
    await pool.execute(
      `DELETE FROM resources WHERE branch_id IN (
         SELECT id FROM branches WHERE organisation_id IN
           (SELECT id FROM organisations WHERE slug IN ('csd-org-a', 'csd-org-b')))`,
    );
    await pool.execute(
      `DELETE FROM branches WHERE organisation_id IN
         (SELECT id FROM organisations WHERE slug IN ('csd-org-a', 'csd-org-b'))`,
    );
    await pool.execute(`DELETE FROM organisations WHERE slug IN ('csd-org-a', 'csd-org-b')`);
    await pool.execute(`DELETE FROM coach_profiles WHERE user_id IN (${FIXTURE_IDS})`);
    await pool.execute(`DELETE FROM users WHERE id IN (${FIXTURE_IDS})`);
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
      { id: PLAYER, phone: '0129000551', email: 'csd-player@test.com', name: 'CSD Player' },
      { id: COACH, phone: '0129000552', email: 'csd-coach@test.com', name: 'CSD Coach' },
      { id: UNRELATED, phone: '0129000553', email: 'csd-stranger@test.com', name: 'CSD Stranger' },
      { id: CROSS_ORG, phone: '0129000554', email: 'csd-crossorg@test.com', name: 'CSD CrossOrg' },
      { id: CROSS_BRANCH, phone: '0129000555', email: 'csd-crossbranch@test.com', name: 'CSD CrossBranch' },
      { id: ADMIN, phone: '0129000556', email: 'csd-admin@test.com', name: 'CSD Admin' },
    ]) {
      await pool.execute(
        `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
         VALUES (?, UUID(), 1, ?, CONCAT('+20', ?), ?, '$2b$10$test', ?, 'male', 'active')`,
        [u.id, u.phone, u.phone, u.email, u.name],
      );
    }

    // ── Coach profile (session owner via coach_profiles.user_id) ──
    const [cp] = await pool.execute<RowData>(
      `INSERT INTO coach_profiles (user_id, is_verified, status, platform_status) VALUES (?, 1, 'approved', 'active')`,
      [COACH],
    );
    coachProfileId = (cp as any).insertId;

    // ── Org / branch / resource fixtures ──
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), 1, ?, 'CSD Org', 'csd-org-a', 1)`,
      [COACH],
    );
    orgId = (o as any).insertId;

    const [ba] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone)
       VALUES (UUID(), ?, 'CSD Branch A', 'csd-branch-a', 'Africa/Cairo')`,
      [orgId],
    );
    branchAId = (ba as any).insertId;

    const [bb] = await pool.execute<RowData>(
      `INSERT INTO branches (public_id, organisation_id, name, slug, timezone)
       VALUES (UUID(), ?, 'CSD Branch B', 'csd-branch-b', 'Africa/Cairo')`,
      [orgId],
    );
    branchBId = (bb as any).insertId;

    const [r] = await pool.execute<RowData>(
      `INSERT INTO resources (public_id, name, resource_type_id, branch_id)
       VALUES (UUID(), 'CSD Court A', (SELECT id FROM resource_types LIMIT 1), ?)`,
      [branchAId],
    );
    resourceAId = (r as any).insertId;

    // ── Cross-organisation member: owner of a DIFFERENT organisation ──
    await pool.execute(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), 1, ?, 'CSD Other Org', 'csd-org-b', 1)`,
      [CROSS_ORG],
    );

    // ── Cross-branch member: branch scope on org A's OTHER branch ──
    const [bmRole] = await pool.execute<RowData>(`SELECT id FROM roles WHERE slug = 'branch-mgr' LIMIT 1`);
    const [ur] = await pool.execute<RowData>(
      `INSERT INTO user_roles (user_id, role_id, is_active) VALUES (?, ?, 1)`,
      [CROSS_BRANCH, (bmRole as any[])[0].id],
    );
    crossBranchUserRoleId = (ur as any).insertId;
    await pool.execute(
      `INSERT INTO user_role_scopes (user_role_id, scope_type, scope_id) VALUES (?, 'branch', ?)`,
      [crossBranchUserRoleId, branchBId],
    );

    // ── Platform admin actor ──
    const [saRole] = await pool.execute<RowData>(`SELECT id FROM roles WHERE slug = 'super_admin' LIMIT 1`);
    await pool.execute(`INSERT INTO user_roles (user_id, role_id, is_active) VALUES (?, ?, 1)`, [ADMIN, (saRole as any[])[0].id]);

    // ── The session under test (coach @ org A / branch A with the player) ──
    const [s] = await pool.execute<RowData>(
      `INSERT INTO coach_sessions (coach_id, player_id, organisation_id, branch_id, resource_id, start_time, end_time, price, currency_code, platform_commission_pct, status)
       VALUES (?, ?, ?, ?, ?, '2099-01-05 10:00:00', '2099-01-05 11:00:00', 200.00, 'EGP', 10.00, 'confirmed')`,
      [coachProfileId, PLAYER, orgId, branchAId, resourceAId],
    );
    sessionId = (s as any).insertId;
    await pool.execute(`INSERT INTO coach_session_events (session_id, event) VALUES (?, 'confirmed')`, [sessionId]);

    // ── Wire auth middleware with a mutable identity + bare app (same as coach-profile-save) ──
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

  it('A1. unauthenticated request → 401', async () => {
    setUser(null);
    const res = await app.inject({ method: 'GET', url: `/coach-sessions/${sessionId}` });
    expect(res.statusCode).toBe(401);
  });

  it('A2. unknown session id (authenticated, non-owner) → 404', async () => {
    setUser(UNRELATED);
    const res = await app.inject({ method: 'GET', url: '/coach-sessions/999999999' });
    expect(res.statusCode).toBe(404);
  });

  it('A3. unrelated authenticated user → 403 FORBIDDEN', async () => {
    setUser(UNRELATED);
    const res = await app.inject({ method: 'GET', url: `/coach-sessions/${sessionId}` });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBe('FORBIDDEN');
    expect(body.message).toContain('own sessions');
  });

  it('A4. cross-organisation member (different org owner) → 403', async () => {
    setUser(CROSS_ORG);
    const res = await app.inject({ method: 'GET', url: `/coach-sessions/${sessionId}` });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  it('A5. cross-branch member (same org, other branch) → 403', async () => {
    setUser(CROSS_BRANCH);
    const res = await app.inject({ method: 'GET', url: `/coach-sessions/${sessionId}` });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('FORBIDDEN');
  });

  it('A6. the session coach → 200 with session/timeline/allowedTransitions', async () => {
    setUser(COACH);
    const res = await app.inject({ method: 'GET', url: `/coach-sessions/${sessionId}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session).toBeDefined();
    expect(body.session.id).toBe(sessionId);
    expect(typeof body.session.player_name).toBe('string');
    expect(Array.isArray(body.timeline)).toBe(true);
    expect(Array.isArray(body.allowedTransitions)).toBe(true);
  });

  it('A7. the session player → 200', async () => {
    setUser(PLAYER);
    const res = await app.inject({ method: 'GET', url: `/coach-sessions/${sessionId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().session.id).toBe(sessionId);
  });

  it('A8. platform admin → 200', async () => {
    setUser(ADMIN);
    const res = await app.inject({ method: 'GET', url: `/coach-sessions/${sessionId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().session.id).toBe(sessionId);
  });
});