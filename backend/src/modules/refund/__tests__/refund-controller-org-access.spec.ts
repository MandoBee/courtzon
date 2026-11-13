// ============================================================================
// Refund Engine — controller tenant scoping.
//
// Unit-only: the service, org access helper and platform-admin check are
// mocked. Proves the controller always validates the CANONICAL refund-case
// organisation (never a client-supplied id) before exposing data or mutating.
// ============================================================================
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, ConflictError } from '../../../shared/errors/app-error.js';

const mocks = vi.hoisted(() => ({
  assertOrgAccess: vi.fn(),
  isPlatformAdmin: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  requestCase: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  recordPayout: vi.fn(),
  confirmPayout: vi.fn(),
  failPayout: vi.fn(),
}));

vi.mock('../../settlement/presentation/unified-settlement.controller.js', () => ({
  assertOrgAccess: mocks.assertOrgAccess,
}));
vi.mock('../../../shared/middleware/org-access.js', () => ({
  isPlatformAdmin: mocks.isPlatformAdmin,
}));
vi.mock('../application/refund-case.service.js', () => ({
  refundCaseService: {
    get: mocks.get,
    list: mocks.list,
    requestCase: mocks.requestCase,
    approve: mocks.approve,
    reject: mocks.reject,
    recordPayout: mocks.recordPayout,
    confirmPayout: mocks.confirmPayout,
    failPayout: mocks.failPayout,
  },
}));

const ctrl = await import('../presentation/refund.controller.js');

const reply = () => {
  const sent: any = {};
  const r: any = {
    status: vi.fn(() => r),
    header: vi.fn(() => r),
    send: vi.fn((value: any) => {
      sent.value = value;
      return value;
    }),
  };
  return { reply: r, sent };
};

const refundCase = (organisationId = 5) => ({
  id: 7,
  organisation_id: organisationId,
  public_id: 'p-7',
  approved_refund_cents: 1_000,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isPlatformAdmin.mockResolvedValue(false);
  mocks.list.mockResolvedValue({ rows: [], total: 0 });
});

describe('Refund controller — canonical organisation access', () => {
  it('create validates the body organisation before creating anything', async () => {
    mocks.assertOrgAccess.mockRejectedValueOnce(new ForbiddenError('denied'));
    const { reply: r } = reply();

    await expect(
      ctrl.createRefundCaseHandler(
        {
          userId: 1,
          body: {
            domain: 'booking',
            sourceType: 'booking',
            sourceId: 42,
            organisationId: 5,
            reason: 'test reason',
            idempotencyKey: 'key-12345678',
            lines: [{ lineType: 'booking', sourceId: 42, canceledValueCents: 1_000, approvedCents: 1_000 }],
          },
        } as any,
        r,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(mocks.assertOrgAccess).toHaveBeenCalledWith(1, 5);
    expect(mocks.requestCase).not.toHaveBeenCalled();
  });

  it('get validates the canonical case organisation before returning it', async () => {
    mocks.get.mockResolvedValue({ case: refundCase(5), lines: [], payouts: [] });
    mocks.assertOrgAccess.mockRejectedValueOnce(new ForbiddenError('denied'));
    const { reply: r } = reply();

    await expect(
      ctrl.getRefundCaseHandler({ userId: 1, params: { id: '7' }, query: {} } as any, r),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(mocks.assertOrgAccess).toHaveBeenCalledWith(1, 5);
  });

  it('approve cannot act on a foreign organisation case', async () => {
    mocks.get.mockResolvedValue({ case: refundCase(5), lines: [], payouts: [] });
    mocks.assertOrgAccess.mockRejectedValueOnce(new ForbiddenError('denied'));
    const { reply: r } = reply();

    await expect(
      ctrl.approveRefundCaseHandler({ userId: 1, params: { id: '7' }, body: {} } as any, r),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it('payout confirmation cannot act on a foreign organisation case', async () => {
    mocks.get.mockResolvedValue({ case: refundCase(5), lines: [], payouts: [] });
    mocks.assertOrgAccess.mockRejectedValueOnce(new ForbiddenError('denied'));
    const { reply: r } = reply();

    await expect(
      ctrl.confirmPayoutHandler({ userId: 1, params: { id: '7', payoutId: '55' } } as any, r),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(mocks.confirmPayout).not.toHaveBeenCalled();
  });

  it('list requires an organisation filter for non-platform users', async () => {
    const { reply: r } = reply();

    await expect(
      ctrl.listRefundCasesHandler({ userId: 1, query: {} } as any, r),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('list allows a platform admin without an organisation filter', async () => {
    mocks.isPlatformAdmin.mockResolvedValueOnce(true);
    const { reply: r } = reply();

    await ctrl.listRefundCasesHandler({ userId: 1, query: {} } as any, r);

    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ organisationId: undefined }),
    );
  });

  it('export requires and validates the organisation id', async () => {
    const { reply: r } = reply();
    await expect(
      ctrl.exportRefundCasesHandler({ userId: 1, query: {} } as any, r),
    ).rejects.toBeInstanceOf(ConflictError);

    mocks.assertOrgAccess.mockResolvedValueOnce(undefined);
    const { reply: r2 } = reply();
    await ctrl.exportRefundCasesHandler({ userId: 1, query: { organisationId: '5' } } as any, r2);
    expect(mocks.assertOrgAccess).toHaveBeenCalledWith(1, 5);
  });
});
