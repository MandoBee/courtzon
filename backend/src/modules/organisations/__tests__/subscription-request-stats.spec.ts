import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: mockExecute }),
}));
vi.mock('../../../infrastructure/redis/redis.client.js', () => ({ getRedisClient: vi.fn() }));
vi.mock('../../../infrastructure/queue/queue.service.js', () => ({ queueService: { add: vi.fn() } }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: vi.fn() } }));
vi.mock('../../../shared/command/command-pipeline.js', () => ({
  commandPipeline: { execute: vi.fn() },
}));

import { OrganisationService } from '../application/organisation.service.js';

const service = new OrganisationService();

describe('OrganisationService.getSubscriptionRequestStats', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('counts pending requests including registration-created ones (no request_type filter)', async () => {
    // First call: the aggregated request stats row.
    mockExecute.mockResolvedValueOnce([[
      {
        total: 3,
        pending_count: 1,
        approved_count: 1,
        rejected_count: 1,
        cancelled_count: 0,
        approved_today: 1,
        rejected_today: 0,
        avg_approval_hours: 2,
      },
    ], []]);
    // Second call: active subscriptions count.
    mockExecute.mockResolvedValueOnce([[{ active_subs: 4 }], []]);
    // Third call: expiring count.
    mockExecute.mockResolvedValueOnce([[{ expiring: 1 }], []]);

    const stats = await service.getSubscriptionRequestStats();

    // The stats SQL must not filter out registration requests.
    const statsSql = mockExecute.mock.calls[0][0];
    expect(String(statsSql)).toContain('FROM organisation_upgrade_requests');
    expect(String(statsSql)).not.toContain('request_type IS NOT NULL');

    expect(stats.pending).toBe(1);
    expect(stats.approvedToday).toBe(1);
    expect(stats.activeSubscriptions).toBe(4);
    expect(stats.totalRequests).toBe(3);
  });
});