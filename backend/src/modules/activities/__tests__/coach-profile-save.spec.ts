import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

/**
 * My Coach Profile — self-service save/update (PUT /coaches/profile).
 *
 * Covers the full write + read + HTTP path so the "profile edits are not
 * persisted" report is verified against the current repository:
 *   - all editable fields persist (bio, experience, hourly rate, currency,
 *     availability, durations, sports, certifications)
 *   - is_available persists on professional_profiles (never coach_profiles)
 *   - a coach without a professional_profiles row can save
 *   - getCoachProfile returns session_durations
 *   - the actual PUT /coaches/profile HTTP request persists
 *   - clearing durations/sports/certifications to empty is persisted
 *   - a user without a coach profile returns a proper 404
 */
describe('Coach self-service profile save/update', () => {
  let pool: mysql.Pool;

  const COACH = 999941; // has professional_profiles
  const COACH_NO_PP = 999942; // NO professional_profiles row
  const NON_COACH = 999943; // user with NO coach profile

  async function cleanup() {
    await pool.execute(`DELETE FROM professional_services WHERE professional_profile_id IN
      (SELECT id FROM professional_profiles WHERE user_id IN (${COACH},${COACH_NO_PP},${NON_COACH}))`);
    await pool.execute(`DELETE FROM professional_profiles WHERE user_id IN (${COACH},${COACH_NO_PP},${NON_COACH})`);
    await pool.execute(`DELETE FROM coach_profiles WHERE user_id IN (${COACH},${COACH_NO_PP})`);
    await pool.execute(`DELETE FROM users WHERE id IN (${COACH},${COACH_NO_PP},${NON_COACH})`);
  }

  const JSON_ARR = (v: any) => (typeof v === 'string' ? JSON.parse(v) : (v ?? []));

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
      { id: COACH, phone: '0129999941', email: 'profile-a@test.com', name: 'Profile A' },
      { id: COACH_NO_PP, phone: '0129999942', email: 'profile-b@test.com', name: 'Profile B' },
      { id: NON_COACH, phone: '0129999943', email: 'profile-c@test.com', name: 'Profile C' },
    ]) {
      await pool.execute(
        `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
         VALUES (?, UUID(), 1, ?, CONCAT('+20', ?), ?, '$2b$10$test', ?, 'male', 'active')`,
        [u.id, u.phone, u.phone, u.email, u.name],
      );
    }
    // Coach profiles only for COACH and COACH_NO_PP.
    await pool.execute(`INSERT INTO coach_profiles (user_id, is_verified, status, platform_status) VALUES (?, 1, 'approved', 'active')`, [COACH]);
    await pool.execute(`INSERT INTO coach_profiles (user_id, is_verified, status, platform_status) VALUES (?, 1, 'approved', 'active')`, [COACH_NO_PP]);
    await pool.execute(`INSERT INTO professional_profiles (user_id, is_available) VALUES (?, 1)`, [COACH]);
    // COACH_NO_PP intentionally has NO professional_profiles row.
  }, 60000);

  afterAll(async () => {
    await cleanup();
    const { closePool } = await import('../../../database/mysql.js');
    await closePool();
    await pool.end();
  });

  it('1. updates ALL fields and reads them back (bio, experience, rate, currency, availability, durations, sports, certs)', async () => {
    const { activitiesRepository } = await import('../infrastructure/repositories/activities.repository.js');
    const ok = await activitiesRepository.updateCoachProfile(COACH, {
      bio: 'New bio text',
      experienceYears: 7,
      hourlyRate: 150,
      currencyCode: 'EGP',
      isAvailable: false,
      sessionDurations: [30, 60],
      sports: [1, 2],
      certifications: [{ name: 'Cert One', url: 'https://x/1' }],
    });
    expect(ok).toBe(true);

    const p: any = await activitiesRepository.findCoachByUserId(COACH);
    expect(p).toBeTruthy();
    expect(p.bio).toBe('New bio text');
    expect(Number(p.experience_years)).toBe(7);
    // is_available lives on professional_profiles (NOT coach_profiles) and persisted.
    expect(Number(p.is_available)).toBe(0);
    expect(JSON_ARR(p.sports)).toEqual([1, 2]);
    expect(JSON_ARR(p.certifications)).toEqual([{ name: 'Cert One', url: 'https://x/1' }]);
    expect(Number(p.hourly_rate)).toBe(150);
    expect(p.currency_code).toBe('EGP');
  });

  it('2. a coach WITHOUT professional_profiles can save (row created) incl. availability', async () => {
    const { activitiesRepository } = await import('../infrastructure/repositories/activities.repository.js');
    const ok = await activitiesRepository.updateCoachProfile(COACH_NO_PP, {
      bio: 'Bio B',
      hourlyRate: 200,
      currencyCode: 'USD',
      isAvailable: false,
      sessionDurations: [90],
    });
    expect(ok).toBe(true);
    const p: any = await activitiesRepository.findCoachByUserId(COACH_NO_PP);
    expect(p).toBeTruthy();
    expect(p.bio).toBe('Bio B');
    expect(Number(p.is_available)).toBe(0);
    expect(Number(p.hourly_rate)).toBe(200);
    expect(p.currency_code).toBe('USD');
  });

  it('3. getCoachProfile returns session_durations so the UI can display saved durations', async () => {
    const { activitiesService } = await import('../application/activities.service.js');
    const profile = await activitiesService.getCoachProfile(COACH);
    expect(profile).toBeTruthy();
    // Saved in test 1 as [30,60] — now exposed to the frontend.
    expect(profile.session_durations).toEqual([30, 60]);
  });

  it('4. the real PUT /coaches/profile HTTP request persists (route → controller → service → repository → DB)', async () => {
    const Fastify = (await import('fastify')).default;
    const { activitiesRoutes } = await import('../presentation/activities.routes.js');
    const { initAuthMiddleware } = await import('../../../shared/middleware/auth.middleware.js');

    try {
      initAuthMiddleware({
        resolveUser: async () => COACH,
        checkRole: async () => false,
        checkPermission: async () => true, // coaches.manage_profile granted
        checkOrgApproved: async () => false,
      });
    } catch { /* already initialized */ }

    const app = Fastify();
    await activitiesRoutes(app, { requireFeatureFlag: () => async () => undefined });
    await app.ready();

    const res = await app.inject({
      method: 'PUT',
      url: '/coaches/profile',
      payload: {
        bio: 'HTTP edited bio',
        experienceYears: 9,
        hourlyRate: 175,
        currencyCode: 'SAR',
        isAvailable: true,
        sessionDurations: [30],
        sports: [3],
        certifications: [{ name: 'HTTP Cert', url: 'https://y/2' }],
      },
    });
    expect(res.statusCode).toBe(200);

    const p: any = await activitiesRepositoryRead();
    expect(p).toBeTruthy();
    expect(p.bio).toBe('HTTP edited bio');
    expect(Number(p.experience_years)).toBe(9);
    expect(Number(p.is_available)).toBe(1);
    expect(Number(p.hourly_rate)).toBe(175);
    expect(p.currency_code).toBe('SAR');
    expect(JSON_ARR(p.sports)).toEqual([3]);
    await app.close();

    async function activitiesRepositoryRead() {
      const { activitiesRepository } = await import('../infrastructure/repositories/activities.repository.js');
      return activitiesRepository.findCoachByUserId(COACH);
    }
  });

  it('5. clearing durations/sports/certifications to empty is persisted', async () => {
    const { activitiesRepository } = await import('../infrastructure/repositories/activities.repository.js');
    // Test 4 left durations=[30], sports=[3], certs=[HTTP Cert]. Clear all.
    const ok = await activitiesRepository.updateCoachProfile(COACH, {
      bio: 'HTTP edited bio',
      experienceYears: 9,
      hourlyRate: 175,
      currencyCode: 'SAR',
      isAvailable: true,
      sessionDurations: [],
      sports: [],
      certifications: [],
    });
    expect(ok).toBe(true);
    const p: any = await activitiesRepository.findCoachByUserId(COACH);
    expect(JSON_ARR(p.sports)).toEqual([]);
    expect(JSON_ARR(p.certifications)).toEqual([]);

    const profile = await (await import('../application/activities.service.js')).activitiesService.getCoachProfile(COACH);
    expect(profile.session_durations).toEqual([]);
  });

  it('6. a user WITHOUT a coach profile gets a proper 404 on save', async () => {
    const { activitiesService } = await import('../application/activities.service.js');
    await expect(activitiesService.updateCoachProfile(NON_COACH, { bio: 'x' })).rejects.toMatchObject({
      statusCode: 404,
      message: 'Coach profile not found',
    });
    // No stray professional_profiles row was created for the non-coach user.
    const [rows] = await pool.execute<any[]>(`SELECT id FROM professional_profiles WHERE user_id = ?`, [NON_COACH]);
    expect(rows.length).toBe(0);
  });
});