import { describe, it, expect, vi, beforeEach } from 'vitest';

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
const findOrgAgreementsMock = vi.fn();
const setCoachAvailabilityMock = vi.fn();
const addCoachBlackoutMock = vi.fn();
const removeCoachBlackoutMock = vi.fn();
const updateCoachProfileMock = vi.fn();
const getCoachAvailabilityMock = vi.fn();
const findScheduledSessionsOnDateMock = vi.fn();

vi.mock('../infrastructure/repositories/activities.repository.js', () => ({
  activitiesRepository: {
    findCoachByUserId: (id: number) => findCoachByUserIdMock(id),
    findOrgAgreements: (coachId: number) => findOrgAgreementsMock(coachId),
    setCoachAvailability: (coachId: number, slots: any[]) => setCoachAvailabilityMock(coachId, slots),
    addCoachBlackout: (coachId: number, date: string, reason?: string) => addCoachBlackoutMock(coachId, date, reason),
    removeCoachBlackout: (coachId: number, id: number) => removeCoachBlackoutMock(coachId, id),
    updateCoachProfile: (userId: number, data: any) => updateCoachProfileMock(userId, data),
    getCoachAvailability: (coachId: number) => getCoachAvailabilityMock(coachId),
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
import { eventBusV2 } from '../../../shared/event-bus/index.js';

const COACH = { id: 10, user_id: 1, is_available: 1, status: 'approved' };

describe('Coach availability realtime emissions (Group 3B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findCoachByUserIdMock.mockResolvedValue(COACH);
    findOrgAgreementsMock.mockResolvedValue([{ organisation_id: 5 }, { organisation_id: 9 }]);
    setCoachAvailabilityMock.mockResolvedValue(undefined);
    addCoachBlackoutMock.mockResolvedValue(42);
    removeCoachBlackoutMock.mockResolvedValue(true);
    updateCoachProfileMock.mockResolvedValue(true);
    getCoachAvailabilityMock.mockResolvedValue([{ day_of_week: 0, start_time: '09:00', end_time: '17:00' }]);
    findScheduledSessionsOnDateMock.mockResolvedValue([]);
  });

  function availabilityCalls(): any[] {
    return vi.mocked(eventBusV2.emit).mock.calls.filter((c: any) => c[0] === 'coach:availability-changed');
  }

  it('1. weekly availability update emits coach:availability-changed AFTER persistence, with org ids', async () => {
    await activitiesService.setMyCoachAvailability(1, [{ dayOfWeek: 0, startTime: '09:00', endTime: '17:00' }]);
    expect(setCoachAvailabilityMock).toHaveBeenCalled();
    const calls = availabilityCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({ userId: 1, coachId: 10, isAvailable: true, organisationIds: [5, 9] });
  });

  it('2. blackout creation emits coach:availability-changed AFTER persistence', async () => {
    const res = await activitiesService.addMyCoachBlackout(1, '2026-10-01', 'Travel');
    expect(res).toEqual({ id: 42 });
    const calls = availabilityCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({ coachId: 10, organisationIds: [5, 9] });
  });

  it('3. blackout deletion emits coach:availability-changed AFTER persistence', async () => {
    await activitiesService.removeMyCoachBlackout(1, 7);
    expect(removeCoachBlackoutMock).toHaveBeenCalledWith(10, 7);
    const calls = availabilityCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({ coachId: 10, organisationIds: [5, 9] });
  });

  it('4. failed persistence does NOT emit a successful availability event', async () => {
    setCoachAvailabilityMock.mockRejectedValue(new Error('db down'));
    await expect(
      activitiesService.setMyCoachAvailability(1, [{ dayOfWeek: 0, startTime: '09:00', endTime: '17:00' }]),
    ).rejects.toThrow('db down');
    expect(availabilityCalls()).toHaveLength(0);
  });

  it('5. a coach with no agreements emits with an empty organisationIds array', async () => {
    findOrgAgreementsMock.mockResolvedValue([]);
    await activitiesService.setMyCoachAvailability(1, [{ dayOfWeek: 0, startTime: '09:00', endTime: '17:00' }]);
    const calls = availabilityCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1].organisationIds).toEqual([]);
  });

  it('6. updateCoachProfile is_available toggle emits with org ids', async () => {
    // existing (is_available 1) → repo update returns truthy → refreshed profile (is_available 0)
    findCoachByUserIdMock
      .mockResolvedValueOnce({ ...COACH, is_available: 1 })
      .mockResolvedValueOnce({ ...COACH, is_available: 0 });
    await activitiesService.updateCoachProfile(1, { isAvailable: false });
    const calls = availabilityCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({ coachId: 10, isAvailable: false, organisationIds: [5, 9] });
  });
});