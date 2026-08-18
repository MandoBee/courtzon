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

import { rejectSubscriptionRequest } from '../infrastructure/repositories/org-portal.repository.js';

describe('rejectSubscriptionRequest', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockBeginTransaction.mockReset();
    mockCommit.mockReset();
    mockRollback.mockReset();
    mockRelease.mockReset();
  });

  it('cancels registration-created pending subscription when rejecting a request with a plan', async () => {
    const REQ_ROW = {
      id: 17,
      organisation_id: 17,
      request_type: 'NEW_SUBSCRIPTION',
      requested_plan_id: 5,
      requested_by: 1,
      status: 'pending',
    };

    // SELECT request FOR UPDATE (pending)
    mockExecute.mockResolvedValueOnce([[REQ_ROW], []]);
    // UPDATE request -> rejected
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // UPDATE organisation_subscriptions -> cancelled (registration-created pending sub)
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await rejectSubscriptionRequest(17, 1, 'Test rejection');

    expect(result.id).toBe(17);
    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(mockRollback).not.toHaveBeenCalled();

    // Exactly two UPDATEs: one for the request, one for the subscription.
    const updates = mockExecute.mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE'));
    expect(updates).toHaveLength(2);

    // First UPDATE: organisation_upgrade_requests -> rejected
    expect(String(updates[0][0])).toContain('UPDATE organisation_upgrade_requests');
    expect(String(updates[0][0])).toContain("status = 'rejected'");
    expect(updates[0][1]).toEqual([1, 'Test rejection', 17]);

    // Second UPDATE: organisation_subscriptions -> cancelled (only pending, start_date IS NULL)
    expect(String(updates[1][0])).toContain('UPDATE organisation_subscriptions');
    expect(String(updates[1][0])).toContain("subscription_status = 'cancelled'");
    expect(String(updates[1][0])).toContain('start_date IS NULL');
    expect(updates[1][1]).toEqual([17, 5]);
  });

  it('does not touch organisation_subscriptions when request has no requested_plan_id', async () => {
    const REQ_ROW = {
      id: 20,
      organisation_id: 6,
      request_type: 'PLAN_CHANGE',
      requested_plan_id: null,
      requested_by: 1,
      status: 'pending',
    };

    // SELECT request FOR UPDATE (pending)
    mockExecute.mockResolvedValueOnce([[REQ_ROW], []]);
    // UPDATE request -> rejected
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await rejectSubscriptionRequest(20, 1, 'Test rejection');

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

  it('does not touch an existing active subscription when rejecting a PLAN_CHANGE request', async () => {
    const REQ_ROW = {
      id: 25,
      organisation_id: 17,
      request_type: 'PLAN_CHANGE',
      requested_plan_id: 3,
      requested_by: 1,
      status: 'pending',
    };

    // SELECT request FOR UPDATE (pending)
    mockExecute.mockResolvedValueOnce([[REQ_ROW], []]);
    // UPDATE request -> rejected
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // UPDATE organisation_subscriptions -> 0 affected (no matching pending sub with start_date IS NULL)
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }, []]);

    const result = await rejectSubscriptionRequest(25, 1, 'Change request rejected');

    expect(result.id).toBe(25);
    expect(mockCommit).toHaveBeenCalledTimes(1);

    // Two UPDATEs: the request + a subscription update that matched 0 rows
    const updates = mockExecute.mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE'));
    expect(updates).toHaveLength(2);
    expect(String(updates[1][0])).toContain('UPDATE organisation_subscriptions');
    expect(String(updates[1][0])).toContain("subscription_status = 'cancelled'");
    // The 0 affectedRows means no active subscription was touched — only pending+start_date IS NULL matched
  });

  it('rolls back and throws when the request is not pending', async () => {
    // SELECT request FOR UPDATE (already rejected -> no rows returned for status='pending')
    mockExecute.mockResolvedValueOnce([[], []]);

    await expect(rejectSubscriptionRequest(17, 1, 'reason')).rejects.toThrow();

    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockRollback).toHaveBeenCalled();
    // No UPDATE was issued at all.
    const updates = mockExecute.mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE'));
    expect(updates).toHaveLength(0);
  });

  it('rolls back all changes if subscription cancel fails', async () => {
    const REQ_ROW = {
      id: 30,
      organisation_id: 17,
      request_type: 'NEW_SUBSCRIPTION',
      requested_plan_id: 5,
      requested_by: 1,
      status: 'pending',
    };

    // SELECT request FOR UPDATE (pending)
    mockExecute.mockResolvedValueOnce([[REQ_ROW], []]);
    // UPDATE request -> rejected
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // UPDATE organisation_subscriptions -> throws
    mockExecute.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(rejectSubscriptionRequest(30, 1, 'reason')).rejects.toThrow('DB connection lost');

    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockRollback).toHaveBeenCalled();
  });
});
