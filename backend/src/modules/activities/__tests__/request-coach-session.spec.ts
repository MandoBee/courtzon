import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test', REDIS_HOST: '127.0.0.1', REDIS_PORT: 6379, REDIS_DB: 0,
    DB_HOST: '127.0.0.1', DB_PORT: 3307, DB_USER: 'root', DB_PASSWORD: 'test', DB_NAME: 'courtzon_v3',
  },
}));

let poolExecuteImpl: any = vi.fn(async (sql: string) => {
  if (String(sql).includes('FROM resources')) return [[{ id: 77, branch_id: 5, sport_id: 1 }], []];
  if (String(sql).includes('INSERT INTO coach_sessions')) return [{ insertId: 42, affectedRows: 1 }];
  return [[], []];
});

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: poolExecuteImpl,
    query: vi.fn(async () => [[], []]),
    getConnection: vi.fn(),
  }),
}));

const findCoachByIdMock = vi.fn();
const isCoachEligibleAtBranchMock = vi.fn();

vi.mock('../../activities/infrastructure/repositories/activities.repository.js', () => ({
  activitiesRepository: {
    findCoachById: (id: number) => findCoachByIdMock(id),
    isCoachEligibleAtBranch: (coachId: number, branchId: number) => isCoachEligibleAtBranchMock(coachId, branchId),
  },
}));

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { emit: vi.fn() },
}));

vi.mock('../../audit-log/index.js', () => ({
  recordAudit: vi.fn(),
}));

vi.mock('../../coaches/application/coach-session-state.service.js', () => ({
  coachSessionStateService: { logEvent: vi.fn() },
}));

vi.mock('../../activities/application/activities.service.js', () => ({
  activitiesService: {},
}));

vi.mock('../../../shared/middleware/org-access.js', () => ({
  isPlatformAdmin: vi.fn(async () => false),
}));

import { requestCoachSessionHandler } from '../presentation/activities.controller.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { recordAudit } from '../../audit-log/index.js';
import { coachSessionStateService } from '../../coaches/application/coach-session-state.service.js';

const COACH = { id: 10, user_id: 1, status: 'approved', is_available: 1, sports: [1], hourly_rate: 200, currency_code: 'EGP' };

function makeCtx(body: Record<string, unknown>) {
  const request: any = { userId: 99, body };
  const reply: any = {
    status: vi.fn(() => reply),
    send: vi.fn((x: any) => x),
  };
  return { request, reply };
}

describe('Slice-4 requestCoachSessionHandler — eligibility enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findCoachByIdMock.mockResolvedValue(COACH);
    isCoachEligibleAtBranchMock.mockResolvedValue({ eligible: true, reason: null, policy: 'contract_required', hasServiceAccess: true, hasAgreement: true });
  });

  const validBody = () => ({
    coachId: 10,
    resourceId: 77,
    startTime: '2026-09-10T10:00:00',
    endTime: '2026-09-10T11:00:00',
  });

  it('valid eligible coach → 201 and coach_sessions insert with resolved branch/resource', async () => {
    const { request, reply } = makeCtx(validBody());
    await requestCoachSessionHandler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(201);
    expect(reply.send).toHaveBeenCalledWith({ id: 42, status: 'requested' });
    const insertCall = poolExecuteImpl.mock.calls.find((c: any[]) => String(c[0]).includes('INSERT INTO coach_sessions'));
    expect(insertCall).toBeTruthy();
    // [coachId, playerId, orgId, branchId(resolved=5), resourceId(77), ...]
    const params = insertCall[1];
    expect(params[0]).toBe(10);
    expect(params[3]).toBe(5);
    expect(params[4]).toBe(77);
    expect(isCoachEligibleAtBranchMock).toHaveBeenCalledWith(10, 5);
    expect(coachSessionStateService.logEvent).toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalled();
    expect(eventBusV2.emit).toHaveBeenCalled();
  });

  it('rejects when the coach has no service access at the resolved branch (wrong service location)', async () => {
    isCoachEligibleAtBranchMock.mockResolvedValue({ eligible: false, reason: 'Coach has no service access to this branch', policy: 'contract_required', hasServiceAccess: false, hasAgreement: false });
    const { request, reply } = makeCtx(validBody());
    await requestCoachSessionHandler(request, reply);
    expect(reply.status).toHaveBeenCalledWith(403);
    const msg = (reply.send as any).mock.calls[0][0];
    expect(JSON.stringify(msg)).toMatch(/service access/i);
  });

  it('rejects a contract-required branch without a valid agreement', async () => {
    isCoachEligibleAtBranchMock.mockResolvedValue({ eligible: false, reason: 'Coach has no active agreement with this organisation (contract required)', policy: 'contract_required', hasServiceAccess: true, hasAgreement: false });
    const { request, reply } = makeCtx(validBody());
    await requestCoachSessionHandler(request, reply);
    expect(reply.status).toHaveBeenCalledWith(403);
    const msg = (reply.send as any).mock.calls[0][0];
    expect(JSON.stringify(msg)).toMatch(/agreement/i);
  });

  it('rejects a sport mismatch (coach sport != court sport)', async () => {
    findCoachByIdMock.mockResolvedValue({ ...COACH, sports: [2] });
    const { request, reply } = makeCtx(validBody());
    await requestCoachSessionHandler(request, reply);
    expect(reply.status).toHaveBeenCalledWith(403);
    const msg = (reply.send as any).mock.calls[0][0];
    expect(JSON.stringify(msg)).toMatch(/sport/i);
  });

  it('rejects an unavailable coach (is_available = 0)', async () => {
    findCoachByIdMock.mockResolvedValue({ ...COACH, is_available: 0 });
    const { request, reply } = makeCtx(validBody());
    await requestCoachSessionHandler(request, reply);
    expect(reply.status).toHaveBeenCalledWith(403);
    const msg = (reply.send as any).mock.calls[0][0];
    expect(JSON.stringify(msg)).toMatch(/not currently available/i);
  });

  it('rejects a non-approved coach', async () => {
    findCoachByIdMock.mockResolvedValue({ ...COACH, status: 'pending' });
    const { request, reply } = makeCtx(validBody());
    await requestCoachSessionHandler(request, reply);
    expect(reply.status).toHaveBeenCalledWith(404);
  });

  it('rejects a request without a resourceId (missing branch context)', async () => {
    const { resourceId: _omit, ...noResource } = validBody();
    const { request, reply } = makeCtx(noResource);
    await expect(requestCoachSessionHandler(request, reply)).rejects.toThrow();
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('rejects when the resource/court does not exist (cannot bypass via fabricated id)', async () => {
    const originalImpl = poolExecuteImpl;
    poolExecuteImpl = vi.fn(async (sql: string) => {
      if (String(sql).includes('INSERT INTO coach_sessions')) return [{ insertId: 42, affectedRows: 1 }];
      return [[], []];
    });
    try {
      const { request, reply } = makeCtx(validBody());
      await requestCoachSessionHandler(request, reply);
      expect(reply.status).toHaveBeenCalledWith(404);
      const msg = (reply.send as any).mock.calls[0][0];
      expect(JSON.stringify(msg)).toMatch(/court not found/i);
    } finally {
      poolExecuteImpl = originalImpl;
    }
  });

  it('rejects when the court has no sport configured', async () => {
    const originalImpl = poolExecuteImpl;
    poolExecuteImpl = vi.fn(async (sql: string) => {
      if (String(sql).includes('FROM resources')) return [[{ id: 77, branch_id: 5, sport_id: null }], []];
      if (String(sql).includes('INSERT INTO coach_sessions')) return [{ insertId: 42, affectedRows: 1 }];
      return [[], []];
    });
    try {
      const { request, reply } = makeCtx(validBody());
      await requestCoachSessionHandler(request, reply);
      expect(reply.status).toHaveBeenCalledWith(403);
      const msg = (reply.send as any).mock.calls[0][0];
      expect(JSON.stringify(msg)).toMatch(/no sport/i);
    } finally {
      poolExecuteImpl = originalImpl;
    }
  });
});