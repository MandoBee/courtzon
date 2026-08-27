import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F-24 — reconciliation control-account DIRECTION hardening.
 *
 * Direction (liability → payable / asset → receivable) must be derived from the
 * account's semantic COA account_type, never from a code-prefix convention
 * (e.g. code.startsWith('2')). Proves:
 *   1. 2200 (liability) → payable leg (credit-positive), code NOT required to start with '2'
 *   2. 1160 (asset) → receivable leg (debit-positive), code NOT required to start with '1'
 *   3. Current-COA behavior is unchanged (2200/1160 with their real account_type)
 *   4. A hypothetical liability control account with a code that does NOT start
 *      with "2" is still classified as payable (liability).
 *   5. A hypothetical asset control account with a code that does NOT start
 *      with "1" is still classified as receivable (asset).
 *   6. Reconciliation remains read-only (SELECT-only) and drift is only reported.
 */

const openPositionsMock = vi.fn();
const controlTotalsForOrgMock = vi.fn();
const resolveControlAccountIdsMock = vi.fn();

vi.mock('../infrastructure/repositories/position.repository.js', () => ({
  positionRepository: {
    openPositions: (orgId: number) => openPositionsMock(orgId),
    openPositionsOrgIds: async () => [],
  },
}));

vi.mock('../infrastructure/repositories/gl-control.repository.js', () => ({
  glControlRepository: {
    resolveControlAccountIds: () => resolveControlAccountIdsMock(),
    controlTotalsForOrg: (orgId: number, ids: number[]) => controlTotalsForOrgMock(orgId, ids),
    orgsWithControlActivity: async () => [],
  },
}));

import { reconciliationService } from '../application/reconciliation.service.js';

// Open position rows (financial_entitlements) driving the entitlement side.
function ent(over: Partial<any> = {}) {
  return {
    id: 1, public_id: 'p', entitlement_type: 'ORGANIZATION_EARNING', collector: 'courtzon',
    status: 'AVAILABLE', source_type: 'marketplace', source_id: 1, branch_id: null,
    amount: '500', currency: 'EGP', created_at: new Date(), available_at: null, ...over,
  };
}

// GL totals per control account id.
function totals(rows: Array<{ accountId: number; debits: number; credits: number }>) {
  return rows.map((r) => ({ ...r, debits: String(r.debits), credits: String(r.credits), code: '' }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('F-24: reconciliation direction uses semantic account_type, not code prefix', () => {
  it('2200 (account_type=liability) → payable leg (credit-positive) — current COA unchanged', async () => {
    openPositionsMock.mockResolvedValue([ent()]); // 500 CourtZon owes org
    resolveControlAccountIdsMock.mockResolvedValue([{ id: 27, code: '2200', account_type: 'liability' }]);
    controlTotalsForOrgMock.mockResolvedValue(totals([{ accountId: 27, debits: 0, credits: 500 }]));

    const report = await reconciliationService.reconcileOrganisation(1);
    expect(report.gl.payableToOrg).toBe(500);
    expect(report.gl.receivableFromOrg).toBe(0);
    expect(report.reconciled).toBe(true);
  });

  it('1160 (account_type=asset) → receivable leg (debit-positive) — current COA unchanged', async () => {
    openPositionsMock.mockResolvedValue([
      ent({ entitlement_type: 'COURTZON_COMMISSION', collector: 'org', amount: '120' }),
    ]);
    resolveControlAccountIdsMock.mockResolvedValue([{ id: 36, code: '1160', account_type: 'asset' }]);
    controlTotalsForOrgMock.mockResolvedValue(totals([{ accountId: 36, debits: 120, credits: 0 }]));

    const report = await reconciliationService.reconcileOrganisation(1);
    expect(report.gl.receivableFromOrg).toBe(120);
    expect(report.gl.payableToOrg).toBe(0);
    expect(report.reconciled).toBe(true);
  });

  it('hypothetical liability control with code NOT starting with "2" is still payable', async () => {
    // Code "9000" would previously fail the startsWith('2') check; its
    // account_type=liability must drive the payable leg.
    openPositionsMock.mockResolvedValue([ent()]);
    resolveControlAccountIdsMock.mockResolvedValue([{ id: 91, code: '9000', account_type: 'liability' }]);
    controlTotalsForOrgMock.mockResolvedValue(totals([{ accountId: 91, debits: 0, credits: 300 }]));

    const report = await reconciliationService.reconcileOrganisation(1);
    expect(report.gl.payableToOrg).toBe(300);
    expect(report.gl.receivableFromOrg).toBe(0);
    expect(report.gl.accounts[0].signedBalance).toBe(300);
  });

  it('hypothetical asset control with code NOT starting with "1" is still receivable', async () => {
    // Code "7777" would previously be classified as payable by code prefix;
    // its account_type=asset must drive the receivable leg.
    openPositionsMock.mockResolvedValue([
      ent({ entitlement_type: 'COURTZON_COMMISSION', collector: 'org', amount: '80' }),
    ]);
    resolveControlAccountIdsMock.mockResolvedValue([{ id: 92, code: '7777', account_type: 'asset' }]);
    controlTotalsForOrgMock.mockResolvedValue(totals([{ accountId: 92, debits: 80, credits: 0 }]));

    const report = await reconciliationService.reconcileOrganisation(1);
    expect(report.gl.receivableFromOrg).toBe(80);
    expect(report.gl.payableToOrg).toBe(0);
    expect(report.gl.accounts[0].signedBalance).toBe(80);
  });

  it('mixed liability+asset control accounts net correctly (current-COA parity)', async () => {
    openPositionsMock.mockResolvedValue([
      ent(), // 500 payable
      ent({ entitlement_type: 'COURTZON_COMMISSION', collector: 'org', amount: '120' }), // 120 receivable
    ]);
    resolveControlAccountIdsMock.mockResolvedValue([
      { id: 27, code: '2200', account_type: 'liability' },
      { id: 36, code: '1160', account_type: 'asset' },
    ]);
    controlTotalsForOrgMock.mockResolvedValue(totals([
      { accountId: 27, debits: 0, credits: 500 },
      { accountId: 36, debits: 120, credits: 0 },
    ]));

    const report = await reconciliationService.reconcileOrganisation(1);
    expect(report.entitlements.net).toBe(380);
    expect(report.gl.net).toBe(380);
    expect(report.difference).toBe(0);
    expect(report.reconciled).toBe(true);
  });

  it('drift is only REPORTED, never auto-repaired (read-only)', async () => {
    openPositionsMock.mockResolvedValue([ent()]); // 500
    resolveControlAccountIdsMock.mockResolvedValue([{ id: 27, code: '2200', account_type: 'liability' }]);
    controlTotalsForOrgMock.mockResolvedValue(totals([{ accountId: 27, debits: 0, credits: 700 }]));

    const report = await reconciliationService.reconcileOrganisation(1);
    expect(report.reconciled).toBe(false);
    expect(report.difference).toBe(-200); // drift reported, GL left untouched
  });
});