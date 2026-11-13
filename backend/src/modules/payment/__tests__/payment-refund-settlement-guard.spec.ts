// ============================================================================
// R1 — POST /payments/:id/refund handler guards.
//
// Unit-only: payment repository/service, resolver, org authorisation,
// country scope and the settlement-reservation guard are all mocked.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  refund: vi.fn(),
  resolveScope: vi.fn(),
  guard: vi.fn(),
  assertOrgAccess: vi.fn(),
  countryScope: vi.fn(),
  audit: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('../application/payment.service.js', () => ({
  paymentService: { refund: mocks.refund, charge: vi.fn(), getPaymentStatus: vi.fn() },
}));
vi.mock('../application/reconciliation.service.js', () => ({ reconciliationService: { run: vi.fn(), getHistory: vi.fn() } }));
vi.mock('../infrastructure/repositories/payment.repository.js', () => ({
  paymentRepository: { findById: mocks.findById },
}));
vi.mock('../application/payment-refund-scope.js', () => ({
  resolvePaymentRefundScope: mocks.resolveScope,
}));
vi.mock('../../financial/application/financial-entitlement.service.js', () => ({
  financialEntitlementService: { assertNoActiveSettlementReservation: mocks.guard },
}));
vi.mock('../../settlement/presentation/unified-settlement.controller.js', () => ({
  assertOrgAccess: mocks.assertOrgAccess,
}));
vi.mock('../../rbac/application/user-country-scope.js', () => ({
  getUserCountryScope: mocks.countryScope,
}));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => ({ execute: mocks.execute }) }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: mocks.audit }));
vi.mock('../../../shared/utils/build-info.js', () => ({
  getAppVersion: () => 'test',
  getExpectedMigration: () => 0,
  getGitCommit: () => 'test',
}));

const { refundHandler } = await import('../presentation/payment.controller.js');

const PAYMENT = {
  id: 900,
  user_id: 1,
  amount: '100.00',
  payment_status: 'paid',
  reference_type: 'booking',
  reference_id: 55,
  booking_id: 55,
  order_id: null,
};

const SCOPE = {
  paymentId: 900,
  referenceType: 'booking',
  hasEntitlements: true,
  entitlementScopes: [{ sourceType: 'booking', sourceIds: [55] }],
  organisationIds: [7],
};

const NO_ENTITLEMENT_SCOPE = {
  paymentId: 900,
  referenceType: 'wallet_topup',
  hasEntitlements: false,
  entitlementScopes: [],
  organisationIds: [],
};

const makeReply = () => {
  const reply: any = {};
  reply.send = vi.fn((payload: any) => payload);
  return reply;
};
const req = (overrides: Record<string, any> = {}) => ({
  params: { id: '900' },
  body: { transactionId: 900, amount: 100, reason: 'test' },
  userId: 1,
  ip: '127.0.0.1',
  headers: { 'user-agent': 'vitest' },
  ...overrides,
});

describe('R1 — refundHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue({ ...PAYMENT });
    mocks.resolveScope.mockResolvedValue({ ...SCOPE });
    mocks.assertOrgAccess.mockResolvedValue(undefined);
    mocks.guard.mockResolvedValue(undefined);
    mocks.refund.mockResolvedValue({ success: true, paymentId: 900 });
    mocks.countryScope.mockResolvedValue({ isSystem: true, countryId: null });
  });

  it('404 when the payment does not exist (canonical path id)', async () => {
    mocks.findById.mockResolvedValueOnce(null);
    await expect(refundHandler(req() as any, makeReply())).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it('400 when body.transactionId does not match the path id (before any effect)', async () => {
    await expect(
      refundHandler(req({ body: { transactionId: 901, amount: 100 } }) as any, makeReply()),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(mocks.resolveScope).not.toHaveBeenCalled();
  });

  it('409 for a partial amount (no cumulative-partial model on this endpoint)', async () => {
    await expect(
      refundHandler(req({ body: { transactionId: 900, amount: 40 } }) as any, makeReply()),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it('allows an exact full refund for the canonical booking organisation', async () => {
    const reply = makeReply();
    const result = await refundHandler(req() as any, reply);

    expect(mocks.assertOrgAccess).toHaveBeenCalledWith(1, 7);
    expect(mocks.guard).toHaveBeenCalledWith('booking', [55]);
    expect(mocks.refund).toHaveBeenCalledWith(900, 100, 'test');
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ success: true });
  });

  it('403 before refund when the organisation is foreign', async () => {
    const { ForbiddenError } = await import('../../../shared/errors/app-error.js');
    mocks.assertOrgAccess.mockRejectedValueOnce(new ForbiddenError('Access to this organisation denied'));

    await expect(refundHandler(req() as any, makeReply())).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(mocks.guard).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('rejects the WHOLE multi-organisation refund when ONE organisation is unauthorised', async () => {
    const { ForbiddenError } = await import('../../../shared/errors/app-error.js');
    mocks.resolveScope.mockResolvedValueOnce({
      ...SCOPE,
      referenceType: 'order',
      entitlementScopes: [{ sourceType: 'marketplace', sourceIds: [501, 502] }],
      organisationIds: [7, 8],
    });
    mocks.assertOrgAccess.mockImplementation(async (_u: number, orgId: number) => {
      if (orgId === 8) throw new ForbiddenError('Access to this organisation denied');
    });

    await expect(refundHandler(req() as any, makeReply())).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.assertOrgAccess).toHaveBeenCalledWith(1, 7);
    expect(mocks.assertOrgAccess).toHaveBeenCalledWith(1, 8);
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it('allows a platform admin (assertOrgAccess is the canonical check)', async () => {
    await refundHandler(req({ userId: 999 }) as any, makeReply());
    expect(mocks.refund).toHaveBeenCalledTimes(1);
  });

  it('409 when an entitlement is reserved by an active settlement (no refund, no audit)', async () => {
    const { ConflictError } = await import('../../../shared/errors/app-error.js');
    mocks.guard.mockRejectedValueOnce(new ConflictError('Refund blocked: entitlement 5 is reserved by settlement 91'));

    await expect(refundHandler(req() as any, makeReply())).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('checks the settlement guard BEFORE calling the refund service', async () => {
    const order: string[] = [];
    mocks.guard.mockImplementationOnce(async () => { order.push('guard'); });
    mocks.refund.mockImplementationOnce(async () => { order.push('refund'); return { success: true }; });

    await refundHandler(req() as any, makeReply());
    expect(order).toEqual(['guard', 'refund']);
  });

  it('subscription / wallet_topup refunds have no entitlements and remain allowed', async () => {
    mocks.resolveScope.mockResolvedValueOnce({ ...NO_ENTITLEMENT_SCOPE });
    mocks.findById.mockResolvedValueOnce({ ...PAYMENT, reference_type: 'wallet_topup', reference_id: 3, booking_id: null });

    await refundHandler(req() as any, makeReply());
    expect(mocks.guard).not.toHaveBeenCalled();
    expect(mocks.assertOrgAccess).not.toHaveBeenCalled();
    expect(mocks.refund).toHaveBeenCalledTimes(1);
  });

  it('enforces country scope for a restricted master-admin (foreign org → 403)', async () => {
    const { ForbiddenError } = await import('../../../shared/errors/app-error.js');
    mocks.countryScope.mockResolvedValue({ isSystem: false, countryId: 1 });
    mocks.execute.mockImplementation(async (sql: string) => {
      if (String(sql).includes('master-admin')) return [[{ 1: 1 }], []];
      if (String(sql).includes('FROM organisations')) return [[{ id: 7, country_id: 2 }], []];
      return [[], []];
    });

    await expect(refundHandler(req() as any, makeReply())).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining('country scope') as any,
    });
    expect(mocks.refund).not.toHaveBeenCalled();
    void ForbiddenError;
  });

  it('allows a restricted master-admin for an organisation in their country', async () => {
    mocks.countryScope.mockResolvedValue({ isSystem: false, countryId: 2 });
    mocks.execute.mockImplementation(async (sql: string) => {
      if (String(sql).includes('master-admin')) return [[{ 1: 1 }], []];
      if (String(sql).includes('FROM organisations')) return [[{ id: 7, country_id: 2 }], []];
      return [[], []];
    });

    await refundHandler(req() as any, makeReply());
    expect(mocks.refund).toHaveBeenCalledTimes(1);
  });

  it('preserves idempotent behaviour when the payment is already refunded', async () => {
    mocks.findById.mockResolvedValueOnce({ ...PAYMENT, payment_status: 'refunded' });
    mocks.refund.mockResolvedValueOnce({ success: true, idempotent: true, paymentId: 900 });

    const result = await refundHandler(req() as any, makeReply());
    expect(result).toMatchObject({ success: true, idempotent: true });
    // no full-amount guard needed once the payment is terminal
    expect(mocks.refund).toHaveBeenCalledTimes(1);
  });
});
