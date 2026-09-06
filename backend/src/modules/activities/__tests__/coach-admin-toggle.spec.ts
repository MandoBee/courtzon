import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

/**
 * Admin Coaches — Enable/Disable (toggleCoachAvailability) regression.
 *
 * Bug: on the Admin Coaches page, clicking Enable for a listed coach returned
 * "Coach not found". The list (findCoachesAdmin) LEFT JOINs professional_profiles,
 * so a coach whose professional_profiles row is missing is still displayed, but
 * toggleCoachAvailability used an INNER JOIN and returned null for it.
 *
 * Fix: toggleCoachAvailability now LEFT JOINs (found by the canonical
 * coach_profile id — the same id the list emits), returns null only when the
 * coach itself does not exist, and upserts availability on the coach's user_id
 * so a coach without a professional_profiles row can still be enabled.
 */
describe('Admin Coaches — toggle availability (Enable/Disable)', () => {
  let pool: mysql.Pool;

  const COACH_A = 999971; // has professional_profiles (is_available 1)
  const COACH_B = 999972; // NO professional_profiles — the bug case
  const COACH_C = 999973; // has professional_profiles (is_available 0 — disabled)

  async function cleanup() {
    await pool.execute(`DELETE FROM professional_profiles WHERE user_id IN (${COACH_A},${COACH_B},${COACH_C})`);
    await pool.execute(`DELETE FROM coach_profiles WHERE user_id IN (${COACH_A},${COACH_B},${COACH_C})`);
    await pool.execute(`DELETE FROM users WHERE id IN (${COACH_A},${COACH_B},${COACH_C})`);
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

    for (const u of [
      { id: COACH_A, phone: '0129999971', email: 'toggle-a@test.com', name: 'Toggle A' },
      { id: COACH_B, phone: '0129999972', email: 'toggle-b@test.com', name: 'Toggle B' },
      { id: COACH_C, phone: '0129999973', email: 'toggle-c@test.com', name: 'Toggle C' },
    ]) {
      await pool.execute(
        `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
         VALUES (?, UUID(), 1, ?, CONCAT('+20', ?), ?, '$2b$10$test', ?, 'male', 'active')`,
        [u.id, u.phone, u.phone, u.email, u.name],
      );
      await pool.execute(
        `INSERT INTO coach_profiles (user_id, is_verified, status, platform_status) VALUES (?, 1, 'approved', 'active')`,
        [u.id],
      );
    }

    // Coach A: available (1). Coach C: disabled (0).
    await pool.execute(`INSERT INTO professional_profiles (user_id, is_available) VALUES (?, 1)`, [COACH_A]);
    await pool.execute(`INSERT INTO professional_profiles (user_id, is_available) VALUES (?, 0)`, [COACH_C]);
    // Coach B intentionally has NO professional_profiles row (reproduces the bug).
  }, 60000);

  afterAll(async () => {
    await cleanup();
    const { closePool } = await import('../../../database/mysql.js');
    await closePool();
    await pool.end();
  });

  async function coachProfileId(userId: number): Promise<number> {
    const [rows] = await pool.execute<any[]>(`SELECT id FROM coach_profiles WHERE user_id = ?`, [userId]);
    return Number(rows[0].id);
  }

  async function ppAvailable(userId: number): Promise<number | null> {
    const [rows] = await pool.execute<any[]>(`SELECT is_available FROM professional_profiles WHERE user_id = ?`, [userId]);
    return rows.length ? Number(rows[0].is_available) : null;
  }

  it('1. a listed coach (with a professional profile) can be toggled via its coach_profile id (the id the Coaches page emits)', async () => {
    const { activitiesRepository } = await import('../infrastructure/repositories/activities.repository.js');
    const cpA = await coachProfileId(COACH_A);
    const result = await activitiesRepository.toggleCoachAvailability(cpA);
    expect(result).toEqual({ is_available: false, user_id: COACH_A });
    // The correct record (Coach A's professional_profiles) was updated.
    expect(await ppAvailable(COACH_A)).toBe(0);
  });

  it('2. a coach WITHOUT a professional_profiles row (the bug case) can now be enabled, creating/upserting its availability record', async () => {
    const { activitiesRepository } = await import('../infrastructure/repositories/activities.repository.js');
    const cpB = await coachProfileId(COACH_B);
    const result = await activitiesRepository.toggleCoachAvailability(cpB);
    expect(result).toEqual({ is_available: true, user_id: COACH_B });
    // A professional_profiles row now exists for Coach B with is_available 1.
    expect(await ppAvailable(COACH_B)).toBe(1);
  });

  it('3. a valid currently-disabled coach can be enabled', async () => {
    const { activitiesRepository } = await import('../infrastructure/repositories/activities.repository.js');
    const cpC = await coachProfileId(COACH_C);
    expect(await ppAvailable(COACH_C)).toBe(0);
    const result = await activitiesRepository.toggleCoachAvailability(cpC);
    expect(result.is_available).toBe(true);
    expect(await ppAvailable(COACH_C)).toBe(1);
  });

  it('4. an invalid/non-existent id still returns Coach not found', async () => {
    const { activitiesRepository } = await import('../infrastructure/repositories/activities.repository.js');
    const { activitiesService } = await import('../application/activities.service.js');

    expect(await activitiesRepository.toggleCoachAvailability(99999999)).toBeNull();
    await expect(activitiesService.toggleCoachAvailability(99999999)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Coach not found',
    });
  });

  it('5. the /coaches/:id/toggle route remains protected (auth + adminGuard, RBAC intact)', async () => {
    const Fastify = (await import('fastify')).default;
    const { activitiesRoutes } = await import('../presentation/activities.routes.js');
    const { initAuthMiddleware } = await import('../../../shared/middleware/auth.middleware.js');

    try {
      initAuthMiddleware({
        resolveUser: async () => null,
        checkRole: async () => false,
        checkPermission: async () => false,
        checkOrgApproved: async () => false,
      });
    } catch { /* already initialized */ }

    const app = Fastify();
    await activitiesRoutes(app, { requireFeatureFlag: () => async () => undefined });
    await app.ready();

    // Route is still registered and reachable.
    expect(app.hasRoute({ method: 'PATCH', url: '/coaches/:id/toggle' })).toBe(true);

    // An unauthenticated request is rejected by the auth chain — the Enable
    // action cannot bypass protection.
    const res = await app.inject({ method: 'PATCH', url: '/coaches/1/toggle' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('6. the Coaches list still returns the coaches and the toggle leaves coach lifecycle fields untouched', async () => {
    const { activitiesRepository } = await import('../infrastructure/repositories/activities.repository.js');
    const list = await activitiesRepository.findCoachesAdmin({ page: 1, limit: 50 });
    const ids = (list.data as any[]).map((c: any) => Number(c.user_id));
    expect(ids).toContain(COACH_A);
    expect(ids).toContain(COACH_B);
    expect(ids).toContain(COACH_C);

    // Toggle only flips availability — coach status/platform_status are unchanged.
    const [rows] = await pool.execute<any[]>(`SELECT status, platform_status FROM coach_profiles WHERE user_id = ?`, [COACH_A]);
    expect(rows[0].status).toBe('approved');
    expect(rows[0].platform_status).toBe('active');
  });
});