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
const { poolState } = vi.hoisted(() => ({
  poolState: {
    impl: vi.fn(async (sql: string) => {
      if (String(sql).includes('FROM resources')) return [[{ id: 77, branch_id: 5, sport_id: 1 }], []];
      if (String(sql).includes('FROM branches')) return [[{ organisation_id: 3, coach_policy: 'contract_required' }], []];
      if (String(sql).includes('FROM users')) return [[{ id: 5 }], []];
      return [[], []];
    }),
  },
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: poolState.impl,
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
const getAcceptedAgreementMock = vi.fn();
const createCoachSessionMock = vi.fn();
const isCoachEligibleAtBranchMock = vi.fn();
const commissionCalculateMock = vi.fn();

vi.mock('../infrastructure/repositories/activities.repository.js', () => ({
  activitiesRepository: {
    findCoachByUserId: (id: number) => findCoachByUserIdMock(id),
    hasAcceptedAgreement: (coachId: number, orgId: number) => hasAcceptedAgreementMock(coachId, orgId),
    findOrgAgreement: (coachId: number, orgId: number) => findOrgAgreementMock(coachId, orgId),
    getAcceptedAgreement: (coachId: number, orgId: number) => getAcceptedAgreementMock(coachId, orgId),
    createCoachSession: (data: any) => createCoachSessionMock(data),
    isCoachEligibleAtBranch: (coachId: number, branchId: number) => isCoachEligibleAtBranchMock(coachId, branchId),
  },
}));

vi.mock('../../financial/application/commission.service.js', () => ({
  commissionService: {
    calculate: (orgId: number, entity: string, amount: number) => commissionCalculateMock(orgId, entity, amount),
  },
}));

import { activitiesService } from '../application/activities.service.js';

const COACH = { id: 10, user_id: 1, hourly_rate: 200, currency_code: 'EGP', status: 'approved', sports: [1] };

beforeEach(() => {
  vi.clearAllMocks();
  findCoachByUserIdMock.mockResolvedValue(COACH);
  hasAcceptedAgreementMock.mockResolvedValue(true);
  findOrgAgreementMock.mockResolvedValue(null);
  getAcceptedAgreementMock.mockResolvedValue(null);
  createCoachSessionMock.mockResolvedValue(42);
  isCoachEligibleAtBranchMock.mockResolvedValue({ eligible: true, reason: null, policy: 'contract_required', hasServiceAccess: true, hasAgreement: true });
  commissionCalculateMock.mockResolvedValue({ rate: 10, netAmount: 180, commissionAmount: 20 });
});

describe('Exception 1: coach-session price is backend-authoritative', () => {
  const base = () => ({
    organisationId: undefined,
    playerId: 5,
    // Branch context is required — the branch is resolved from the court.
    resourceId: 77,
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
    getAcceptedAgreementMock.mockResolvedValue({ id: 1, hourly_rate: 500 });
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

describe('Exception 1b: legacy coach-session eligibility enforcement', () => {
  const base = () => ({
    organisationId: undefined,
    playerId: 5,
    resourceId: 77,
    startTime: '2026-09-01T10:00',
    endTime: '2026-09-01T11:00',
    price: 100,
    currencyCode: 'EGP',
  });

  it('rejects a session with no court/branch context (cannot bypass eligibility)', async () => {
    const { resourceId: _omit, ...noResource } = base();
    await expect(activitiesService.createCoachSession(1, { ...noResource, branchId: undefined })).rejects.toThrow(
      /court .*resourceId.* or a branch/i,
    );
    expect(createCoachSessionMock).not.toHaveBeenCalled();
  });

  it('rejects a coach with no service access / not eligible at the branch', async () => {
    isCoachEligibleAtBranchMock.mockResolvedValue({ eligible: false, reason: 'Coach has no service access to this branch', policy: 'contract_required', hasServiceAccess: false, hasAgreement: false });
    await expect(activitiesService.createCoachSession(1, base())).rejects.toThrow(/service access|eligible/i);
    expect(createCoachSessionMock).not.toHaveBeenCalled();
  });

  it('rejects a sport mismatch between the court and the coach', async () => {
    // Sport mismatch: coach sports [1], court sport resolved from mock = 1 → OK.
    // Force mismatch by making the coach a different sport.
    findCoachByUserIdMock.mockResolvedValue({ ...COACH, sports: [2] });
    await expect(activitiesService.createCoachSession(1, base())).rejects.toThrow(/sport/i);
    expect(createCoachSessionMock).not.toHaveBeenCalled();
  });

  it('rejects a non-existent player (session attribution must be real)', async () => {
    const originalImpl = poolState.impl;
    poolState.impl = vi.fn(async (sql: string) => {
      if (String(sql).includes('FROM users')) return [[], []];
      if (String(sql).includes('FROM resources')) return [[{ id: 77, branch_id: 5, sport_id: 1 }], []];
      if (String(sql).includes('FROM branches')) return [[{ organisation_id: 3, coach_policy: 'contract_required' }], []];
      return [[], []];
    });
    try {
      await expect(activitiesService.createCoachSession(1, base())).rejects.toThrow(/Player/i);
      expect(createCoachSessionMock).not.toHaveBeenCalled();
    } finally {
      poolState.impl = originalImpl;
    }
  });
});