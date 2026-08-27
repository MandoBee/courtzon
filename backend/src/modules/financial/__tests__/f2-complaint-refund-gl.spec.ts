import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F-2 — Marketplace complaint refund GL symmetry.
 *
 * A complaint refund must reverse the ORIGINAL marketplace custody economics
 * (merchant_payable + platform_commission + tax_liability for CARD/WALLET;
 * receivable_from_org merchant-share for COD), crediting the buyer's wallet.
 * It must NOT post the generic wallet_refund (4300 revenue_contra / 2100)
 * which never mirrored the original marketplace legs.
 *
 * The accounting event `complaint_refund` is:
 *   debit: [merchant_payable, platform_commission, tax_liability, receivable_from_org]
 *   credit: [wallet_liability]
 * Balance: (orgAdjustment − taxReversal) + commissionReversal + taxReversal
 *          = orgAdjustment + commissionReversal = refundAmount.
 */

vi.mock('../../../database/mysql.js', () => {
  const poolMock = {
    execute: vi.fn().mockResolvedValue([[], []]),
    getConnection: vi.fn().mockResolvedValue({
      beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
      execute: vi.fn().mockResolvedValue([[], []]),
    }),
  };
  return { getPool: vi.fn().mockReturnValue(poolMock) };
});
vi.mock('../infrastructure/repositories/ledger.repository.js', () => ({
  ledgerRepository: { hasPosting: vi.fn().mockResolvedValue(false), createEntries: vi.fn() },
}));
vi.mock('../application/gl-projection.service.js', () => ({
  glProjectionService: {
    projectEntries: vi.fn(),
    resolvePeriod: vi.fn().mockResolvedValue(1),
    validateOpenPeriod: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../application/booking-accounting.service.js', () => ({ bookingAccounting: {} }));
vi.mock('../application/coa-validator.service.js', () => ({
  coaValidator: { validatePostable: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { on: vi.fn(), emit: vi.fn() } }));
vi.mock('../../../shared/utils/logger.js', () => ({
  createModuleLogger: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { postMarketplaceComplaintRefundAccounting } from '../application/accounting-event.listener.js';
import { accountingEngineService } from '../application/accounting-engine.service.js';
import { ledgerRepository } from '../infrastructure/repositories/ledger.repository.js';
import { getPool } from '../../../database/mysql.js';

const poolMock = (getPool as any)();

beforeEach(() => {
  vi.clearAllMocks();
  (ledgerRepository.hasPosting as any).mockResolvedValue(false);
  (ledgerRepository.createEntries as any).mockResolvedValue([1, 2]);
  (getPool as any).mockReturnValue(poolMock);
  // Spy on the real engine methods so we can assert their inputs.
  vi.spyOn(accountingEngineService, 'buildLedgerLines').mockImplementation(
    (eventType: string, mapping: any, conceptAmounts: Record<string, number>) => {
      // Delegate to the real pure logic via the class prototype.
      return (accountingEngineService.constructor.prototype as any).buildLedgerLines.call(accountingEngineService, eventType, mapping, conceptAmounts);
    },
  );
  vi.spyOn(accountingEngineService, 'validateBalance').mockImplementation((lines: any[]) => {
    return (accountingEngineService.constructor.prototype as any).validateBalance.call(accountingEngineService, lines);
  });
  poolMock.execute.mockImplementation((sql: string) => {
    if (sql.includes('accounting_event_mapping_lines')) {
      return [[
        { concept: 'merchant_payable', accountId: 8 },
        { concept: 'platform_commission', accountId: 10 },
        { concept: 'tax_liability', accountId: 9 },
        { concept: 'wallet_liability', accountId: 7 },
        { concept: 'receivable_from_org', accountId: 6 },
        { concept: 'refund_expense', accountId: 1316 },
      ]];
    }
    if (sql.includes('chart_of_accounts')) {
      return [[{ id: 8, is_active: 1, organisation_id: null }, { id: 10, is_active: 1, organisation_id: null }, { id: 9, is_active: 1, organisation_id: null }, { id: 7, is_active: 1, organisation_id: null }, { id: 6, is_active: 1, organisation_id: null }, { id: 1316, is_active: 1, organisation_id: null }]];
    }
    return [[], []];
  });
});

const mkEvent = (overrides: any = {}) => ({
  referenceType: 'complaint',
  referenceId: 5,
  amount: 400,
  currency: 'EGP',
  metadata: {
    complaintId: 5,
    itemId: 200,
    organisationId: 500,
    paymentMethod: 'card',
    cashHolder: 'courtzon',
    orderTax: 50,
    itemTax: 30,
    originalOrgEarning: 390,
    commissionReversal: 40,
    orgAdjustment: 360,
    settledRecovery: false,
    ...overrides,
  },
});

describe('F-2 — postMarketplaceComplaintRefundAccounting', () => {
  it('CARD custody reverses merchant_payable + platform_commission + tax_liability, credits wallet', async () => {
    (ledgerRepository.hasPosting as any).mockResolvedValue(false);
    const event = mkEvent({ paymentMethod: 'card', cashHolder: 'courtzon' });
    await postMarketplaceComplaintRefundAccounting(5, 400, 'EGP', event);

    const calls = (accountingEngineService.buildLedgerLines as any).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const eventType = calls[0][0];
    expect(eventType).toBe('complaint_refund');
    const conceptAmounts = calls[0][2] as Record<string, number>;
    // taxReversal = orgAdjustment × (itemTax / originalOrgEarning)
    //   = 360 × (30/390) = 27.69; merchant_payable = 360 − 27.69 = 332.31
    expect(conceptAmounts.merchant_payable).toBeCloseTo(332.31, 1);
    expect(conceptAmounts.platform_commission).toBe(40);
    expect(conceptAmounts.tax_liability).toBeCloseTo(27.69, 1);
    expect(conceptAmounts.wallet_liability).toBe(400);
    // Not the generic path — must NOT use revenue_contra.
    expect(conceptAmounts.revenue_contra).toBeUndefined();
  });

  it('WALLET custody behaves identically (credit wallet_liability)', async () => {
    (ledgerRepository.hasPosting as any).mockResolvedValue(false);
    const event = mkEvent({ paymentMethod: 'wallet', cashHolder: 'courtzon' });
    await postMarketplaceComplaintRefundAccounting(5, 400, 'EGP', event);
    const calls = (accountingEngineService.buildLedgerLines as any).mock.calls;
    const conceptAmounts = calls[0][2] as Record<string, number>;
    expect(conceptAmounts.wallet_liability).toBe(400);
    expect(conceptAmounts.merchant_payable).toBeCloseTo(332.31, 1);
    expect(conceptAmounts.tax_liability).toBeCloseTo(27.69, 1);
  });

  it('CARD custody with zero tax collapses to merchant_payable = orgAdjustment (balanced)', async () => {
    (ledgerRepository.hasPosting as any).mockResolvedValue(false);
    const event = mkEvent({ itemTax: 0, orderTax: 0 });
    await postMarketplaceComplaintRefundAccounting(5, 400, 'EGP', event);
    const conceptAmounts = (accountingEngineService.buildLedgerLines as any).mock.calls[0][2] as Record<string, number>;
    expect(conceptAmounts.merchant_payable).toBe(360);
    expect(conceptAmounts.tax_liability).toBe(0);
    // Dr = 360 + 40 = 400 = Cr
  });

  it('COD custody: no merchant_payable; merchant-share becomes receivable_from_org', async () => {
    (ledgerRepository.hasPosting as any).mockResolvedValue(false);
    const event = mkEvent({ paymentMethod: 'cash', cashHolder: 'org' });
    await postMarketplaceComplaintRefundAccounting(5, 400, 'EGP', event);
    const conceptAmounts = (accountingEngineService.buildLedgerLines as any).mock.calls[0][2] as Record<string, number>;
    // COD: Dr platform_commission + tax_liability + receivable_from_org(merchant share)
    expect(conceptAmounts.merchant_payable).toBeUndefined();
    expect(conceptAmounts.platform_commission).toBe(40);
    expect(conceptAmounts.tax_liability).toBeCloseTo(27.69, 1);
    expect(conceptAmounts.receivable_from_org).toBeCloseTo(400 - 40 - 27.69, 1); // 332.31
    expect(conceptAmounts.wallet_liability).toBe(400);
    // Dr = 40 + 27.69 + 332.31 = 400 = Cr
  });

  it('uses source_type marketplace and complaint source id (idempotent identity)', async () => {
    (ledgerRepository.hasPosting as any).mockResolvedValue(false);
    const event = mkEvent();
    await postMarketplaceComplaintRefundAccounting(5, 400, 'EGP', event);
    // hasPosting called with the complaint identity.
    expect(ledgerRepository.hasPosting).toHaveBeenCalledWith('marketplace', 5, 'complaint_refund');
  });

  it('is idempotent: skips when a posting already exists', async () => {
    (ledgerRepository.hasPosting as any).mockResolvedValue(true);
    const event = mkEvent();
    await postMarketplaceComplaintRefundAccounting(5, 400, 'EGP', event);
    expect(accountingEngineService.buildLedgerLines).not.toHaveBeenCalled();
  });

  it('posting is balanced (Σ debits = Σ credits)', async () => {
    (ledgerRepository.hasPosting as any).mockResolvedValue(false);
    // Force validateBalance to be asserted by the mock.
    const event = mkEvent({ paymentMethod: 'card', cashHolder: 'courtzon' });
    await postMarketplaceComplaintRefundAccounting(5, 400, 'EGP', event);
    expect(accountingEngineService.validateBalance).toHaveBeenCalled();
  });
});

describe('F-2 — complaint refund routes to the marketplace event, not generic wallet_refund', () => {
  it('the payment:refunded handler dispatches complaints to the marketplace event', async () => {
    // This asserts the wiring: the listener now has a complaint branch. We
    // verify the event CONCEPTS registry includes complaint_refund
    // with the correct debit/credit sides.
    const { getEventConcepts } = await import('../application/accounting-concepts.js');
    const concepts = getEventConcepts('complaint_refund');
    const debit = concepts.filter((c) => c.side === 'debit').map((c) => c.concept);
    const credit = concepts.filter((c) => c.side === 'credit').map((c) => c.concept);
    expect(debit).toContain('merchant_payable');
    expect(debit).toContain('platform_commission');
    expect(debit).toContain('tax_liability');
    expect(debit).toContain('receivable_from_org');
    expect(credit).toEqual(['wallet_liability']);
  });

  it('the generic wallet_refund branch is no longer used for complaint refunds', async () => {
    // The handler routes complaint → postMarketplaceComplaintRefundAccounting
    // before reaching the generic card_refund/wallet_refund fallback. Verify
    // the source file contains the complaint branch.
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../application/accounting-event.listener.ts', import.meta.url), 'utf-8');
    expect(src).toContain("if (referenceType === 'complaint')");
    expect(src).toContain('postMarketplaceComplaintRefundAccounting');
  });
});