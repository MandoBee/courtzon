import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: 6379,
    REDIS_DB: 0,
    DB_HOST: '127.0.0.1',
    DB_PORT: 3307,
    DB_USER: 'root',
    DB_PASSWORD: 'test',
    DB_NAME: 'courtzon_v3',
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
  getRedisClient: vi.fn(() => ({
    get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), expire: vi.fn(),
    on: vi.fn(), quit: vi.fn(),
  })),
  closeRedisClient: vi.fn(),
}));

/**
 * Hardening Exception 1 — legacy coach-session client-supplied price.
 *
 * The legacy `POST /coaches/sessions` route previously accepted a client-computed
 * `price` and derived coach earnings / platform commission from it (D-level
 * client-controlled financial input). The authoritative price must now be
 * derived server-side from trusted backend data only:
 *
 *   authoritativePrice = hourly_rate × duration
 *   hourly_rate        = org-agreement hourly_rate (when org selected)
 *                        else the coach's default hourly_rate
 *
 * The client `price` is ignored (never used for earnings, commission, or
 * persistence). These tests prove the backend remains the financial authority.
 */

const findCoachByUserIdMock = vi.fn();
const hasAcceptedAgreementMock = vi.fn();
const findOrgAgreementMock = vi.fn();
const createCoachSessionMock = vi.fn();
const commissionCalculateMock = vi.fn();

vi.mock('../infrastructure/repositories/activities.repository.js', () => ({
  activitiesRepository: {
    findCoachByUserId: (id: number) => findCoachByUserIdMock(id),
    hasAcceptedAgreement: (coachId: number, orgId: number) => hasAcceptedAgreementMock(coachId, orgId),
    findOrgAgreement: (coachId: number, orgId: number) => findOrgAgreementMock(coachId, orgId),
    createCoachSession: (data: any) => createCoachSessionMock(data),
  },
}));

vi.mock('../../financial/application/commission.service.js', () => ({
  commissionService: {
    calculate: (orgId: number, entity: string, amount: number) => commissionCalculateMock(orgId, entity, amount),
  },
}));

import { activitiesService } from '../application/activities.service.js';

const COACH = { id: 10, user_id: 1, hourly_rate: 200, currency_code: 'EGP', status: 'approved' };

beforeEach(() => {
  vi.clearAllMocks();
  findCoachByUserIdMock.mockResolvedValue(COACH);
  hasAcceptedAgreementMock.mockResolvedValue(true);
  findOrgAgreementMock.mockResolvedValue(null);
  createCoachSessionMock.mockResolvedValue(42);
  commissionCalculateMock.mockResolvedValue({ rate: 10, netAmount: 180, commissionAmount: 20 });
});

describe('Exception 1: coach-session price is backend-authoritative', () => {
  const base = () => ({
    organisationId: undefined,
    playerId: 5,
    startTime: '2026-09-01T10:00',
    endTime: '2026-09-01T11:00',
    price: 9999, // client-supplied — must be ignored
    currencyCode: 'EGP',
  });

  it('ignores client-supplied upward price (uses hourly_rate × duration)', async () => {
    await activitiesService.createCoachSession(1, base());
    const persisted = createCoachSessionMock.mock.calls[0][0];
    // 1 hour × 200/hr = 200 (NOT 9999)
    expect(persisted.price).toBe(200);
    expect(persisted.coachEarnings).toBe(180); // 200 × 90%
    expect(persisted.orgEarnings).toBe(0);
    expect(persisted.platformCommissionPct).toBe(10);
  });

  it('ignores client-supplied downward price', async () => {
    await activitiesService.createCoachSession(1, { ...base(), price: 1 });
    const persisted = createCoachSessionMock.mock.calls[0][0];
    expect(persisted.price).toBe(200); // not 1
  });

  it('cannot set price to zero when the legitimate backend price is non-zero', async () => {
    await activitiesService.createCoachSession(1, { ...base(), price: 0 });
    const persisted = createCoachSessionMock.mock.calls[0][0];
    expect(persisted.price).toBe(200); // not 0
  });

  it('derives price from the org-agreement hourly_rate when an org is selected', async () => {
    findOrgAgreementMock.mockResolvedValue({ id: 1, hourly_rate: 500 });
    await activitiesService.createCoachSession(1, {
      ...base(),
      organisationId: 3,
      startTime: '2026-09-01T10:00',
      endTime: '2026-09-01T12:00', // 2 hours
    });
    const persisted = createCoachSessionMock.mock.calls[0][0];
    expect(persisted.price).toBe(1000); // 500 × 2h (NOT 9999)
  });

  it('calculates earnings/commission from the authoritative price', async () => {
    await activitiesService.createCoachSession(1, {
      ...base(),
      startTime: '2026-09-01T10:00',
      endTime: '2026-09-01T10:30', // 0.5h
    });
    const persisted = createCoachSessionMock.mock.calls[0][0];
    expect(persisted.price).toBe(100); // 200 × 0.5
    expect(persisted.coachEarnings).toBe(90); // 100 × 90%
  });

  it('requires the actor to be a coach (unauthorized blocked)', async () => {
    findCoachByUserIdMock.mockResolvedValue(null);
    await expect(activitiesService.createCoachSession(99, base())).rejects.toThrow('Not a coach');
    expect(createCoachSessionMock).not.toHaveBeenCalled();
  });

  it('requires an active org agreement when an org is selected', async () => {
    hasAcceptedAgreementMock.mockResolvedValue(false);
    await expect(
      activitiesService.createCoachSession(1, { ...base(), organisationId: 3 }),
    ).rejects.toThrow('active agreement');
    expect(createCoachSessionMock).not.toHaveBeenCalled();
  });

  it('passes trusted currency to persistence', async () => {
    await activitiesService.createCoachSession(1, base());
    const persisted = createCoachSessionMock.mock.calls[0][0];
    expect(persisted.currencyCode).toBe('EGP');
  });
});