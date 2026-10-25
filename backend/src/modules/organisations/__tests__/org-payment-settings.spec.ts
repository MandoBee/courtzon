import { describe, it, expect, vi, beforeEach } from 'vitest';

const pool = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../application/org-portal.service.js', () => ({ default: {} }));
vi.mock('../infrastructure/repositories/org-portal.repository.js', () => ({ default: {} }));
vi.mock('../application/organisation.service.js', () => ({ organisationService: {} }));
vi.mock('../infrastructure/repositories/cancellation-policy.repository.js', () => ({ cancellationPolicyRepository: {} }));
vi.mock('../../rbac/infrastructure/repositories/rbac.repository.js', () => ({ rbacRepository: {} }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../../financial/application/position.service.js', () => ({ positionService: {} }));
vi.mock('../../settlement/application/unified-settlement.service.js', () => ({ unifiedSettlementService: {} }));
vi.mock('./organisation-audit.js', () => ({ auditOrganisationMutation: vi.fn() }));

import * as ctrl from '../presentation/org-portal.controller.js';

function req(overrides: any = {}): any {
  return { params: { orgId: '1001' }, userId: 1, ...overrides };
}
function res(): any {
  const r = { sent: null };
  r.send = vi.fn((val: any) => { r.sent = val; return r; });
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  pool.query.mockReset();
  pool.execute.mockReset();
});

describe('getOrgPaymentSettingsHandler — payment_methods schema regression (T-1B-8)', () => {
  it('filters active payment methods on is_active (the real column), not status', async () => {
    pool.query
      .mockResolvedValueOnce([[]]) // branches
      .mockResolvedValueOnce([[{ id: 1, slug: 'card', name: 'Card', is_active: 1, sort_order: 0 }]]); // payment_methods

    const reply = res();
    await ctrl.getOrgPaymentSettingsHandler(req(), reply);

    const paymentSql = pool.query.mock.calls[1][0] as string;
    expect(paymentSql).toContain('FROM payment_methods pm');
    expect(paymentSql).toContain('pm.is_active = 1');
    expect(paymentSql).not.toContain('pm.status');
    expect(reply.sent.paymentMethods).toHaveLength(1);
  });

  it('returns branches scoped to the org', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 5, name: 'Main' }]])
      .mockResolvedValueOnce([[]]);

    const reply = res();
    await ctrl.getOrgPaymentSettingsHandler(req(), reply);

    const branchSql = pool.query.mock.calls[0][0] as string;
    expect(branchSql).toContain('WHERE b.organisation_id = ?');
    expect(pool.query.mock.calls[0][1]).toEqual([1001]);
    expect(reply.sent.branches).toHaveLength(1);
  });
});

describe('CZ-F17 — organisation payment-settings column mapping', () => {
  it('GET selects the REAL branch_financial_details columns aliased to the API keys (no phantom columns)', async () => {
    pool.query
      .mockResolvedValueOnce([[{ id: 5, name: 'Main', account_holder_name: 'Acme', account_number: '123', swift_code: 'NBEG' }]])
      .mockResolvedValueOnce([[]]);

    const reply = res();
    await ctrl.getOrgPaymentSettingsHandler(req(), reply);

    const branchSql = (pool.query.mock.calls[0][0] as string).replace(/\s+/g, ' ');
    expect(branchSql).toContain('bfd.bank_account_name AS account_holder_name');
    expect(branchSql).toContain('bfd.bank_account_number AS account_number');
    expect(branchSql).toContain('bfd.swift AS swift_code');
    expect(branchSql).toContain('bfd.bank_name');
    expect(branchSql).toContain('bfd.iban');
    // No phantom columns (the schema mismatch that caused the 500):
    expect(branchSql).not.toMatch(/bfd\.account_holder_name/);
    expect(branchSql).not.toMatch(/bfd\.account_number/);
    expect(branchSql).not.toMatch(/bfd\.swift_code/);
    expect(branchSql).not.toMatch(/bfd\.tax_id/);
    expect(reply.sent.branches).toHaveLength(1);
  });

  it('PUT writes the REAL columns and keeps the API field names (no tax_id, no phantom columns)', async () => {
    pool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const reply = res();
    const request = {
      params: { orgId: '1001' }, userId: 7, headers: {},
      body: {
        branchId: 21,
        financialDetails: {
          account_holder_name: 'Acme', account_number: '123', bank_name: 'NBE',
          iban: 'EG', swift_code: 'NBEG', tax_id: 'TAX-IGNORED',
        },
      },
    } as any;

    await ctrl.updateOrgPaymentSettingsHandler(request, reply);

    expect(pool.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.execute.mock.calls[0];
    const flat = (sql as string).replace(/\s+/g, ' ');
    expect(flat).toContain('INSERT INTO branch_financial_details (branch_id, bank_account_name, bank_account_number, bank_name, iban, swift)');
    expect(flat).toContain('bank_account_name = VALUES(bank_account_name)');
    expect(flat).toContain('bank_account_number = VALUES(bank_account_number)');
    expect(flat).toContain('swift = VALUES(swift)');
    expect(flat).not.toMatch(/tax_id/);
    expect(flat).not.toMatch(/account_holder_name =/);
    expect(flat).not.toMatch(/swift_code =/);
    // body field -> real column order; tax_id value is NOT passed
    expect(params).toEqual([21, 'Acme', '123', 'NBE', 'EG', 'NBEG']);
    expect(reply.sent).toEqual({ success: true });
  });

  it('PUT is a no-op (no SQL) when branchId/financialDetails are absent, and still succeeds', async () => {
    const reply = res();
    const request = { params: { orgId: '1001' }, userId: 7, headers: {}, body: {} } as any;

    await ctrl.updateOrgPaymentSettingsHandler(request, reply);

    expect(pool.execute).not.toHaveBeenCalled();
    expect(reply.sent).toEqual({ success: true });
  });

  it('PUT propagates a database error (no silent success)', async () => {
    pool.execute.mockRejectedValueOnce(new Error('DB down'));
    const reply = res();
    const request = {
      params: { orgId: '1001' }, userId: 7, headers: {},
      body: { branchId: 21, financialDetails: { account_holder_name: 'Acme', account_number: '123', bank_name: 'NBE', iban: 'EG', swift_code: 'NBEG' } },
    } as any;

    await expect(ctrl.updateOrgPaymentSettingsHandler(request, reply)).rejects.toThrow('DB down');
  });
});