import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute, mockBeginTransaction, mockCommit, mockRollback, mockRelease, mockEmit, mockRecordAudit, mockPostAccountingEvent, mockHasPosting } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockBeginTransaction: vi.fn(),
  mockCommit: vi.fn(),
  mockRollback: vi.fn(),
  mockRelease: vi.fn(),
  mockEmit: vi.fn(),
  mockRecordAudit: vi.fn(async () => undefined),
  mockPostAccountingEvent: vi.fn(async () => undefined),
  mockHasPosting: vi.fn(async () => false),
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
vi.mock('../../financial/infrastructure/repositories/ledger.repository.js', () => ({
  ledgerRepository: { hasPosting: mockHasPosting },
}));
vi.mock('../../financial/infrastructure/transaction.repository.js', () => ({
  transactionRepository: { createTransaction: vi.fn(async () => 1) },
}));
// The canonical accounting engine — mocked so we assert the exact posting contract.
vi.mock('../../financial/application/accounting-event.listener.js', () => ({
  postAccountingEvent: mockPostAccountingEvent,
}));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: mockRecordAudit }));
vi.mock('./current-subscription.service.js', () => ({ clearSubscriptionCache: vi.fn() }));

import { tryActivateSubscriptionRequest } from '../application/subscription-activation.service.js';

const CASH_REGISTRATION_REQ = {
  id: 7,
  organisation_id: 6,
  registration_type: 'organization',
  request_type: null,
  requested_by: 3,
  requested_org_type_id: 1,
  requested_plan_id: 1,
  current_plan_id: null,
  requested_plan_name: 'Elite Club',
  current_plan_name: null,
  requested_price: 500,
  requested_billing_cycle: 'monthly',
  chosen_payment_method: 'cash',
  status: 'pending',
};

/** Queue the mock execute results for a full successful activation of CASH_REGISTRATION_REQ. */
function queueSuccessfulCashActivation(orgRow?: Record<string, unknown>) {
  // 1. SELECT request FOR UPDATE
  mockExecute.mockResolvedValueOnce([[CASH_REGISTRATION_REQ], []]);
  // 2. SELECT org FOR UPDATE (born inactive/unverified at self-registration)
  mockExecute.mockResolvedValueOnce([[
    orgRow ?? { id: 6, name: 'Padel Edge', owner_id: 3, is_verified: 0, is_active: 0, deleted_at: null },
  ], []]);
  // 3. SELECT plan (still active)
  mockExecute.mockResolvedValueOnce([[{ id: 1, is_active: 1 }], []]);
  // 4. SELECT conflicting pending request -> none
  mockExecute.mockResolvedValueOnce([[], []]);
  // 5. buildPlanSnapshot: plan + features
  mockExecute.mockResolvedValueOnce([[{ id: 1, plan_name: 'Elite Club', price_monthly: 500, price_yearly: 5000, is_unlimited: 0, _features: null }], []]);
  // 6. buildPlanSnapshot: rates
  mockExecute.mockResolvedValueOnce([[], []]);
  // 7. writeActiveSubscription: existing pending subscription row
  mockExecute.mockResolvedValueOnce([[{ id: 5, start_date: null, end_date: null }], []]);
  // 8. UPDATE subscription -> active
  mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
  // 9. UPDATE request -> approved
  mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
  // 10. UPDATE organisations SET is_verified/is_active TRUE
  mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
}

describe('cash subscription activation — organisation + accounting consistency', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockBeginTransaction.mockReset();
    mockCommit.mockReset();
    mockRollback.mockReset();
    mockRelease.mockReset();
    mockEmit.mockReset();
    mockRecordAudit.mockReset();
    mockPostAccountingEvent.mockClear();
    mockHasPosting.mockReset().mockResolvedValue(false);
  });

  it('approving a pending Cash subscription activates the subscription AND the organisation', async () => {
    queueSuccessfulCashActivation();

    const result = await tryActivateSubscriptionRequest(7, { adminId: 1 });

    expect(result.activated).toBe(true);
    expect(result.organisationActivated).toBe(true);
    expect(mockCommit).toHaveBeenCalledTimes(1);

    // Organisation flipped to verified + active inside the transaction
    const orgUpdate = mockExecute.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE organisations SET is_verified = TRUE, is_active = TRUE'),
    );
    expect(orgUpdate).toBeDefined();
    expect(orgUpdate![1]).toEqual([6]);

    // Subscription written active by the single authoritative writer
    const subUpdate = mockExecute.mock.calls.find(([sql]) =>
      String(sql).includes("subscription_status = 'active'"),
    );
    expect(subUpdate).toBeDefined();
  });

  it('creates exactly one cash accounting entry for the exact subscription price', async () => {
    queueSuccessfulCashActivation();

    await tryActivateSubscriptionRequest(7, { adminId: 1 });

    expect(mockPostAccountingEvent).toHaveBeenCalledTimes(1);
    const [eventType, sourceType, sourceId, organisationId, concepts, currency] = mockPostAccountingEvent.mock.calls[0];
    expect(eventType).toBe('subscription_cash_payment');
    expect(sourceType).toBe('subscription');
    expect(sourceId).toBe(7);
    expect(organisationId).toBeNull();
    expect(concepts).toEqual({ cash_bank: 500, revenue: 500 });
    expect(currency).toBe('EGP');
    // Posting participates in the activation transaction (atomic)
    expect(mockPostAccountingEvent.mock.calls[0][6]).toBeDefined();
  });

  it('emits subscription:request-approved and organisation:approved exactly once each', async () => {
    queueSuccessfulCashActivation();

    await tryActivateSubscriptionRequest(7, { adminId: 1 });

    const approvedEmits = mockEmit.mock.calls.filter(([n]) => n === 'subscription:request-approved');
    const orgApprovedEmits = mockEmit.mock.calls.filter(([n]) => n === 'organisation:approved');
    expect(approvedEmits).toHaveLength(1);
    expect(orgApprovedEmits).toHaveLength(1);
    expect(orgApprovedEmits[0][1]).toMatchObject({ organisationId: 6, name: 'Padel Edge', userId: 3 });
  });

  it('already-approved request with an EXISTING cash posting: pure idempotent skip, no back-fill', async () => {
    // 1. SELECT request FOR UPDATE -> already approved
    mockExecute.mockResolvedValueOnce([[{ ...CASH_REGISTRATION_REQ, status: 'approved' }], []]);
    // hasPosting: the ledger entry already exists
    mockHasPosting.mockResolvedValueOnce(true);

    const result = await tryActivateSubscriptionRequest(7, { adminId: 1 });

    expect(result.activated).toBe(false);
    expect(result.alreadyProcessed).toBe(true);
    expect(result.accountingBackfilled).toBeUndefined();
    expect(mockRollback).toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockPostAccountingEvent).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it('legacy already-approved request MISSING its cash posting: back-fills exactly once through the canonical engine', async () => {
    // Regression: request #26 was activated before atomic cash accounting existed —
    // re-approval must heal the missing ledger entry instead of silently skipping.
    mockExecute.mockResolvedValueOnce([[{ ...CASH_REGISTRATION_REQ, status: 'approved' }], []]);
    mockHasPosting.mockResolvedValueOnce(false);

    const result = await tryActivateSubscriptionRequest(7, { adminId: 1 });

    expect(result.activated).toBe(false);
    expect(result.alreadyProcessed).toBe(true);
    expect(result.accountingBackfilled).toBe(true);
    expect(mockHasPosting).toHaveBeenCalledWith('subscription', 7, 'subscription_cash_payment');
    expect(mockPostAccountingEvent).toHaveBeenCalledTimes(1);
    const [eventType, sourceType, sourceId, organisationId, concepts] = mockPostAccountingEvent.mock.calls[0];
    expect(eventType).toBe('subscription_cash_payment');
    expect(sourceType).toBe('subscription');
    expect(sourceId).toBe(7);
    expect(organisationId).toBeNull();
    expect(concepts).toEqual({ cash_bank: 500, revenue: 500 });
    // Back-fill runs in its OWN transaction (original activation long gone): no outerConn passed
    expect(mockPostAccountingEvent.mock.calls[0][6]).toContain('back-fill');
    expect(mockPostAccountingEvent.mock.calls[0][7]).toBeUndefined();
    // No re-activation side effects
    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('non-registration requests on a suspended organisation still defer (org-inactive), no accounting', async () => {
    // PLAN_CHANGE on an admin-suspended org — must NOT silently reactivate it
    mockExecute.mockResolvedValueOnce([[{ ...CASH_REGISTRATION_REQ, registration_type: 'upgrade', request_type: 'PLAN_CHANGE' }], []]);
    mockExecute.mockResolvedValueOnce([[{ id: 6, name: 'Suspended Club', owner_id: 3, is_verified: 1, is_active: 0, deleted_at: null }], []]);
    mockExecute.mockResolvedValueOnce([[{ id: 1, is_active: 1 }], []]);
    mockExecute.mockResolvedValueOnce([[], []]);

    const result = await tryActivateSubscriptionRequest(7, { adminId: 1 });

    expect(result.activated).toBe(false);
    expect(result.deferred).toBe('org-inactive');
    expect(mockPostAccountingEvent).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it('card registration flow does not create a cash accounting entry (Paymob path unchanged)', async () => {
    // 1. request (card)
    mockExecute.mockResolvedValueOnce([[{ ...CASH_REGISTRATION_REQ, chosen_payment_method: 'card' }], []]);
    // 2. org born inactive — registration requests bypass the org-active gate
    mockExecute.mockResolvedValueOnce([[{ id: 6, name: 'Card Club', owner_id: 3, is_verified: 0, is_active: 0, deleted_at: null }], []]);
    // 3. plan active
    mockExecute.mockResolvedValueOnce([[{ id: 1, is_active: 1 }], []]);
    // 4. no conflict
    mockExecute.mockResolvedValueOnce([[], []]);
    // 5. payment gate: latest subscription payment_transactions row is PAID
    mockExecute.mockResolvedValueOnce([[{ id: 99, payment_status: 'paid' }], []]);
    // 6-7. snapshot
    mockExecute.mockResolvedValueOnce([[{ id: 1, plan_name: 'Elite Club', price_monthly: 500, price_yearly: 5000, is_unlimited: 0, _features: null }], []]);
    mockExecute.mockResolvedValueOnce([[], []]);
    // 8-9. subscription update, request approve
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // 10. org activation UPDATE
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);

    const result = await tryActivateSubscriptionRequest(7, { adminId: null });

    expect(result.activated).toBe(true);
    expect(result.organisationActivated).toBe(true);
    // No cash ledger posting for card flows — Paymob postings stay owned by the payment:succeeded listener
    expect(mockPostAccountingEvent).not.toHaveBeenCalled();
  });

  it('free plans activate without any cash accounting entry', async () => {
    // 1. request (cash but free plan)
    mockExecute.mockResolvedValueOnce([[{ ...CASH_REGISTRATION_REQ, requested_price: 0, requested_plan_name: 'Free' }], []]);
    // 2. org inactive
    mockExecute.mockResolvedValueOnce([[{ id: 6, name: 'Free Club', owner_id: 3, is_verified: 0, is_active: 0, deleted_at: null }], []]);
    // 3. plan active
    mockExecute.mockResolvedValueOnce([[{ id: 1, is_active: 1 }], []]);
    // 4. no conflict
    mockExecute.mockResolvedValueOnce([[], []]);
    // 5. isPaidPlan: plan price query — free
    mockExecute.mockResolvedValueOnce([[{ is_unlimited: 1, price_monthly: 0, price_yearly: 0 }], []]);
    // 6-7. snapshot
    mockExecute.mockResolvedValueOnce([[{ id: 1, plan_name: 'Free', price_monthly: 0, price_yearly: 0, is_unlimited: 1, _features: null }], []]);
    mockExecute.mockResolvedValueOnce([[], []]);
    // 8. existing subscription dates (writeActiveSubscription pre-SELECT)
    mockExecute.mockResolvedValueOnce([[{ id: 5, start_date: null, end_date: null }], []]);
    // 9. INSERT active subscription
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1, insertId: 55 }, []]);
    // 10. approve UPDATE
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // 11. org activation UPDATE
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    // 12. resolveRequestAmount fallback plan-price lookup (requested_price=0 → still 0)
    mockExecute.mockResolvedValueOnce([[{ price_monthly: 0, price_yearly: 0 }], []]);

    const result = await tryActivateSubscriptionRequest(7, { adminId: 1 }).catch((e) => {
      console.error('CALLS:', mockExecute.mock.calls.length, JSON.stringify(mockExecute.mock.calls.map((c: any[]) => String(c[0]).slice(0, 60))));
      throw e;
    });

    expect(result.activated).toBe(true);
    expect(result.organisationActivated).toBe(true);
    expect(mockPostAccountingEvent).not.toHaveBeenCalled();
  });
});
