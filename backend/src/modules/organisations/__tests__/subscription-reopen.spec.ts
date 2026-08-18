import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute, mockBeginTransaction, mockCommit, mockRollback, mockRelease } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockBeginTransaction: vi.fn(),
  mockCommit: vi.fn(),
  mockRollback: vi.fn(),
  mockRelease: vi.fn(),
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    getConnection: vi.fn(async () => ({
      execute: mockExecute,
      beginTransaction: mockBeginTransaction,
      commit: mockCommit,
      rollback: mockRollback,
      release: mockRelease,
    })),
  }),
}));

import { reopenSubscriptionRequest } from '../infrastructure/repositories/org-portal.repository.js';

describe('reopenSubscriptionRequest', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockBeginTransaction.mockReset();
    mockCommit.mockReset();
    mockRollback.mockReset();
    mockRelease.mockReset();
  });

  it('restores rejected NEW_SUBSCRIPTION request to pending and restores the cancelled subscription', async () => {
    const REQ_ROW = {
      id: 17,
      organisation_id: 17,
      request_type: 'NEW_SUBSCRIPTION',
      requested_plan_id: 5,
      requested_by: 1,
      status: 'rejected',
    };
    const SUB_ROW = { id: 42 };

    // SELECT request FOR UPDATE (rejected)
    mockExecute.mockResolvedValueOnce([[REQ_ROW], []]);
    // UPDATE request -> pending
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // SELECT cancelled subscription
    mockExecute.mockResolvedValueOnce([[SUB_ROW], []]);
    // UPDATE subscription -> pending
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await reopenSubscriptionRequest(17, 1);

    expect(result.id).toBe(17);
    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(mockRollback).not.toHaveBeenCalled();

    // Exactly two UPDATEs: one for the request, one for the subscription.
    const updates = mockExecute.mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE'));
    expect(updates).toHaveLength(2);

    // First UPDATE: organisation_upgrade_requests -> pending
    expect(String(updates[0][0])).toContain('UPDATE organisation_upgrade_requests');
    expect(String(updates[0][0])).toContain("status = 'pending'");
    expect(updates[0][1]).toEqual([17]);

    // Second UPDATE: organisation_subscriptions -> pending
    expect(String(updates[1][0])).toContain('UPDATE organisation_subscriptions');
    expect(String(updates[1][0])).toContain("subscription_status = 'pending'");
    expect(updates[1][1]).toEqual([42]);
  });

  it('restores rejected PLAN_CHANGE request to pending without touching subscriptions', async () => {
    const REQ_ROW = {
      id: 20,
      organisation_id: 6,
      request_type: 'PLAN_CHANGE',
      requested_plan_id: null,
      requested_by: 1,
      status: 'rejected',
    };

    // SELECT request FOR UPDATE (rejected)
    mockExecute.mockResolvedValueOnce([[REQ_ROW], []]);
    // UPDATE request -> pending
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await reopenSubscriptionRequest(20, 1);

    expect(result.id).toBe(20);
    expect(mockCommit).toHaveBeenCalledTimes(1);

    // Only one UPDATE — organisation_upgrade_requests.
    const updates = mockExecute.mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE'));
    expect(updates).toHaveLength(1);
    expect(String(updates[0][0])).toContain('UPDATE organisation_upgrade_requests');

    // No write to organisation_subscriptions.
    const anySubWrite = mockExecute.mock.calls.find(([sql]) =>
      String(sql).includes('organisation_subscriptions') && String(sql).startsWith('UPDATE'));
    expect(anySubWrite).toBeUndefined();
  });

  it('rolls back and throws when the request is not rejected', async () => {
    // SELECT request FOR UPDATE (not rejected -> no rows returned for status='rejected')
    mockExecute.mockResolvedValueOnce([[], []]);

    await expect(reopenSubscriptionRequest(17, 1)).rejects.toThrow();

    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockRollback).toHaveBeenCalled();
    const updates = mockExecute.mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE'));
    expect(updates).toHaveLength(0);
  });

  it('rolls back all changes if subscription restore fails', async () => {
    const REQ_ROW = {
      id: 30,
      organisation_id: 17,
      request_type: 'NEW_SUBSCRIPTION',
      requested_plan_id: 5,
      requested_by: 1,
      status: 'rejected',
    };
    const SUB_ROW = { id: 42 };

    // SELECT request FOR UPDATE (rejected)
    mockExecute.mockResolvedValueOnce([[REQ_ROW], []]);
    // UPDATE request -> pending
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // SELECT cancelled subscription
    mockExecute.mockResolvedValueOnce([[SUB_ROW], []]);
    // UPDATE subscription -> throws
    mockExecute.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(reopenSubscriptionRequest(30, 1)).rejects.toThrow('DB connection lost');

    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockRollback).toHaveBeenCalled();
  });
});
