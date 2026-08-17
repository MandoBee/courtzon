import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: mockExecute }),
}));

import { transactionRepository } from '../infrastructure/transaction.repository.js';

describe('transactionRepository.createTransaction (subscription source)', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('persists a subscription transaction with the subscription source_type', async () => {
    mockExecute.mockResolvedValueOnce([{ insertId: 109 }, []]);

    const id = await transactionRepository.createTransaction({
      type: 'subscription',
      sourceType: 'organisation_upgrade_request',
      sourceId: 6,
      totalAmount: 100,
      status: 'completed',
      metadata: { organisationId: 6, requestType: 'NEW_SUBSCRIPTION' },
    });

    expect(id).toBe(109);
    const [sql, params] = mockExecute.mock.calls[0];
    expect(String(sql)).toContain('INSERT INTO transactions');
    expect(params[0]).toBe('subscription');
    expect(params[1]).toBe('organisation_upgrade_request');
    expect(params[2]).toBe(6);
  });
});