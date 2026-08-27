import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn() }));
vi.mock('../../../shared/utils/pagination.js', () => ({
  buildPagination: vi.fn((page, limit) => ({ page, limit })),
  paginationClause: vi.fn(() => ' LIMIT 20 OFFSET 0'),
}));

import { getPool } from '../../../database/mysql.js';
import { unifiedSettlementRepository } from '../infrastructure/repositories/unified-settlement.repository.js';
import { buildPagination } from '../../../shared/utils/pagination.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Unified settlement repository — org isolation', () => {
  it('empty orgIds short-circuits to an empty result (no tenant leak)', async () => {
    (buildPagination as any).mockReturnValue({ page: 1, limit: 20 });
    const res = await unifiedSettlementRepository.findSettlements({ orgIds: [], page: 1, limit: 20 });

    expect(res).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    expect(getPool).not.toHaveBeenCalled();
  });

  it('orgIds filter is translated to an IN clause on organisation_id', async () => {
    const pool = { execute: vi.fn().mockResolvedValue([[{ total: 2 }]]) };
    (getPool as any).mockReturnValue(pool);

    await unifiedSettlementRepository.findSettlements({ orgIds: [10, 20], page: 1, limit: 20 });

    const sql = (pool.execute as any).mock.calls[1][0] as string;
    const params = (pool.execute as any).mock.calls[1][1];
    expect(sql).toContain('s.organisation_id IN (?,?)');
    expect(params).toEqual([10, 20]);
  });

  it('single orgId filter uses an equality condition', async () => {
    const pool = { execute: vi.fn().mockResolvedValue([[{ total: 1 }]]) };
    (getPool as any).mockReturnValue(pool);

    await unifiedSettlementRepository.findSettlements({ orgId: 7, page: 1, limit: 20 });

    const sql = (pool.execute as any).mock.calls[1][0] as string;
    const params = (pool.execute as any).mock.calls[1][1];
    expect(sql).toContain('s.organisation_id = ?');
    expect(params).toEqual([7]);
  });
});