import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockExecute: vi.fn(),
  mockTryActivate: vi.fn(),
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: mocks.mockExecute,
  }),
}));

vi.mock('../application/subscription-activation.service.js', () => ({
  tryActivateSubscriptionRequest: (...args: any[]) => mocks.mockTryActivate(...args),
}));

import { activatePendingSubscriptionForOrg, approveSubscriptionRequest } from '../infrastructure/repositories/org-portal.repository.js';

describe('approveSubscriptionRequest delegates to tryActivateSubscriptionRequest', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('passes requestId and adminId through to the activation service', async () => {
    mocks.mockTryActivate.mockResolvedValue({ activated: true });
    const result = await approveSubscriptionRequest(5, 10, 'looks good');
    expect(mocks.mockTryActivate).toHaveBeenCalledWith(5, { adminId: 10, approvalNotes: 'looks good' });
    expect(result).toEqual({ activated: true });
  });

  it('passes null adminId when called without one', async () => {
    mocks.mockTryActivate.mockResolvedValue({ activated: true });
    await approveSubscriptionRequest(5, null);
    expect(mocks.mockTryActivate).toHaveBeenCalledWith(5, { adminId: null, approvalNotes: undefined });
  });
});

describe('activatePendingSubscriptionForOrg', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it('resolves the pending request and delegates to approval', async () => {
    mocks.mockExecute
      .mockResolvedValueOnce([[{ id: 42, organisation_id: 7 }], []])
      .mockResolvedValueOnce([[{ id: 42, organisation_id: 7 }], []]);

    const APPROVE_RESULT = { activated: true };
    mocks.mockTryActivate.mockResolvedValue(APPROVE_RESULT);

    const result = await activatePendingSubscriptionForOrg(7, 99);

    expect(mocks.mockExecute).toHaveBeenCalledTimes(1);
    const [sql] = mocks.mockExecute.mock.calls[0];
    expect(sql).toContain("status = 'pending'");
    expect(mocks.mockTryActivate).toHaveBeenCalledWith(42, { adminId: 99 });
    expect(result).toBe(APPROVE_RESULT);
  });

  it('throws when no pending request exists for the organisation', async () => {
    mocks.mockExecute.mockResolvedValueOnce([[], []]);

    await expect(activatePendingSubscriptionForOrg(99, 1)).rejects.toThrow(/No pending subscription request/);
    expect(mocks.mockTryActivate).not.toHaveBeenCalled();
  });
});
