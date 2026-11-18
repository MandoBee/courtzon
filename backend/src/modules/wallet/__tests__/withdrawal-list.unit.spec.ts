import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * UR-02 / W1-F-009 regression (unit level).
 *
 * The admin withdrawal list used to pass LIMIT/OFFSET to pool.query() as
 * strings. mysql2's text protocol renders those as quoted literals
 * (`LIMIT '20' OFFSET '0'`), which MySQL rejects with ER_PARSE_ERROR 1064 and
 * Fastify surfaces as a 500. These tests lock in numeric placeholders and
 * consistent count/data joins without needing a database.
 */
const { query, execute } = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => ({ query, execute }) }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: vi.fn() } }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: {} }));
vi.mock('../../player-experience/infrastructure/repositories/player-profile.repository.js', () => ({ playerProfileRepository: {} }));

import { withdrawalService } from '../application/withdrawal.service.js';

describe('withdrawalService.list — UR-02 regression', () => {
  beforeEach(() => {
    query.mockReset();
    execute.mockReset();
    execute.mockResolvedValue([[{ total: 0 }], []]);
    query.mockResolvedValue([[], []]);
  });

  it('passes numeric LIMIT/OFFSET values to the text-protocol query', async () => {
    await withdrawalService.list({ page: 1, limit: 20 });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('LIMIT ? OFFSET ?');
    expect(params.slice(-2)).toEqual([20, 0]);
    expect(params.slice(-2).every((value: unknown) => typeof value === 'number')).toBe(true);
  });

  it('computes the offset for later pages and clamps the page size', async () => {
    await withdrawalService.list({ page: 3, limit: 10 });
    expect(query.mock.calls[0][1].slice(-2)).toEqual([10, 20]);

    await withdrawalService.list({ page: 1, limit: 9999 });
    expect(query.mock.calls.at(-1)![1].slice(-2)).toEqual([100, 0]);

    await withdrawalService.list({ page: -5, limit: 0 });
    expect(query.mock.calls.at(-1)![1].slice(-2)).toEqual([20, 0]);
  });

  it('uses identical joins in the count and data queries', async () => {
    await withdrawalService.list({});

    const [countSql] = execute.mock.calls[0];
    const [dataSql] = query.mock.calls[0];
    expect(countSql).toContain('JOIN user_wallets uw');
    expect(countSql).toContain('LEFT JOIN users assigned');
    expect(dataSql).toContain('JOIN user_wallets uw');
    expect(dataSql).toContain('LEFT JOIN users assigned');
  });

  it('keeps search predicates and parameters aligned across both queries', async () => {
    await withdrawalService.list({ search: 'qa' });

    expect(execute.mock.calls[0][0]).toContain('u.full_name LIKE ?');
    expect(execute.mock.calls[0][1]).toEqual(['%qa%', '%qa%', '%qa%']);
    expect(query.mock.calls[0][1].slice(0, 3)).toEqual(['%qa%', '%qa%', '%qa%']);
    expect(query.mock.calls[0][1].slice(-2)).toEqual([20, 0]);
  });
});
