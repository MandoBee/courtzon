import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: mockExecute }),
}));
vi.mock('../../../shared/utils/pagination.js', () => ({
  buildPagination: (page = 1, limit = 20) => ({ page, limit }),
  paginationClause: () => ' LIMIT 20 OFFSET 0',
}));

import { listSubscriptionRequests, getOrgPendingSubscriptionRequest } from '../infrastructure/repositories/org-portal.repository.js';

describe('Subscription request list queries', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('does NOT filter out registration-created requests (request_type IS NULL)', async () => {
    mockExecute
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{ id: 1, status: 'pending', request_type: null }], []]);

    await listSubscriptionRequests({ status: 'pending' });

    const listSql = mockExecute.mock.calls.find(([sql]) => String(sql).includes('SELECT COUNT(*)'));
    expect(listSql).toBeDefined();
    expect(String(listSql[0])).not.toContain('request_type IS NOT NULL');
  });

  it('returns all requests when status is "all"', async () => {
    mockExecute
      .mockResolvedValueOnce([[{ total: 2 }], []])
      .mockResolvedValueOnce([[{ id: 1, status: 'pending' }, { id: 2, status: 'approved' }], []]);

    await listSubscriptionRequests({ status: 'all' });

    const listSql = mockExecute.mock.calls.find(([sql]) => String(sql).includes('SELECT COUNT(*)'));
    expect(String(listSql[0])).not.toContain('our.status = ?');
  });

  it('applies the orgId filter when provided', async () => {
    mockExecute
      .mockResolvedValueOnce([[{ total: 1 }], []])
      .mockResolvedValueOnce([[{ id: 1, organisation_id: 42, status: 'pending' }], []]);

    await listSubscriptionRequests({ status: 'pending', orgId: 42 });

    const listSql = mockExecute.mock.calls.find(([sql]) => String(sql).includes('SELECT COUNT(*)'));
    expect(String(listSql[0])).toContain('our.organisation_id = ?');
    expect(listSql[1]).toEqual([42, 'pending']);
  });

  it('getOrgPendingSubscriptionRequest includes registration-created pending requests', async () => {
    mockExecute.mockResolvedValueOnce([[{ id: 7, organisation_id: 42, status: 'pending', request_type: null }], []]);

    const result = await getOrgPendingSubscriptionRequest(42);

    const sql = mockExecute.mock.calls[0][0];
    expect(String(sql)).toContain("status = 'pending'");
    expect(String(sql)).not.toContain('request_type IS NOT NULL');
    expect(result?.id).toBe(7);
  });
});