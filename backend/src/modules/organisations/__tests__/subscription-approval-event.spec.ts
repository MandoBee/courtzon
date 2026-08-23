import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute, mockBeginTransaction, mockCommit, mockRollback, mockRelease, mockEmit, mockRecordAudit } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockBeginTransaction: vi.fn(),
  mockCommit: vi.fn(),
  mockRollback: vi.fn(),
  mockRelease: vi.fn(),
  mockEmit: vi.fn(),
  mockRecordAudit: vi.fn(async () => undefined),
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
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: mockEmit } }));
vi.mock('../../financial/infrastructure/transaction.repository.js', () => ({
  transactionRepository: { createTransaction: vi.fn(async () => 1) },
}));
// Cash activations post through the canonical engine — keep the real listener
// (and its queue/redis imports) out of unit tests.
vi.mock('../../financial/application/accounting-event.listener.js', () => ({
  postAccountingEvent: vi.fn(async () => undefined),
}));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: mockRecordAudit }));
vi.mock('./current-subscription.service.js', () => ({ clearSubscriptionCache: vi.fn() }));

import { tryActivateSubscriptionRequest } from '../application/subscription-activation.service.js';

const REQ = {
  id: 7,
  organisation_id: 6,
  registration_type: 'upgrade',
  request_type: 'PLAN_CHANGE',
  requested_by: 1,
  requested_plan_id: 1,
  current_plan_id: 2,
  requested_plan_name: 'Elite Club',
  current_plan_name: 'Standard Club',
  requested_price: 100,
  requested_billing_cycle: 'monthly',
  chosen_payment_method: 'cash',
  status: 'pending',
};

describe('tryActivateSubscriptionRequest — exactly one subscription:request-approved emission', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockBeginTransaction.mockReset();
    mockCommit.mockReset();
    mockRollback.mockReset();
    mockRelease.mockReset();
    mockEmit.mockReset();
    mockRecordAudit.mockReset();
  });

  it('emits subscription:request-approved exactly once on a successful paid approval', async () => {
    // 1. SELECT request FOR UPDATE
    mockExecute.mockResolvedValueOnce([[REQ], []]);
    // 2. SELECT org FOR UPDATE (active + verified)
    mockExecute.mockResolvedValueOnce([[{ id: 6, is_verified: 1, is_active: 1, deleted_at: null }], []]);
    // 3. SELECT plan (still active)
    mockExecute.mockResolvedValueOnce([[{ id: 1, is_active: 1 }], []]);
    // 4. SELECT conflicting pending request -> none
    mockExecute.mockResolvedValueOnce([[], []]);
    // 5. buildPlanSnapshot: SELECT sp.* + features
    mockExecute.mockResolvedValueOnce([[{ id: 1, plan_name: 'Elite Club', price_monthly: 100, price_yearly: 1000, is_unlimited: 0, _features: null }], []]);
    // 6. buildPlanSnapshot: SELECT rates
    mockExecute.mockResolvedValueOnce([[], []]);
    // 7. writeActiveSubscription: SELECT existing subscription
    mockExecute.mockResolvedValueOnce([[{ id: 5, start_date: '2026-07-01', end_date: '2026-08-01' }], []]);
    // 8. writeActiveSubscription: UPDATE existing -> active
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // 9. UPDATE request -> approved
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // 10. createTransaction (paid) -> insertId
    mockExecute.mockResolvedValueOnce([{ insertId: 110 }, []]);

    const result = await tryActivateSubscriptionRequest(7, { adminId: 1 });

    expect(result.activated).toBe(true);
    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(mockRollback).not.toHaveBeenCalled();

    // Exactly ONE emission of subscription:request-approved.
    const approvedEmits = mockEmit.mock.calls.filter(([name]) => name === 'subscription:request-approved');
    expect(approvedEmits).toHaveLength(1);

    // Payload contains the identifiers consumed by existing subscribers.
    const payload = approvedEmits[0][1];
    expect(payload.organisationId).toBe(6);
    expect(payload.userId).toBe(1);
    expect(payload.requestId).toBe(7);
    expect(payload.requestType).toBe('PLAN_CHANGE');
    expect(payload.requestedPlanName).toBe('Elite Club');
    expect(payload.approvedBy).toBe(1);

    // Exactly ONE authoritative audit record for the approval (SUBSCRIPTION.REQUEST.APPROVED).
    const approvalAudits = mockRecordAudit.mock.calls.filter(
      ([entry]) => entry.action === 'SUBSCRIPTION.REQUEST.APPROVED',
    );
    expect(approvalAudits).toHaveLength(1);
    const auditEntry = approvalAudits[0][0];
    expect(auditEntry.actorId).toBe(1);
    expect(auditEntry.entityType).toBe('organisation_upgrade_request');
    expect(auditEntry.entityId).toBe(7);
    expect(auditEntry.afterState.organisationId).toBe(6);
  });

  it('does not emit subscription:request-approved when approval is deferred (org inactive)', async () => {
    // 1. SELECT request FOR UPDATE
    mockExecute.mockResolvedValueOnce([[REQ], []]);
    // 2. SELECT org FOR UPDATE (NOT active -> paid gate fails)
    mockExecute.mockResolvedValueOnce([[{ id: 6, is_verified: 0, is_active: 0, deleted_at: null }], []]);
    // 3. SELECT plan
    mockExecute.mockResolvedValueOnce([[{ id: 1, is_active: 1 }], []]);
    // 4. SELECT conflicting pending request -> none
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await tryActivateSubscriptionRequest(7, { adminId: 1 });

    expect(result.activated).toBe(false);
    expect(result.deferred).toBe('org-inactive');
    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockRollback).toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
    // No approval audit should be recorded for a deferred (non-successful) approval.
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });
});