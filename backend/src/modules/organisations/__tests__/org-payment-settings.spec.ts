import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  poolExecute: vi.fn(),
  listBranches: vi.fn(),
  upsertBranchFinancialDetails: vi.fn(),
  getByBranchId: vi.fn(),
  branchBelongsToOrg: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ query: mocks.poolQuery, execute: mocks.poolExecute }),
}));
vi.mock('../application/org-portal.service.js', () => ({ default: {} }));
vi.mock('../infrastructure/repositories/org-portal.repository.js', () => ({
  branchBelongsToOrg: mocks.branchBelongsToOrg,
}));
vi.mock('../application/organisation.service.js', () => ({
  organisationService: {
    listBranches: mocks.listBranches,
    upsertBranchFinancialDetails: mocks.upsertBranchFinancialDetails,
  },
}));
vi.mock('../infrastructure/repositories/branch-financial.repository.js', () => ({
  branchFinancialRepository: { getByBranchId: mocks.getByBranchId },
}));
vi.mock('../infrastructure/repositories/cancellation-policy.repository.js', () => ({
  cancellationPolicyRepository: {},
}));
vi.mock('../../rbac/infrastructure/repositories/rbac.repository.js', () => ({ rbacRepository: {} }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('../../financial/application/position.service.js', () => ({ positionService: {} }));
vi.mock('../../settlement/application/unified-settlement.service.js', () => ({
  unifiedSettlementService: {},
}));
vi.mock('./organisation-audit.js', () => ({ auditOrganisationMutation: vi.fn() }));

import * as ctrl from '../presentation/org-portal.controller.js';

function req(overrides: any = {}): any {
  return {
    params: { orgId: '1001' },
    userId: 7,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'vitest' },
    body: {},
    ...overrides,
  };
}

function res(): any {
  const r: any = { statusCode: 200, sent: null };
  r.status = vi.fn((code: number) => { r.statusCode = code; return r; });
  r.send = vi.fn((val: any) => { r.sent = val; return r; });
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getOrgPaymentSettingsHandler', () => {
  it('maps real branch_financial_details columns to the legacy response shape', async () => {
    mocks.listBranches.mockResolvedValue([
      { id: 5, name: 'Main' },
      { id: 6, name: 'Second' },
    ]);
    mocks.getByBranchId
      .mockResolvedValueOnce({
        bank_account_name: 'Holder Name',
        bank_account_number: '123456',
        bank_name: 'Example Bank',
        iban: 'EG00EXAMPLE',
        swift: 'EXMPLEXX',
      })
      .mockResolvedValueOnce(null);
    mocks.poolQuery.mockResolvedValue([[
      { id: 1, slug: 'card', name: 'Card', is_active: 1, sort_order: 0 },
    ]]);

    const reply = res();
    await ctrl.getOrgPaymentSettingsHandler(req(), reply);

    expect(mocks.listBranches).toHaveBeenCalledWith(1001);
    expect(mocks.getByBranchId).toHaveBeenNthCalledWith(1, 5);
    expect(mocks.getByBranchId).toHaveBeenNthCalledWith(2, 6);
    expect(reply.sent.branches).toEqual([
      {
        id: 5,
        name: 'Main',
        account_holder_name: 'Holder Name',
        account_number: '123456',
        bank_name: 'Example Bank',
        iban: 'EG00EXAMPLE',
        swift_code: 'EXMPLEXX',
        tax_id: null,
      },
      {
        id: 6,
        name: 'Second',
        account_holder_name: null,
        account_number: null,
        bank_name: null,
        iban: null,
        swift_code: null,
        tax_id: null,
      },
    ]);
    expect(reply.sent.paymentMethods).toHaveLength(1);

    const paymentSql = mocks.poolQuery.mock.calls[0][0] as string;
    expect(paymentSql).toContain('FROM payment_methods pm');
    expect(paymentSql).toContain('pm.is_active = 1');
    expect(paymentSql).not.toContain('branch_financial_details');
  });

  it('keeps the branch order returned by the organisation branch list', async () => {
    mocks.listBranches.mockResolvedValue([{ id: 9, name: 'Zeta' }, { id: 3, name: 'Alpha' }]);
    mocks.getByBranchId.mockResolvedValue(null);
    mocks.poolQuery.mockResolvedValue([[]]);

    const reply = res();
    await ctrl.getOrgPaymentSettingsHandler(req(), reply);

    expect(reply.sent.branches.map((b: any) => b.id)).toEqual([9, 3]);
  });
});

describe('updateOrgPaymentSettingsHandler', () => {
  const existing = {
    bank_id: 9,
    bank_branch_id: 3,
    bank_name: 'Old Bank',
    bank_account_name: 'Old Holder',
    bank_account_number: '111111',
    iban: 'OLDIBAN',
    swift: 'OLDSWIFT',
    billing_address: 'Old Address',
    billing_email: 'billing@example.com',
    payout_schedule: 'weekly',
    currency_id: 2,
  };

  it('maps legacy payload keys and preserves fields that were not sent', async () => {
    mocks.branchBelongsToOrg.mockResolvedValue(true);
    mocks.getByBranchId.mockResolvedValue(existing);
    mocks.upsertBranchFinancialDetails.mockResolvedValue(undefined);

    const reply = res();
    await ctrl.updateOrgPaymentSettingsHandler(
      req({
        body: {
          branchId: 5,
          financialDetails: {
            account_holder_name: 'New Holder',
            account_number: '999999',
            bank_name: 'New Bank',
            iban: 'NEWIBAN',
            swift_code: 'NEWSWIFT',
          },
        },
      }),
      reply,
    );

    expect(mocks.branchBelongsToOrg).toHaveBeenCalledWith(5, 1001);
    expect(mocks.upsertBranchFinancialDetails).toHaveBeenCalledTimes(1);
    const [branchId, payload] = mocks.upsertBranchFinancialDetails.mock.calls[0];
    expect(branchId).toBe(5);
    expect(payload).toMatchObject({
      bankId: 9,
      bankBranchId: 3,
      bankName: 'New Bank',
      bankAccountName: 'New Holder',
      bankAccountNumber: '999999',
      iban: 'NEWIBAN',
      swift: 'NEWSWIFT',
      billingAddress: 'Old Address',
      billingEmail: 'billing@example.com',
      payoutSchedule: 'weekly',
      currencyId: 2,
    });
    expect(reply.sent).toEqual({ success: true });
  });

  it('keeps stored values when the payload only changes the holder name', async () => {
    mocks.branchBelongsToOrg.mockResolvedValue(true);
    mocks.getByBranchId.mockResolvedValue(existing);
    mocks.upsertBranchFinancialDetails.mockResolvedValue(undefined);

    const reply = res();
    await ctrl.updateOrgPaymentSettingsHandler(
      req({ body: { branchId: 5, financialDetails: { account_holder_name: 'Only Name' } } }),
      reply,
    );

    const payload = mocks.upsertBranchFinancialDetails.mock.calls[0][1];
    expect(payload.bankAccountName).toBe('Only Name');
    expect(payload.bankAccountNumber).toBe('111111');
    expect(payload.iban).toBe('OLDIBAN');
    expect(payload.swift).toBe('OLDSWIFT');
    expect(payload.payoutSchedule).toBe('weekly');
    expect(payload.billingEmail).toBe('billing@example.com');
    expect(payload.currencyId).toBe(2);
  });

  it('creates a row with schema-safe defaults when no financial record exists', async () => {
    mocks.branchBelongsToOrg.mockResolvedValue(true);
    mocks.getByBranchId.mockResolvedValue(null);
    mocks.upsertBranchFinancialDetails.mockResolvedValue(undefined);

    const reply = res();
    await ctrl.updateOrgPaymentSettingsHandler(
      req({
        body: {
          branchId: 5,
          financialDetails: {
            account_holder_name: 'Holder',
            account_number: '123456',
            bank_name: 'Bank',
            iban: 'IBAN',
            swift_code: 'SWIFT',
          },
        },
      }),
      reply,
    );

    expect(mocks.upsertBranchFinancialDetails).toHaveBeenCalledTimes(1);
    const [branchId, payload] = mocks.upsertBranchFinancialDetails.mock.calls[0];
    expect(branchId).toBe(5);
    expect(payload).toEqual({
      bankId: null,
      bankBranchId: null,
      bankName: 'Bank',
      bankAccountName: 'Holder',
      bankAccountNumber: '123456',
      iban: 'IBAN',
      swift: 'SWIFT',
      billingAddress: null,
      billingEmail: null,
      payoutSchedule: 'monthly',
      currencyId: null,
    });
    expect(reply.sent).toEqual({ success: true });
  });

  it('distinguishes undefined (keep), null (clear) and empty string (clear to empty)', async () => {
    mocks.branchBelongsToOrg.mockResolvedValue(true);
    mocks.getByBranchId.mockResolvedValue(existing);
    mocks.upsertBranchFinancialDetails.mockResolvedValue(undefined);

    const reply = res();
    await ctrl.updateOrgPaymentSettingsHandler(
      req({
        body: {
          branchId: 5,
          financialDetails: {
            account_holder_name: undefined,
            account_number: null,
            iban: '',
            swift_code: 'NEWSWIFT',
          },
        },
      }),
      reply,
    );

    const payload = mocks.upsertBranchFinancialDetails.mock.calls[0][1];
    expect(payload.bankAccountName).toBe('Old Holder'); // undefined => keep
    expect(payload.bankAccountNumber).toBeNull(); // null => clear
    expect(payload.iban).toBe(''); // '' => clear to empty string
    expect(payload.swift).toBe('NEWSWIFT'); // value => replace
    expect(payload.bankName).toBe('Old Bank'); // omitted => keep
    expect(reply.statusCode).toBe(200);

    const audit = mocks.recordAudit.mock.calls[0][0];
    expect(audit.afterState.updatedFields).toEqual(['account_number', 'iban', 'swift_code']);
  });

  it('normalises a stored empty billing email to NULL instead of failing validation', async () => {
    mocks.branchBelongsToOrg.mockResolvedValue(true);
    mocks.getByBranchId.mockResolvedValue({ ...existing, billing_email: '' });
    mocks.upsertBranchFinancialDetails.mockResolvedValue(undefined);

    const reply = res();
    await ctrl.updateOrgPaymentSettingsHandler(
      req({ body: { branchId: 5, financialDetails: { account_holder_name: 'X' } } }),
      reply,
    );

    expect(reply.statusCode).toBe(200);
    const payload = mocks.upsertBranchFinancialDetails.mock.calls[0][1];
    expect(payload.billingEmail).toBeNull();
  });

  it('surfaces an invalid stored billing email instead of hiding or overwriting it', async () => {
    mocks.branchBelongsToOrg.mockResolvedValue(true);
    mocks.getByBranchId.mockResolvedValue({ ...existing, billing_email: 'not-an-email' });

    const reply = res();
    await ctrl.updateOrgPaymentSettingsHandler(
      req({ body: { branchId: 5, financialDetails: { account_holder_name: 'X' } } }),
      reply,
    );

    expect(reply.statusCode).toBe(409);
    expect(reply.sent).toMatchObject({ error: 'STORED_DATA_INVALID' });
    expect(mocks.upsertBranchFinancialDetails).not.toHaveBeenCalled();
  });

  it('surfaces an over-long stored billing email instead of letting DTO limits fail generically', async () => {
    mocks.branchBelongsToOrg.mockResolvedValue(true);
    mocks.getByBranchId.mockResolvedValue({
      ...existing,
      billing_email: `${'a'.repeat(250)}@example.com`,
    });

    const reply = res();
    await ctrl.updateOrgPaymentSettingsHandler(
      req({ body: { branchId: 5, financialDetails: { account_holder_name: 'X' } } }),
      reply,
    );

    expect(reply.statusCode).toBe(409);
    expect(reply.sent).toMatchObject({ error: 'STORED_DATA_INVALID' });
    expect(mocks.upsertBranchFinancialDetails).not.toHaveBeenCalled();
  });

  it('enforces database column length limits before writing', async () => {
    mocks.branchBelongsToOrg.mockResolvedValue(true);
    mocks.getByBranchId.mockResolvedValue(existing);

    const cases = [
      { account_holder_name: 'a'.repeat(201) }, // bank_account_name varchar(200)
      { account_number: 'b'.repeat(101) }, // bank_account_number varchar(100)
      { iban: 'c'.repeat(51) }, // iban varchar(50)
      { swift_code: 'd'.repeat(21) }, // swift varchar(20)
    ];

    for (const financialDetails of cases) {
      const reply = res();
      await ctrl.updateOrgPaymentSettingsHandler(
        req({ body: { branchId: 5, financialDetails } }),
        reply,
      );
      expect(reply.statusCode).toBe(400);
      expect(reply.sent).toMatchObject({ error: 'VALIDATION_ERROR' });
    }

    expect(mocks.upsertBranchFinancialDetails).not.toHaveBeenCalled();
  });

  it('rejects a branch that belongs to another organisation without writing (IDOR)', async () => {
    mocks.branchBelongsToOrg.mockResolvedValue(false);

    const reply = res();
    await ctrl.updateOrgPaymentSettingsHandler(
      req({ body: { branchId: 66, financialDetails: { account_holder_name: 'X' } } }),
      reply,
    );

    expect(reply.statusCode).toBe(403);
    expect(reply.sent).toMatchObject({ error: 'FORBIDDEN' });
    expect(mocks.getByBranchId).not.toHaveBeenCalled();
    expect(mocks.upsertBranchFinancialDetails).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it('rejects a non-empty tax_id instead of silently dropping it', async () => {
    mocks.branchBelongsToOrg.mockResolvedValue(true);

    const reply = res();
    await ctrl.updateOrgPaymentSettingsHandler(
      req({ body: { branchId: 5, financialDetails: { tax_id: 'TAX-123', account_holder_name: 'X' } } }),
      reply,
    );

    expect(reply.statusCode).toBe(400);
    expect(reply.sent).toMatchObject({ error: 'VALIDATION_ERROR' });
    expect(mocks.upsertBranchFinancialDetails).not.toHaveBeenCalled();
  });

  it('allows an empty tax_id (legacy clients sending a blank field)', async () => {
    mocks.branchBelongsToOrg.mockResolvedValue(true);
    mocks.getByBranchId.mockResolvedValue(existing);
    mocks.upsertBranchFinancialDetails.mockResolvedValue(undefined);

    const reply = res();
    await ctrl.updateOrgPaymentSettingsHandler(
      req({ body: { branchId: 5, financialDetails: { tax_id: '', account_holder_name: 'X' } } }),
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(reply.sent).toEqual({ success: true });
    expect(mocks.upsertBranchFinancialDetails).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing branchId instead of succeeding silently', async () => {
    const reply = res();
    await ctrl.updateOrgPaymentSettingsHandler(
      req({ body: { financialDetails: { account_holder_name: 'X' } } }),
      reply,
    );

    expect(reply.statusCode).toBe(400);
    expect(mocks.upsertBranchFinancialDetails).not.toHaveBeenCalled();
  });

  it('rejects missing financialDetails instead of succeeding silently', async () => {
    const reply = res();
    await ctrl.updateOrgPaymentSettingsHandler(req({ body: { branchId: 5 } }), reply);

    expect(reply.statusCode).toBe(400);
    expect(mocks.upsertBranchFinancialDetails).not.toHaveBeenCalled();
  });

  it('rejects payloads that fail BranchFinancialDetailsSchema validation', async () => {
    mocks.branchBelongsToOrg.mockResolvedValue(true);
    mocks.getByBranchId.mockResolvedValue(existing);

    const reply = res();
    await ctrl.updateOrgPaymentSettingsHandler(
      req({ body: { branchId: 5, financialDetails: { account_holder_name: 123 } } }),
      reply,
    );

    expect(reply.statusCode).toBe(400);
    expect(reply.sent).toMatchObject({ error: 'VALIDATION_ERROR' });
    expect(mocks.upsertBranchFinancialDetails).not.toHaveBeenCalled();
  });

  it('records audit evidence without storing account numbers, IBAN or SWIFT values', async () => {
    mocks.branchBelongsToOrg.mockResolvedValue(true);
    mocks.getByBranchId.mockResolvedValue(existing);
    mocks.upsertBranchFinancialDetails.mockResolvedValue(undefined);

    const reply = res();
    await ctrl.updateOrgPaymentSettingsHandler(
      req({
        body: {
          branchId: 5,
          financialDetails: {
            account_holder_name: 'New Holder',
            account_number: '999999',
            iban: 'NEWIBAN',
            swift_code: 'NEWSWIFT',
            billing_email: 'ignored@example.com',
            payout_schedule: 'daily',
            tax_id: '',
          },
        },
      }),
      reply,
    );

    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    const audit = mocks.recordAudit.mock.calls[0][0];
    expect(audit.afterState).toEqual({
      branchId: 5,
      updatedFields: ['account_holder_name', 'account_number', 'iban', 'swift_code'],
    });
    const serialized = JSON.stringify(audit.afterState);
    expect(serialized).not.toContain('999999');
    expect(serialized).not.toContain('NEWIBAN');
    expect(serialized).not.toContain('NEWSWIFT');
  });
});
