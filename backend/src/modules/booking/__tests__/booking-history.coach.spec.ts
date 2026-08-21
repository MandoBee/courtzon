import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

// ── Group D — coach bookCourtForSession availability alignment ────────────
// Verifies that booking a court for a coach session uses the authoritative
// availability guard (resource-row serialization + overlap check) and that a
// collision returns ConflictError (409), never a raw ER_DUP_ENTRY 500.

let pool: mysql.Pool;
let activitiesService: any;

const COACH_USER = 999981;
const PLAYER_USER = 999982;
const ORG = 999981;
const BRANCH = 999981;
const RESOURCE = 999981;
const SPORT_ID = 19;

async function cleanup() {
  await pool.execute(`DELETE FROM booking_cancellations WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${COACH_USER},${PLAYER_USER}))`);
  await pool.execute(`DELETE FROM booking_slots WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (${COACH_USER},${PLAYER_USER}))`);
  await pool.execute(`DELETE FROM bookings WHERE user_id IN (${COACH_USER},${PLAYER_USER})`);
  await pool.execute(`DELETE FROM coach_sessions WHERE coach_id IN (SELECT id FROM coach_profiles WHERE user_id=${COACH_USER})`);
  await pool.execute(`DELETE FROM coach_profiles WHERE user_id=${COACH_USER}`);
  await pool.execute(`DELETE FROM resources WHERE id=${RESOURCE}`);
  await pool.execute(`DELETE FROM branches WHERE id=${BRANCH}`);
  await pool.execute(`DELETE FROM organisations WHERE id=${ORG}`);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id IN (${COACH_USER},${PLAYER_USER})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${COACH_USER},${PLAYER_USER})`);
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

  // Users (coach + player)
  await pool.execute(`INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
    VALUES (${COACH_USER}, UUID(), 1, '01299999981', '+201299999981', 'gdc-coach@test.com', '$2b$10$test', 'GD Coach', 'male', 'active')`);
  await pool.execute(`INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
    VALUES (${PLAYER_USER}, UUID(), 1, '01299999982', '+201299999982', 'gdc-player@test.com', '$2b$10$test', 'GD Player', 'male', 'active')`);
  await pool.execute(`INSERT INTO user_wallets (user_id, balance, currency_code, version) VALUES (${COACH_USER}, 9999999, 'EGP', 1)`);
  await pool.execute(`INSERT INTO user_wallets (user_id, balance, currency_code, version) VALUES (${PLAYER_USER}, 9999999, 'EGP', 1)`);

  // Org + branch + resource
  await pool.execute(`INSERT IGNORE INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
    VALUES (${ORG}, UUID(), 1, ${COACH_USER}, 'GD Coach Org', 'gd-coach-org', TRUE)`);
  await pool.execute(`INSERT IGNORE INTO branches (id, public_id, organisation_id, name, slug, timezone, opening_time, closing_time)
    VALUES (${BRANCH}, UUID(), ${ORG}, 'GD Coach Branch', 'gd-coach-branch', 'Africa/Cairo', '08:00:00', '22:00:00')`);
  const [sports] = await pool.execute<any[]>(`SELECT id FROM sports WHERE deleted_at IS NULL ORDER BY id LIMIT 1`);
  const sportId = sports[0]?.id ?? SPORT_ID;
  await pool.execute(`INSERT IGNORE INTO resources (id, public_id, branch_id, resource_type_id, name, sport_id, hourly_price, opening_time, closing_time, is_active, slot_duration, max_bookings_per_slot)
    VALUES (${RESOURCE}, UUID(), ${BRANCH}, 1, 'GD Coach Court', ${sportId}, 50, '08:00:00', '22:00:00', TRUE, 60, 1)`);

  // Coach profile
  await pool.execute(`INSERT INTO coach_profiles (user_id, is_verified, status, platform_status) VALUES (${COACH_USER}, 1, 'approved', 'active')`);

  // Application pool + service
  const { createPool } = await import('../../../database/mysql.js');
  createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3' });
  const mod = await import('../../activities/application/activities.service.js');
  activitiesService = mod.activitiesService;
}, 60000);

afterAll(async () => {
  await cleanup();
  const { closePool } = await import('../../../database/mysql.js');
  await closePool();
  await pool.end();
}, 30000);

async function createCoachSession(date: string, start: string, end: string): Promise<number> {
  const [cp] = await pool.execute<any[]>('SELECT id FROM coach_profiles WHERE user_id = ?', [COACH_USER]);
  const coachProfileId = (cp as any)[0].id;
  const [r] = await pool.execute<any[]>(
    `INSERT INTO coach_sessions (coach_id, organisation_id, branch_id, player_id, start_time, end_time, price, currency_code, platform_commission_pct, status)
     VALUES (?, ?, ?, ?, ?, ?, 200, 'EGP', 10, 'pending_court')`,
    [coachProfileId, ORG, BRANCH, PLAYER_USER, `${date} ${start}:00`, `${date} ${end}:00`],
  );
  return (r as any).insertId;
}

async function bookCourt(sessionId: number, resourceId: number, start: string, end: string) {
  return activitiesService.bookCourtForSession(COACH_USER, sessionId, { resourceId, startTime: start, endTime: end });
}

describe('Group D — coach bookCourtForSession', () => {

  it('TEST 8a — available court booking succeeds', async () => {
    const date = '2027-12-11';
    await pool.execute(`DELETE FROM coach_sessions WHERE coach_id IN (SELECT id FROM coach_profiles WHERE user_id=${COACH_USER})`);
    await pool.execute(`DELETE FROM bookings WHERE user_id = ${COACH_USER}`);
    const sessionId = await createCoachSession(date, '09:00', '10:00');
    const result = await bookCourt(sessionId, RESOURCE, '09:00', '10:00');
    expect(result.bookingId).toBeGreaterThan(0);
    expect(result.status).toBe('pending_acceptance');
  });

  it('TEST 8b — court collision returns ConflictError 409 (not raw ER_DUP_ENTRY 500)', async () => {
    const date = '2027-12-12';
    await pool.execute(`DELETE FROM coach_sessions WHERE coach_id IN (SELECT id FROM coach_profiles WHERE user_id=${COACH_USER})`);
    await pool.execute(`DELETE FROM bookings WHERE user_id = ${COACH_USER}`);

    // Pre-book the court with a blocking booking for the same slot.
    const [existing] = await pool.execute<any[]>(
      `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type,
         booking_date, business_date, start_time, end_time, start_at_utc, end_at_utc,
         total_amount, booking_status, payment_status)
       VALUES (UUID(), ${PLAYER_USER}, ${ORG}, ${BRANCH}, ${RESOURCE}, 'private_match',
         ?, ?, '10:00', '11:00', TIMESTAMP(?), TIMESTAMP(?), 100, 'confirmed', 'paid')`,
      [date, date, `${date} 10:00:00`, `${date} 11:00:00`],
    );

    const sessionId = await createCoachSession(date, '10:00', '11:00');
    await expect(bookCourt(sessionId, RESOURCE, '10:00', '11:00')).rejects.toMatchObject({ statusCode: 409 });

    // Only the pre-booked booking exists (no duplicate created).
    const [cnt] = await pool.execute<any[]>(`SELECT COUNT(*) as cnt FROM bookings WHERE resource_id = ${RESOURCE} AND booking_date = ? AND booking_status = 'confirmed'`, [date]);
    expect(cnt[0].cnt).toBe(1);
  });

  it('TEST 8c — partial overlap collision returns 409', async () => {
    const date = '2027-12-13';
    await pool.execute(`DELETE FROM coach_sessions WHERE coach_id IN (SELECT id FROM coach_profiles WHERE user_id=${COACH_USER})`);
    await pool.execute(`DELETE FROM bookings WHERE user_id IN (${COACH_USER},${PLAYER_USER}) AND booking_date = ?`, [date]);

    await pool.execute(
      `INSERT INTO bookings (public_id, user_id, organisation_id, branch_id, resource_id, booking_type,
         booking_date, business_date, start_time, end_time, start_at_utc, end_at_utc,
         total_amount, booking_status, payment_status)
       VALUES (UUID(), ${PLAYER_USER}, ${ORG}, ${BRANCH}, ${RESOURCE}, 'private_match',
         ?, ?, '10:30', '11:30', TIMESTAMP(?), TIMESTAMP(?), 100, 'confirmed', 'paid')`,
      [date, date, `${date} 10:30:00`, `${date} 11:30:00`],
    );
    const sessionId = await createCoachSession(date, '10:00', '11:00');
    await expect(bookCourt(sessionId, RESOURCE, '10:00', '11:00')).rejects.toMatchObject({ statusCode: 409 });
  });

});