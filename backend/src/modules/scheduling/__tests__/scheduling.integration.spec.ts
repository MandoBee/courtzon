import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';

let pool: mysql.Pool;

const TEST_USER = 999997;
const TEST_COACH_USER = 999996;
const TEST_ORG_ID = 1;
const TEST_BRANCH_ID = 999998;
const TEST_RESOURCE_ID = 999998;
const TEST_DATE = '2027-11-15';
const TEST_DAY_OF_WEEK = 7;
const TEST_START = '10:00';
const TEST_END = '11:00';

beforeAll(async () => {
  pool = mysql.createPool({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'courtzon2026',
    database: 'courtzon_v3',
    multipleStatements: true,
  });

  await pool.execute(`DELETE FROM coach_sessions WHERE player_id = ${TEST_USER}`);
  await pool.execute(`DELETE FROM booking_participants WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM bookings WHERE user_id = ${TEST_USER} AND booking_date = ?`, [TEST_DATE]);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id IN (${TEST_USER}, ${TEST_COACH_USER})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${TEST_USER}, ${TEST_COACH_USER})`);

  await pool.execute(`INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
    VALUES (${TEST_USER}, UUID(), 1, '01288888888', '+201288888888', 'sched-e2e@test.com', '$2b$10$test', 'Scheduling E2E Player', 'male', 'active')`);
  await pool.execute(`INSERT IGNORE INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender, account_status)
    VALUES (${TEST_COACH_USER}, UUID(), 1, '01277777777', '+201277777777', 'sched-e2e-coach@test.com', '$2b$10$test', 'Scheduling E2E Coach', 'male', 'active')`);
  await pool.execute(`INSERT IGNORE INTO user_wallets (user_id, balance, currency_code, version) VALUES (${TEST_USER}, 9999999, 'EGP', 1)`);
  await pool.execute(`INSERT IGNORE INTO user_wallets (user_id, balance, currency_code, version) VALUES (${TEST_COACH_USER}, 0, 'EGP', 1)`);
});

afterAll(async () => {
  await pool.execute(`DELETE FROM coach_sessions WHERE player_id = ${TEST_USER}`);
  await pool.execute(`DELETE FROM booking_participants WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${TEST_USER})`);
  await pool.execute(`DELETE FROM bookings WHERE user_id = ${TEST_USER} AND booking_date = ?`, [TEST_DATE]);
  await pool.execute(`DELETE FROM user_wallets WHERE user_id IN (${TEST_USER}, ${TEST_COACH_USER})`);
  await pool.execute(`DELETE FROM users WHERE id IN (${TEST_USER}, ${TEST_COACH_USER})`);
  await pool.end();
});

describe('Scheduling E2E — Seed Data Validation', () => {
  it('has organisations, branches, and resources', async () => {
    const [orgs] = await pool.execute<any[]>('SELECT COUNT(*) as cnt FROM organisations');
    expect(orgs[0].cnt).toBeGreaterThan(0);

    const [branches] = await pool.execute<any[]>('SELECT COUNT(*) as cnt FROM branches');
    expect(branches[0].cnt).toBeGreaterThan(0);

    const [resources] = await pool.execute<any[]>('SELECT COUNT(*) as cnt FROM resources WHERE is_active = TRUE');
    expect(resources[0].cnt).toBeGreaterThan(0);
  });

  it('has approved coaches with hourly rates', async () => {
    const [coaches] = await pool.execute<any[]>(
      `SELECT cp.id, cp.hourly_rate FROM coach_profiles cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.status = 'approved' AND cp.hourly_rate IS NOT NULL AND cp.hourly_rate > 0
       LIMIT 1`
    );
    expect(coaches.length).toBeGreaterThan(0);
  });

  it('has coach availability entries', async () => {
    const [avail] = await pool.execute<any[]>(
      'SELECT COUNT(*) as cnt FROM coach_availability'
    );
    expect(avail[0].cnt).toBeGreaterThan(0);
  });
});

describe('Scheduling E2E — Provider Layer', () => {
  it('CourtProvider.getAvailableSlots returns slots for an active resource', async () => {
    const { CourtProvider } = await import('../providers/court.provider.js');
    const [resources] = await pool.execute<any[]>(
      `SELECT id FROM resources WHERE is_active = TRUE LIMIT 1`
    );
    if (resources.length === 0) return;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dow = tomorrow.getDay() === 0 ? 7 : tomorrow.getDay();

    const provider = new CourtProvider(resources[0].id);
    const available = await provider.isAvailable();
    if (!available) return;

    const slots = await provider.getAvailableSlots(tomorrow.toISOString().slice(0, 10), dow);
    expect(Array.isArray(slots)).toBe(true);
    for (const slot of slots) {
      expect(slot.startTime).toBeDefined();
      expect(slot.endTime).toBeDefined();
    }
  });

  it('CoachProvider returns capabilities and location', async () => {
    const { CoachProvider } = await import('../providers/coach.provider.js');
    const [coaches] = await pool.execute<any[]>(
      `SELECT cp.id FROM coach_profiles cp WHERE cp.status = 'approved' LIMIT 1`
    );
    if (coaches.length === 0) return;

    const provider = new CoachProvider(coaches[0].id);
    const caps = await provider.getCapabilities();
    expect(caps).toHaveProperty('sportIds');
    expect(Array.isArray(caps.sportIds)).toBe(true);
  });
});

describe('Scheduling E2E — Engine Core', () => {
  it('search returns candidates when coach + court have matching slots', async () => {
    const { SchedulingEngine } = await import('../scheduling-engine.js');
    const { CourtProvider } = await import('../providers/court.provider.js');
    const { CoachProvider } = await import('../providers/coach.provider.js');

    const engine = new SchedulingEngine();

    const [resources] = await pool.execute<any[]>(
      `SELECT id FROM resources WHERE is_active = TRUE LIMIT 1`
    );
    const [coaches] = await pool.execute<any[]>(
      `SELECT cp.id FROM coach_profiles cp WHERE cp.status = 'approved' LIMIT 1`
    );
    if (resources.length === 0 || coaches.length === 0) return;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);
    const dow = tomorrow.getDay() === 0 ? 7 : tomorrow.getDay();

    const courtProvider = new CourtProvider(resources[0].id);
    const coachProvider = new CoachProvider(coaches[0].id);

    if (!(await courtProvider.isAvailable()) || !(await coachProvider.isAvailable())) return;

    const config = {
      activityType: 'coach_session',
      requiredResources: [{ resourceType: 'coach' }, { resourceType: 'court' }],
      crossConstraints: [
        { type: 'sport_match' as const, from: 'coach', to: 'court' },
        { type: 'location_match' as const, from: 'coach', to: 'court' },
      ],
    };

    const pricingFn = async () => 100;

    const results = await engine.search(
      { activityType: 'coach_session', date: dateStr, dayOfWeek: dow, durationMinutes: 60, constraints: {} },
      [coachProvider, courtProvider],
      config,
      pricingFn,
    );

    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0].resources.length).toBe(2);
      expect(results[0].totalPrice).toBeGreaterThan(0);
    }
  });

  it('search returns empty when sport constraint fails', async () => {
    const { SchedulingEngine } = await import('../scheduling-engine.js');
    const engine = new SchedulingEngine();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    const mockCoach = {
      resourceType: 'coach',
      entityId: 99999,
      getAvailableSlots: async () => [{ startTime: '09:00', endTime: '12:00' }],
      hasConflict: async () => false,
      getCapabilities: async () => ({ sportIds: [99] }),
      getLocation: async () => ({ branchId: 1 }),
      isAvailable: async () => true,
    };

    const mockCourt = {
      resourceType: 'court',
      entityId: 99999,
      getAvailableSlots: async () => [{ startTime: '09:00', endTime: '12:00' }],
      hasConflict: async () => false,
      getCapabilities: async () => ({ sportIds: [1] }),
      getLocation: async () => ({ branchId: 1 }),
      isAvailable: async () => true,
    };

    const results = await engine.search(
      { activityType: 'coach_session', date: dateStr, dayOfWeek: 1, durationMinutes: 60, constraints: {} },
      [mockCoach, mockCourt],
      {
        activityType: 'coach_session',
        requiredResources: [{ resourceType: 'coach' }, { resourceType: 'court' }],
        crossConstraints: [{ type: 'sport_match', from: 'coach', to: 'court' }],
      },
      async () => 100,
    );

    expect(results).toEqual([]);
  });

  it('search returns empty when location constraint fails', async () => {
    const { SchedulingEngine } = await import('../scheduling-engine.js');
    const engine = new SchedulingEngine();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    const mockCoach = {
      resourceType: 'coach',
      entityId: 99999,
      getAvailableSlots: async () => [{ startTime: '09:00', endTime: '12:00' }],
      hasConflict: async () => false,
      getCapabilities: async () => ({ sportIds: [1] }),
      getLocation: async () => ({ branchId: 1 }),
      isAvailable: async () => true,
    };

    const mockCourt = {
      resourceType: 'court',
      entityId: 99999,
      getAvailableSlots: async () => [{ startTime: '09:00', endTime: '12:00' }],
      hasConflict: async () => false,
      getCapabilities: async () => ({ sportIds: [1] }),
      getLocation: async () => ({ branchId: 2 }),
      isAvailable: async () => true,
    };

    const results = await engine.search(
      { activityType: 'coach_session', date: dateStr, dayOfWeek: 1, durationMinutes: 60, constraints: {} },
      [mockCoach, mockCourt],
      {
        activityType: 'coach_session',
        requiredResources: [{ resourceType: 'coach' }, { resourceType: 'court' }],
        crossConstraints: [{ type: 'location_match', from: 'coach', to: 'court' }],
      },
      async () => 100,
    );

    expect(results).toEqual([]);
  });
});

describe('Scheduling E2E — DTO Validation', () => {
  it('BookSessionSchema rejects invalid times', async () => {
    const { BookSessionSchema } = await import('../presentation/scheduling.dto.js');
    const result = BookSessionSchema.safeParse({
      coachId: 1,
      resourceId: 1,
      date: '2027-01-01',
      startTime: '11:00',
      endTime: '10:00',
    });
    expect(result.success).toBe(false);
  });

  it('BookSessionSchema rejects invalid date format', async () => {
    const { BookSessionSchema } = await import('../presentation/scheduling.dto.js');
    const result = BookSessionSchema.safeParse({
      coachId: 1,
      resourceId: 1,
      date: '01-01-2027',
      startTime: '10:00',
      endTime: '11:00',
    });
    expect(result.success).toBe(false);
  });

  it('CoachSearchSchema validates valid input', async () => {
    const { CoachSearchSchema } = await import('../presentation/scheduling.dto.js');
    const result = CoachSearchSchema.safeParse({
      date: '2027-01-01',
      dayOfWeek: 3,
      durationMinutes: 60,
      coachId: 1,
    });
    expect(result.success).toBe(true);
  });

  it('CoachSearchSchema rejects duration < 30', async () => {
    const { CoachSearchSchema } = await import('../presentation/scheduling.dto.js');
    const result = CoachSearchSchema.safeParse({
      date: '2027-01-01',
      dayOfWeek: 3,
      durationMinutes: 15,
      coachId: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('Scheduling E2E — Booking Service Integration', () => {
  it('bookSession creates a booking and coach session record', async () => {
    const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');

    const [coaches] = await pool.execute<any[]>(
      `SELECT cp.id FROM coach_profiles cp WHERE cp.status = 'approved' AND cp.hourly_rate IS NOT NULL AND cp.hourly_rate > 0 LIMIT 1`
    );
    const [resources] = await pool.execute<any[]>(
      `SELECT id FROM resources WHERE is_active = TRUE AND hourly_price IS NOT NULL LIMIT 1`
    );
    if (coaches.length === 0 || resources.length === 0) return;

    const coachId = coaches[0].id;
    const resourceId = resources[0].id;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    const service = new SchedulingBookingService();
    const result = await service.bookSession(
      { coachId, resourceId, date: dateStr, startTime: TEST_START, endTime: TEST_END },
      TEST_USER,
    );

    expect(result).toHaveProperty('bookingId');
    expect(result).toHaveProperty('sessionId');
    expect(result.bookingId).toBeGreaterThan(0);
    expect(result.sessionId).toBeGreaterThan(0);
    expect(result.priceBreakdown.total).toBeGreaterThan(0);

    const [bookings] = await pool.execute<any[]>(
      `SELECT * FROM bookings WHERE id = ?`, [result.bookingId]
    );
    expect(bookings.length).toBe(1);
    expect(bookings[0].booking_type).toBe('coach_session');

    const [sessions] = await pool.execute<any[]>(
      `SELECT * FROM coach_sessions WHERE id = ?`, [result.sessionId]
    );
    expect(sessions.length).toBe(1);
    expect(sessions[0].coach_id).toBe(coachId);
    expect(sessions[0].player_id).toBe(TEST_USER);
  });
});

describe('Scheduling E2E — Event Emission', () => {
  it('booking:created event is emitted when a booking is created', async () => {
    const { eventBus } = await import('../../../shared/event-bus/index.js');
    const events: string[] = [];
    const handler = (data: any) => { events.push('booking:created'); };
    eventBus.on('booking:created', handler);

    const { SchedulingBookingService } = await import('../application/scheduling-booking.service.js');

    const [coaches] = await pool.execute<any[]>(
      `SELECT cp.id FROM coach_profiles cp WHERE cp.status = 'approved' AND cp.hourly_rate IS NOT NULL AND cp.hourly_rate > 0 LIMIT 1`
    );
    const [resources] = await pool.execute<any[]>(
      `SELECT id FROM resources WHERE is_active = TRUE AND hourly_price IS NOT NULL LIMIT 1`
    );
    if (coaches.length === 0 || resources.length === 0) return;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    const service = new SchedulingBookingService();
    await service.bookSession(
      { coachId: coaches[0].id, resourceId: resources[0].id, date: dateStr, startTime: '14:00', endTime: '15:00' },
      TEST_USER,
    );

    expect(events).toContain('booking:created');
    eventBus.off('booking:created', handler);
  });
});
