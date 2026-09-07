import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

/**
 * Coach self-service profile save/update (PUT /coaches/profile).
 *
 * Business rule (current): a coach configures hourly rate, currency,
 * availability, bio, experience, sports and certifications. Session duration
 * is NO LONGER configured by the coach — it is always derived from the court
 * booking duration at booking time.
 *
 * Covers the full write + read + HTTP path:
 *   - all editable fields persist (bio, experience, hourly rate, currency,
 *     availability, sports, certifications)
 *   - is_available persists on professional_profiles (never coach_profiles)
 *   - a coach without a professional_profiles row can save
 *   - getCoachProfile no longer exposes session_durations
 *   - the actual PUT /coaches/profile HTTP request persists
 *   - hourly rate / availability keep persisting after the change
 *   - a user without a coach profile returns a proper 404
 */
describe('Coach self-service profile save/update', () => {
  let pool: mysql.Pool;

  const COACH = 999951; // has professional_profiles
  const COACH_NO_PP = 999952; // NO professional_profiles row
  const NON_COACH = 999953; // user with NO coach profile

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
      { id: COACH, phone: '0129999951', email: 'profile-a@test.com', name: 'Profile A' },
      { id: COACH_NO_PP, phone: '0129999952', email: 'profile-b@test.com', name: 'Profile B' },
      { id: NON_COACH, phone: '0129999953', email: 'profile-c@test.com', name: 'Profile C' },
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

  it('1. updates ALL editable fields and reads them back (bio, experience, rate, currency, availability, sports, certs)', async () => {
    const { activitiesRepository } = await import('../infrastructure/repositories/activities.repository.js');
    const ok = await activitiesRepository.updateCoachProfile(COACH, {
      bio: 'New bio text',
      experienceYears: 7,
      hourlyRate: 150,
      currencyCode: 'EGP',
      isAvailable: false,
      sports: [1],
      certifications: [{ name: 'Cert One', url: 'https://x/1' }],
    });
    expect(ok).toBe(true);

    const p: any = await activitiesRepository.findCoachByUserId(COACH);
    expect(p).toBeTruthy();
    expect(p.bio).toBe('New bio text');
    expect(Number(p.experience_years)).toBe(7);
    // is_available lives on professional_profiles (NOT coach_profiles) and persisted.
    expect(Number(p.is_available)).toBe(0);
    expect(JSON_ARR(p.sports)).toEqual([1]);
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
    });
    expect(ok).toBe(true);
    const p: any = await activitiesRepository.findCoachByUserId(COACH_NO_PP);
    expect(p).toBeTruthy();
    expect(p.bio).toBe('Bio B');
    expect(Number(p.is_available)).toBe(0);
    expect(Number(p.hourly_rate)).toBe(200);
    expect(p.currency_code).toBe('USD');
  });

  it('3. getCoachProfile no longer exposes session_durations (duration is court-derived)', async () => {
    const { activitiesService } = await import('../application/activities.service.js');
    const profile = await activitiesService.getCoachProfile(COACH);
    expect(profile).toBeTruthy();
    expect(profile.session_durations).toBeUndefined();
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

  it('5. hourly rate + availability keep persisting after the change (no session durations involved)', async () => {
    const { activitiesRepository } = await import('../infrastructure/repositories/activities.repository.js');
    // Test 4 left rate=175, available=true. Change both.
    const ok = await activitiesRepository.updateCoachProfile(COACH, {
      bio: 'HTTP edited bio',
      experienceYears: 9,
      hourlyRate: 350,
      currencyCode: 'SAR',
      isAvailable: false,
    });
    expect(ok).toBe(true);
    const p: any = await activitiesRepository.findCoachByUserId(COACH);
    expect(Number(p.hourly_rate)).toBe(350);
    expect(Number(p.is_available)).toBe(0);
    expect(p.currency_code).toBe('SAR');
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

  it('7. the coach profile DTO rejects a multi-sport submission (single-sport rule) and accepts one sport', async () => {
    const { CreateCoachProfileSchema } = await import('../presentation/activities.dto.js');
    expect(CreateCoachProfileSchema.safeParse({ sports: [1, 2] }).success).toBe(false);
    expect(CreateCoachProfileSchema.safeParse({ sports: [1, 2, 3] }).success).toBe(false);
    expect(CreateCoachProfileSchema.safeParse({ sports: [7] }).success).toBe(true);
    expect(CreateCoachProfileSchema.safeParse({ sports: [] }).success).toBe(true);
    expect(CreateCoachProfileSchema.safeParse({}).success).toBe(true);
  });

  it('8. profile save persists exactly one sport and reload returns it', async () => {
    const { activitiesRepository } = await import('../infrastructure/repositories/activities.repository.js');
    const ok = await activitiesRepository.updateCoachProfile(COACH, { sports: [7] });
    expect(ok).toBe(true);
    const p: any = await activitiesRepository.findCoachByUserId(COACH);
    expect(JSON_ARR(p.sports)).toEqual([7]);
  });

  it('9. a multi-sport array is normalized to the FIRST sport at persistence (defense-in-depth)', async () => {
    const { activitiesRepository } = await import('../infrastructure/repositories/activities.repository.js');
    // Even a direct repository call cannot store multiple sports — normalize to the primary.
    await activitiesRepository.updateCoachProfile(COACH, { sports: [1, 2] });
    const p: any = await activitiesRepository.findCoachByUserId(COACH);
    expect(JSON_ARR(p.sports)).toEqual([1]);
  });
});