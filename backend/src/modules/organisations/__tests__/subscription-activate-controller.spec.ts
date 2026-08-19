import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockActivate } = vi.hoisted(() => ({
  mockActivate: vi.fn(),
}));

vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBus: { emit: vi.fn() },
  eventBusV2: { emit: vi.fn() },
}));
vi.mock('../application/organisation.service.js', () => ({
  organisationService: { activatePendingSubscriptionForOrg: mockActivate },
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

import { activatePendingSubscriptionHandler } from '../presentation/organisation.controller.js';

function makeReqReply(overrides: Record<string, unknown> = {}) {
  const statusFn = vi.fn().mockReturnThis();
  const reply = { send: vi.fn(), status: statusFn };
  const request = {
    params: { orgId: '18' },
    userId: 1,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test' },
    ...overrides,
  };
  return { request: request as any, reply: reply as any };
}

describe('activatePendingSubscriptionHandler', () => {
  beforeEach(() => {
    mockActivate.mockReset();
  });

  it('returns success when activation succeeds', async () => {
    mockActivate.mockResolvedValue({ activated: true, startDate: '2026-08-19', endDate: '2026-09-19' });
    const { request, reply } = makeReqReply();

    await activatePendingSubscriptionHandler(request, reply);

    expect(mockActivate).toHaveBeenCalledWith(18, 1);
    expect(reply.send).toHaveBeenCalledWith({ success: true });
  });

  it('returns 422 when activation is blocked (org not verified)', async () => {
    mockActivate.mockResolvedValue({
      activated: false,
      deferred: 'org-inactive',
      reason: 'Organisation must be active and verified before a paid subscription can activate',
    });
    const { request, reply } = makeReqReply();

    await activatePendingSubscriptionHandler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(422);
    expect(reply.send).toHaveBeenCalledWith({
      success: false,
      code: 'ORG-INACTIVE',
      message: 'Organisation must be active and verified before a paid subscription can activate',
    });
  });

  it('returns success when already processed (idempotent)', async () => {
    mockActivate.mockResolvedValue({
      activated: false,
      alreadyProcessed: true,
      reason: 'Request already approved',
    });
    const { request, reply } = makeReqReply();

    await activatePendingSubscriptionHandler(request, reply);

    expect(reply.send).toHaveBeenCalledWith({ success: true, alreadyProcessed: true });
  });

  it('returns 422 when payment is not confirmed', async () => {
    mockActivate.mockResolvedValue({
      activated: false,
      deferred: 'payment',
      reason: 'Payment not confirmed',
    });
    const { request, reply } = makeReqReply();

    await activatePendingSubscriptionHandler(request, reply);

    expect(reply.status).toHaveBeenCalledWith(422);
    expect(reply.send).toHaveBeenCalledWith({
      success: false,
      code: 'PAYMENT',
      message: 'Payment not confirmed',
    });
  });
});
