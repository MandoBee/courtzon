import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockApprove } = vi.hoisted(() => ({
  mockApprove: vi.fn(),
}));

vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBus: { emit: vi.fn() },
  eventBusV2: { emit: vi.fn() },
}));
vi.mock('../application/organisation.service.js', () => ({
  organisationService: { approveSubscriptionRequest: mockApprove },
}));
vi.mock('../../rbac/application/user-country-scope.js', () => ({
  getUserCountryScope: vi.fn(async () => ({ countryId: null })),
}));
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: vi.fn() }),
}));
vi.mock('../../../infrastructure/redis/redis.client.js', () => ({ getRedisClient: vi.fn() }));
vi.mock('../../../infrastructure/queue/queue.service.js', () => ({ queueService: { add: vi.fn() } }));
vi.mock('../../../shared/command/command-pipeline.js', () => ({ commandPipeline: { execute: vi.fn() } }));

import { approveSubscriptionRequestHandler } from '../presentation/organisation.controller.js';

function makeReqReply(overrides: Record<string, unknown> = {}) {
  const statusFn = vi.fn().mockReturnThis();
  const reply = { send: vi.fn(), status: statusFn };
  const request = {
    params: { requestId: '10' },
    userId: 1,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test' },
    ...overrides,
  };
  return { request: request as any, reply: reply as any };
}

describe('approveSubscriptionRequestHandler — tolerates missing request body', () => {
  beforeEach(() => {
    mockApprove.mockReset();
  });

  it('does NOT throw when request.body is undefined (frontend sends no body)', async () => {
    mockApprove.mockResolvedValue({ id: 10, organisation_id: 17, activated: true, startDate: '2026-08-19', endDate: '2026-09-19' });
    const { request, reply } = makeReqReply({ body: undefined });

    await expect(approveSubscriptionRequestHandler(request, reply)).resolves.not.toThrow();

    expect(mockApprove).toHaveBeenCalledTimes(1);
    expect(mockApprove).toHaveBeenCalledWith(10, 1, undefined);
    expect(reply.send).toHaveBeenCalledWith({ success: true });
  });

  it('passes approvalNotes through when a body is provided', async () => {
    mockApprove.mockResolvedValue({ id: 10, organisation_id: 17, activated: true, startDate: '2026-08-19', endDate: '2026-09-19' });
    const { request, reply } = makeReqReply({ body: { approvalNotes: 'admin approved' } });

    await approveSubscriptionRequestHandler(request, reply);

    expect(mockApprove).toHaveBeenCalledWith(10, 1, 'admin approved');
    expect(reply.send).toHaveBeenCalledWith({ success: true });
  });

  it('returns 422 when activation is blocked (org not active)', async () => {
    mockApprove.mockResolvedValue({
      id: 10,
      organisation_id: 17,
      activated: false,
      deferred: 'org-inactive',
      reason: 'Organisation must be active before a subscription can activate',
    });
    const { request, reply } = makeReqReply({ body: undefined });

    await approveSubscriptionRequestHandler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(422);
    expect(reply.send).toHaveBeenCalledWith({
      success: false,
      code: 'ORG-INACTIVE',
      message: 'Organisation must be active before a subscription can activate',
    });
  });

  it('returns success when already processed (idempotent)', async () => {
    mockApprove.mockResolvedValue({
      id: 10,
      organisation_id: 17,
      activated: false,
      alreadyProcessed: true,
      reason: 'Request already approved',
    });
    const { request, reply } = makeReqReply({ body: undefined });

    await approveSubscriptionRequestHandler(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ success: true, alreadyProcessed: true });
  });
});
