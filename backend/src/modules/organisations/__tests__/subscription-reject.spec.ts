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

describe('rejectSubscriptionRequest — single durable transition on the request only', () => {
  const REQ_ROW = {
    id: 17,
    organisation_id: 6,
    request_type: 'PLAN_CHANGE',
    requested_by: 1,
    status: 'pending',
  };

  beforeEach(() => {
    mockExecute.mockReset();
    mockBeginTransaction.mockReset();
    mockCommit.mockReset();
    mockRollback.mockReset();
    mockRelease.mockReset();
  });

  it('updates only organisation_upgrade_requests and never touches organisation_subscriptions', async () => {
    // SELECT request FOR UPDATE (pending)
    mockExecute.mockResolvedValueOnce([[REQ_ROW], []]);
    // UPDATE request -> rejected
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await rejectSubscriptionRequest(17, 1, 'Test rejection');

    expect(result.id).toBe(17);
    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(mockRollback).not.toHaveBeenCalled();

    // Exactly one UPDATE, targeting organisation_upgrade_requests.
    const updates = mockExecute.mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE'));
    expect(updates).toHaveLength(1);
    expect(String(updates[0][0])).toContain('UPDATE organisation_upgrade_requests');
    expect(String(updates[0][0])).toContain("status = 'rejected'");
    expect(updates[0][1]).toEqual([1, 'Test rejection', 17]);

    // No write ever targets organisation_subscriptions during rejection.
    const anySubWrite = mockExecute.mock.calls.find(([sql]) =>
      String(sql).includes('organisation_subscriptions') && String(sql).startsWith('UPDATE'));
    expect(anySubWrite).toBeUndefined();
  });

  it('rolls back and throws when the request is not pending (failed rejection -> no audit-relevant write)', async () => {
    // SELECT request FOR UPDATE (already rejected -> no rows returned for status='pending')
    mockExecute.mockResolvedValueOnce([[], []]);

    await expect(rejectSubscriptionRequest(17, 1, 'reason')).rejects.toThrow();

    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockRollback).toHaveBeenCalled();
    // No UPDATE was issued at all.
    const updates = mockExecute.mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE'));
    expect(updates).toHaveLength(0);
  });
});