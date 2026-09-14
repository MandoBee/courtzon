import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    REDIS_HOST: '127.0.0.1', REDIS_PORT: 6379, REDIS_DB: 0,
    DB_HOST: '127.0.0.1', DB_PORT: 3307, DB_USER: 'root', DB_PASSWORD: 'test', DB_NAME: 'courtzon_v3',
  },
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: vi.fn(async () => [[], []]),
    query: vi.fn(async () => [[], []]),
    getConnection: vi.fn(),
  }),
}));

vi.mock('../../../infrastructure/redis/redis.client.js', () => ({
  getRedisClient: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), expire: vi.fn(), on: vi.fn(), quit: vi.fn() })),
  closeRedisClient: vi.fn(),
}));

const findCoachByUserIdMock = vi.fn();
const getCoachAvailabilityMock = vi.fn();
const getCoachBlackoutsMock = vi.fn();
const getCoachStatsMock = vi.fn();
const getCoachVenueTimezoneMock = vi.fn();
const findOrgAgreementsMock = vi.fn();
const findScheduledSessionsOnDateMock = vi.fn();

vi.mock('../infrastructure/repositories/activities.repository.js', () => ({
  activitiesRepository: {
    findCoachByUserId: (id: number) => findCoachByUserIdMock(id),
    getCoachAvailability: (coachId: number) => getCoachAvailabilityMock(coachId),
    getCoachBlackouts: (coachId: number, fromDate?: string) => getCoachBlackoutsMock(coachId, fromDate),
    getCoachStats: (coachId: number, today: string) => getCoachStatsMock(coachId, today),
    getCoachVenueTimezone: (coachId: number) => getCoachVenueTimezoneMock(coachId),
    findOrgAgreements: (coachId: number) => findOrgAgreementsMock(coachId),
    findScheduledSessionsOnDate: (coachId: number, date: string) => findScheduledSessionsOnDateMock(coachId, date),
  },
}));

vi.mock('../../financial/application/commission.service.js', () => ({
  commissionService: { calculate: vi.fn(async () => ({ rate: 10, netAmount: 0, commissionAmount: 0 })) },
}));

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { emit: vi.fn() },
}));

import { activitiesService } from '../application/activities.service.js';

const COACH = { id: 10, user_id: 1, is_available: 1, status: 'approved' };

describe('Coach venue-local business date (BE-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    findCoachByUserIdMock.mockResolvedValue(COACH);
    getCoachAvailabilityMock.mockResolvedValue([{ day_of_week: 0, start_time: '09:00', end_time: '17:00' }]);
    getCoachBlackoutsMock.mockResolvedValue([]);
    getCoachStatsMock.mockResolvedValue({ todaySessions: 1, pendingRequests: 0, activePlayers: 2, totalSessionsCompleted: 5, upcomingSessions: 3 });
    getCoachVenueTimezoneMock.mockResolvedValue('Africa/Cairo');
    findOrgAgreementsMock.mockResolvedValue([]);
    findScheduledSessionsOnDateMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives the NEXT local day in Africa/Cairo at the UTC-midnight boundary (summer UTC+3)', async () => {
    // 2026-07-10T21:30:00Z = 2026-07-11 00:30 in Cairo (UTC+3 DST). UTC today is 07-10.
    vi.setSystemTime(new Date('2026-07-10T21:30:00.000Z'));

    await activitiesService.getMyCoachAvailability(1);
    expect(getCoachBlackoutsMock).toHaveBeenCalledWith(10, '2026-07-11');

    await activitiesService.getCoachStats(1);
    expect(getCoachStatsMock).toHaveBeenCalledWith(10, '2026-07-11');
  });

  it('derives the NEXT local day in Africa/Cairo across the winter (non-DST UTC+2) boundary', async () => {
    // 2026-01-10T22:30:00Z = 2026-01-11 00:30 in Cairo (UTC+2, no DST). UTC today is 01-10.
    vi.setSystemTime(new Date('2026-01-10T22:30:00.000Z'));

    await activitiesService.getCoachAvailabilityPublic(10);
    expect(getCoachBlackoutsMock).toHaveBeenCalledWith(10, '2026-01-11');
  });

  it('falls back to the platform timezone (Africa/Cairo) when the coach has no service-location branch', async () => {
    getCoachVenueTimezoneMock.mockResolvedValue(null);
    // Same boundary instant; platform default is Africa/Cairo.
    vi.setSystemTime(new Date('2026-07-10T21:30:00.000Z'));

    await activitiesService.getCoachStats(1);
    expect(getCoachStatsMock).toHaveBeenCalledWith(10, '2026-07-11');
  });
});