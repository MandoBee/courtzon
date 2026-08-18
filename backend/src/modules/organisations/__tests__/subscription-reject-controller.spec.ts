import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRecordAudit, mockEmit, mockReject, mockClearCache } = vi.hoisted(() => ({
  mockRecordAudit: vi.fn(async () => undefined),
  mockEmit: vi.fn(),
  mockReject: vi.fn(),
  mockClearCache: vi.fn(),
}));

vi.mock('../../audit-log/index.js', () => ({ recordAudit: mockRecordAudit }));
vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBus: { emit: mockEmit },
  eventBusV2: { emit: mockEmit },
}));
vi.mock('../application/organisation.service.js', () => ({
  organisationService: { rejectSubscriptionRequest: mockReject },
}));
vi.mock('../application/current-subscription.service.js', () => ({
  clearSubscriptionCache: mockClearCache,
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

// The DTO module is side-effect-free (zod schemas), so import it normally.
import { rejectSubscriptionRequestHandler } from '../presentation/organisation.controller.js';

function makeReqReply() {
  const reply = { send: vi.fn() };
  const request = {
    params: { requestId: '17' },
    body: { reason: 'Test rejection' },
    userId: 1,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test' },
  };
  return { request: request as any, reply: reply as any };
}

describe('rejectSubscriptionRequestHandler — single authoritative audit + single event + cache clear', () => {
  beforeEach(() => {
    mockRecordAudit.mockReset();
    mockEmit.mockReset();
    mockReject.mockReset();
    mockClearCache.mockReset();
    mockReject.mockResolvedValue({
      id: 17,
      organisation_id: 6,
      requested_by: 1,
      request_type: 'PLAN_CHANGE',
      requested_plan_name: 'Elite Club',
    });
  });

  it('records exactly one SUBSCRIPTION_REQUEST.REJECT audit, emits event once, clears cache, and never records SUBSCRIPTION.REJECTED', async () => {
    const { request, reply } = makeReqReply();
    await rejectSubscriptionRequestHandler(request, reply);

    // Exactly ONE audit call, action SUBSCRIPTION_REQUEST.REJECT.
    expect(mockRecordAudit).toHaveBeenCalledTimes(1);
    const auditEntry = mockRecordAudit.mock.calls[0][0];
    expect(auditEntry.action).toBe('SUBSCRIPTION_REQUEST.REJECT');
    expect(auditEntry.entityType).toBe('organisation_upgrade_request');
    expect(auditEntry.entityId).toBe(17);
    expect(auditEntry.actorId).toBe(1);

    // No SUBSCRIPTION.REJECTED audit is ever recorded.
    const rejectedAudits = mockRecordAudit.mock.calls.filter(
      ([entry]) => entry.action === 'SUBSCRIPTION.REJECTED',
    );
    expect(rejectedAudits).toHaveLength(0);

    // subscription:request-rejected emitted exactly once.
    const rejectEmits = mockEmit.mock.calls.filter(([name]) => name === 'subscription:request-rejected');
    expect(rejectEmits).toHaveLength(1);
    expect(rejectEmits[0][1].requestId).toBe(17);
    expect(rejectEmits[0][1].reason).toBe('Test rejection');
    expect(rejectEmits[0][1].rejectedBy).toBe(1);

    // Subscription cache must be cleared after rejection.
    expect(mockClearCache).toHaveBeenCalledTimes(1);

    expect(reply.send).toHaveBeenCalledWith({ success: true });
  });
});
