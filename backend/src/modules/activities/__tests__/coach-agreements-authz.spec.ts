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

const findCoachByIdMock = vi.fn();
const isPlatformAdminMock = vi.fn();
const listOrgAgreementsMock = vi.fn();
const getCoachStatusMock = vi.fn();
const findOrgAgreementsMock = vi.fn();
const findCoachesMock = vi.fn();
const findCoachesAdminMock = vi.fn();
const findCoachByUserIdMock = vi.fn();
const upsertOrgAgreementMock = vi.fn();
const respondToOrgInviteMock = vi.fn();
const findOrgNameByIdMock = vi.fn();
const findUserFullNameMock = vi.fn();

vi.mock('../infrastructure/repositories/activities.repository.js', () => ({
  activitiesRepository: {
    findCoachById: (id: number) => findCoachByIdMock(id),
    isPlatformAdmin: (id: number) => isPlatformAdminMock(id),
    listOrgAgreements: (id: number) => listOrgAgreementsMock(id),
    getCoachStatus: (userId: number) => getCoachStatusMock(userId),
    findOrgAgreements: (id: number) => findOrgAgreementsMock(id),
    findCoaches: (filters: any) => findCoachesMock(filters),
    findCoachesAdmin: (filters: any) => findCoachesAdminMock(filters),
    findCoachByUserId: (id: number) => findCoachByUserIdMock(id),
    upsertOrgAgreement: (data: any) => upsertOrgAgreementMock(data),
    respondToOrgInvite: (coachId: number, agreementId: number, accept: boolean) => respondToOrgInviteMock(coachId, agreementId, accept),
    findOrgNameById: (id: number) => findOrgNameByIdMock(id),
    findUserFullName: (id: number) => findUserFullNameMock(id),
  },
}));

vi.mock('../../financial/application/commission.service.js', () => ({
  commissionService: { calculate: vi.fn(async () => ({ rate: 10, netAmount: 0, commissionAmount: 0 })) },
}));

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { emit: vi.fn() },
}));

import { activitiesService } from '../application/activities.service.js';
import { ForbiddenError, NotFoundError } from '../../../shared/errors/app-error.js';

const COACH = { id: 10, user_id: 1, status: 'approved', is_available: 1 };

describe('Coach agreements privacy (P1-01d)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findCoachByIdMock.mockResolvedValue(COACH);
    isPlatformAdminMock.mockResolvedValue(false);
    listOrgAgreementsMock.mockResolvedValue([{ id: 77, organisation_id: 5 }]);
    getCoachStatusMock.mockResolvedValue('approved');
    findOrgAgreementsMock.mockResolvedValue([]);
    findCoachesMock.mockResolvedValue([]);
    findCoachesAdminMock.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
    findCoachByUserIdMock.mockResolvedValue({ id: 10, user_id: 1, status: 'approved' });
    upsertOrgAgreementMock.mockResolvedValue(undefined);
    respondToOrgInviteMock.mockResolvedValue(1);
    findOrgNameByIdMock.mockResolvedValue('Club 5');
    findUserFullNameMock.mockResolvedValue('Coach One');
  });

  it('allows the owning coach to read their own agreements', async () => {
    const result = await activitiesService.getCoachAgreements(10, 1);
    expect(result).toEqual([{ id: 77, organisation_id: 5 }]);
    expect(listOrgAgreementsMock).toHaveBeenCalledWith(10);
    // Ownership short-circuits the admin lookup.
    expect(isPlatformAdminMock).not.toHaveBeenCalled();
  });

  it('denies an unrelated coach / user', async () => {
    isPlatformAdminMock.mockResolvedValue(false);
    await expect(activitiesService.getCoachAgreements(10, 2)).rejects.toBeInstanceOf(ForbiddenError);
    expect(listOrgAgreementsMock).not.toHaveBeenCalled();
  });

  it('allows an authorized platform administrator', async () => {
    isPlatformAdminMock.mockResolvedValue(true);
    const result = await activitiesService.getCoachAgreements(10, 99);
    expect(result).toEqual([{ id: 77, organisation_id: 5 }]);
    expect(isPlatformAdminMock).toHaveBeenCalledWith(99);
  });

  it('returns 404 for a missing coach profile (deny by default)', async () => {
    findCoachByIdMock.mockResolvedValue(null);
    await expect(activitiesService.getCoachAgreements(999, 1)).rejects.toBeInstanceOf(NotFoundError);
    expect(listOrgAgreementsMock).not.toHaveBeenCalled();
  });

  // ── C2 — coach agreement management is self-only ─────────────────────────
  it('coach agreement upsert always targets the caller’s own coach profile', async () => {
    await activitiesService.upsertOrgAgreement(1, {
      // A malicious caller-supplied coachId must be ignored.
      coachId: 999,
      organisationId: 5,
      coachSplitPct: 70,
      orgSplitPct: 30,
    } as any);

    expect(upsertOrgAgreementMock).toHaveBeenCalledTimes(1);
    expect(upsertOrgAgreementMock.mock.calls[0][0]).toMatchObject({
      coachId: 10,
      organisationId: 5,
    });
  });

  it('an org-invite response is scoped to the caller’s own coach profile', async () => {
    await activitiesService.respondToOrgInvite(1, 77, true);
    expect(respondToOrgInviteMock).toHaveBeenCalledWith(10, 77, true);
  });

  it('cannot respond to another coach’s invite (0 affected rows → 404)', async () => {
    respondToOrgInviteMock.mockResolvedValue(0);
    await expect(activitiesService.respondToOrgInvite(1, 88, true))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  // ── C3 — public coach detail strips commercial terms + account email ─────
  it('GET /coaches/:id projection removes email, hourly_rate and agreement terms', async () => {
    findCoachByIdMock.mockResolvedValue({
      id: 10,
      user_id: 1,
      status: 'approved',
      full_name: 'Coach One',
      bio: 'Padel coach',
      email: 'coach.one@example.com',
      hourly_rate: '350.00',
      currency_code: 'EGP',
    });
    findOrgAgreementsMock.mockResolvedValue([
      {
        id: 77,
        organisation_id: 5,
        organisation_name: 'Club 5',
        coach_split_pct: 70,
        org_split_pct: 30,
        hourly_rate: '400.00',
        status: 'accepted',
        initiated_by: 'org',
        is_active: 1,
      },
    ]);

    const result: any = await activitiesService.getCoachById(10);

    // Commercial values are never part of the public projection.
    expect(result.hourly_rate).toBeUndefined();
    expect(result.email).toBeUndefined();
    expect(result.agreements).toEqual([
      { id: 77, organisation_id: 5, organisation_name: 'Club 5' },
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('coach_split_pct');
    expect(serialized).not.toContain('org_split_pct');
    expect(serialized).not.toContain('400');
    expect(serialized).not.toContain('coach.one@example.com');

    // The rest of the public coach detail is preserved.
    expect(result.full_name).toBe('Coach One');
    expect(result.bio).toBe('Padel coach');
  });

  // ── Coach email privacy — public directory vs admin listing ──────────────
  it('listCoaches omits email from every public directory row', async () => {
    findCoachesMock.mockResolvedValue([
      { id: 1, full_name: 'Coach A', email: 'coach.a@example.com', hourly_rate: '100.00', is_available: 1 },
      { id: 2, full_name: 'Coach B', email: 'coach.b@example.com', hourly_rate: null, is_available: 0 },
    ]);

    const rows: any[] = await activitiesService.listCoaches({ page: 1, limit: 20 });

    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.email).toBeUndefined();
    // Other public fields (and the unchanged hourly-rate policy) are preserved.
    expect(rows[0]).toMatchObject({ id: 1, full_name: 'Coach A', hourly_rate: '100.00' });
    expect(JSON.stringify(rows)).not.toContain('@example.com');
  });

  it('admin coach listing keeps email (authorized admin flow unchanged)', async () => {
    findCoachesAdminMock.mockResolvedValue({
      data: [{ id: 1, full_name: 'Coach A', email: 'coach.a@example.com' }],
      total: 1,
      page: 1,
      limit: 20,
    });

    const result: any = await activitiesService.listCoachesAdmin(1, 20);

    expect(result.data[0].email).toBe('coach.a@example.com');
  });
});
