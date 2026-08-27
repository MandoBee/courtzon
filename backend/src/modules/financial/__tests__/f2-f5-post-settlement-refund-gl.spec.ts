import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F-2 × F-5 — Post-settlement complaint refund GL balance.
 *
 * Cross-fix regression: F-5 bounded recovery emits a payment:refunded event
 * whose orgAdjustment is the BOUNDED recovery amount (never more than the
 * settled org earning), so `orgAdjustment + commissionReversal` can be LESS
 * than the wallet refund. F-2's complaint_refund posting must remain balanced
 * in every case by booking the unrecoverable excess to `refund_expense`
 * (5220 Refund / Chargeback Costs), never silently dropping the GL reversal.
 *
 * The accounting event `complaint_refund` is:
 *   debit:  [merchant_payable, platform_commission, tax_liability,
 *            receivable_from_org, refund_expense]
 *   credit: [wallet_liability]
 *
 * Balance:
 *   CARD/WALLET: (orgAdj − tax) + commission + tax + excess = refundAmount
 *   where excess = max(0, refundAmount − orgAdjustment − commissionReversal).
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
import { getEventConcepts } from '../application/accounting-concepts.js';

const poolMock = (getPool as any)();

beforeEach(() => {
  vi.clearAllMocks();
  (ledgerRepository.hasPosting as any).mockResolvedValue(false);
  (ledgerRepository.createEntries as any).mockResolvedValue([1, 2, 3]);
  (getPool as any).mockReturnValue(poolMock);
  vi.spyOn(accountingEngineService, 'buildLedgerLines').mockImplementation(
    (eventType: string, mapping: any, conceptAmounts: Record<string, number>) =>
      (accountingEngineService.constructor.prototype as any).buildLedgerLines.call(accountingEngineService, eventType, mapping, conceptAmounts),
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

// A post-settlement complaint refund event: F-5 bounded recovery metadata.
// settled org earning 300, commission 100, refund 500 → orgAdjustment is the
// BOUNDED recovery (300), commissionReversal 100, wallet credit 500.
const mkPostSettlementEvent = (overrides: any = {}) => ({
  referenceType: 'complaint',
  referenceId: 5,
  amount: 500,
  currency: 'EGP',
  metadata: {
    complaintId: 5,
    itemId: 200,
    organisationId: 500,
    paymentMethod: 'card',
    cashHolder: 'courtzon',
    orderTax: 0,
    itemTax: 0,
    originalOrgEarning: 300,
    commissionReversal: 100,
    orgAdjustment: 300,
    settledRecovery: true,
    settledOrgEarning: 300,
    ...overrides,
  },
});

describe('F-2 × F-5 — post-settlement complaint refund GL stays balanced', () => {
  it('bounded recovery with refund > recoverable economics posts balanced GL (excess → refund_expense)', async () => {
    (ledgerRepository.hasPosting as any).mockResolvedValue(false);
    await postMarketplaceComplaintRefundAccounting(5, 500, 'EGP', mkPostSettlementEvent());

    const calls = (accountingEngineService.buildLedgerLines as any).mock.calls;
    const conceptAmounts = calls[0][2] as Record<string, number>;
    // merchant_payable = orgAdjustment − tax = 300; commission 100; excess = 500−300−100 = 100.
    expect(conceptAmounts.merchant_payable).toBe(300);
    expect(conceptAmounts.platform_commission).toBe(100);
    expect(conceptAmounts.tax_liability).toBe(0);
    expect(conceptAmounts.refund_expense).toBe(100);
    expect(conceptAmounts.wallet_liability).toBe(500);
    // Debits = 300 + 100 + 0 + 100 = 500 = Credits → balanced.
    expect(accountingEngineService.validateBalance).toHaveBeenCalled();
  });

  it('post-settlement refund <= settled + commission economics has NO excess (refund_expense 0)', async () => {
    // settled org 300 + commission 100, refund 400 → recoverable fully.
    await postMarketplaceComplaintRefundAccounting(5, 400, 'EGP', mkPostSettlementEvent({
      amount: 400,
      orgAdjustment: 300,
      commissionReversal: 100,
    }));
    const conceptAmounts = (accountingEngineService.buildLedgerLines as any).mock.calls[0][2] as Record<string, number>;
    expect(conceptAmounts.refund_expense).toBe(0);
    expect(conceptAmounts.merchant_payable).toBe(300);
    expect(conceptAmounts.platform_commission).toBe(100);
    expect(conceptAmounts.wallet_liability).toBe(400);
  });

  it('WALLET custody behaves identically (excess → refund_expense, balanced)', async () => {
    await postMarketplaceComplaintRefundAccounting(5, 500, 'EGP', mkPostSettlementEvent({ paymentMethod: 'wallet' }));
    const conceptAmounts = (accountingEngineService.buildLedgerLines as any).mock.calls[0][2] as Record<string, number>;
    expect(conceptAmounts.wallet_liability).toBe(500);
    expect(conceptAmounts.refund_expense).toBe(100);
    expect(conceptAmounts.merchant_payable).toBe(300);
  });

  it('CARD post-settlement refund with non-zero tax keeps tax pass-through and stays balanced', async () => {
    // settled org earning 400 (tax-inclusive equivalent), itemTax 40,
    // refund 600, commission 100, bounded recovery 400.
    await postMarketplaceComplaintRefundAccounting(5, 600, 'EGP', mkPostSettlementEvent({
      amount: 600,
      originalOrgEarning: 400,
      settledOrgEarning: 400,
      itemTax: 40,
      orgAdjustment: 400,
      commissionReversal: 100,
    }));
    const conceptAmounts = (accountingEngineService.buildLedgerLines as any).mock.calls[0][2] as Record<string, number>;
    // taxReversal = 400 × (40/400) = 40; merchant_payable = 400 − 40 = 360;
    // excess = 600 − 400 − 100 = 100.
    expect(conceptAmounts.tax_liability).toBe(40);
    expect(conceptAmounts.merchant_payable).toBe(360);
    expect(conceptAmounts.refund_expense).toBe(100);
    expect(conceptAmounts.platform_commission).toBe(100);
    expect(conceptAmounts.wallet_liability).toBe(600);
    // Debits = 360 + 100 + 40 + 100 = 600 = Credits.
  });

  it('COD post-settlement refund stays balanced via receivable_from_org (no excess account)', async () => {
    await postMarketplaceComplaintRefundAccounting(5, 500, 'EGP', mkPostSettlementEvent({ paymentMethod: 'cash', cashHolder: 'org' }));
    const conceptAmounts = (accountingEngineService.buildLedgerLines as any).mock.calls[0][2] as Record<string, number>;
    // COD: Dr commission + tax + receivable(merchant share) / Cr wallet.
    expect(conceptAmounts.merchant_payable).toBeUndefined();
    expect(conceptAmounts.receivable_from_org).toBe(400); // 500 − 100 − 0
    expect(conceptAmounts.wallet_liability).toBe(500);
    expect(conceptAmounts.refund_expense).toBeUndefined();
  });

  it('excess is never negative — full-economics refund posts balanced with zero excess', async () => {
    // Pre-settlement-like balanced event: orgAdjustment + commission = refund.
    await postMarketplaceComplaintRefundAccounting(5, 400, 'EGP', mkPostSettlementEvent({
      amount: 400,
      orgAdjustment: 360,
      commissionReversal: 40,
      settledRecovery: false,
    }));
    const conceptAmounts = (accountingEngineService.buildLedgerLines as any).mock.calls[0][2] as Record<string, number>;
    expect(conceptAmounts.refund_expense).toBe(0);
    expect(conceptAmounts.merchant_payable).toBe(360);
    expect(conceptAmounts.platform_commission).toBe(40);
    expect(conceptAmounts.wallet_liability).toBe(400);
  });

  it('idempotent: skips when a complaint posting already exists (no second refund_expense)', async () => {
    (ledgerRepository.hasPosting as any).mockResolvedValue(true);
    await postMarketplaceComplaintRefundAccounting(5, 500, 'EGP', mkPostSettlementEvent());
    expect(accountingEngineService.buildLedgerLines).not.toHaveBeenCalled();
  });

  it('every successful refund posts a BALANCED complaint_refund event (invariant)', async () => {
    // Drive several scenarios through the real validateBalance via a spy that
    // throws if unbalanced. postMarketplaceComplaintRefundAccounting calls
    // postAccountingEvent → validateBalance internally.
    const scenarios = [
      { amount: 500, orgAdj: 300, comm: 100, method: 'card', holder: 'courtzon' },
      { amount: 600, orgAdj: 400, comm: 100, method: 'wallet', holder: 'courtzon', tax: 40, orig: 400 },
      { amount: 400, orgAdj: 300, comm: 100, method: 'card', holder: 'courtzon' },
      { amount: 500, orgAdj: 300, comm: 100, method: 'cash', holder: 'org' },
    ];
    for (const s of scenarios) {
      (ledgerRepository.hasPosting as any).mockResolvedValue(false);
      (accountingEngineService.buildLedgerLines as any).mockClear();
      (accountingEngineService.validateBalance as any).mockClear();
      await postMarketplaceComplaintRefundAccounting(5, s.amount, 'EGP', mkPostSettlementEvent({
        amount: s.amount,
        orgAdjustment: s.orgAdj,
        commissionReversal: s.comm,
        paymentMethod: s.method,
        cashHolder: s.holder,
        ...(s.tax != null ? { itemTax: s.tax, originalOrgEarning: s.orig, settledOrgEarning: s.orig } : {}),
      }));
      // validateBalance is invoked by postAccountingEvent for every posting.
      expect(accountingEngineService.validateBalance).toHaveBeenCalled();
    }
  });
});

describe('F-2 × F-5 — concept registry and no generic fallback', () => {
  it('complaint_refund debit includes refund_expense; credit is only wallet_liability', () => {
    const concepts = getEventConcepts('complaint_refund');
    const debit = concepts.filter((c) => c.side === 'debit').map((c) => c.concept);
    const credit = concepts.filter((c) => c.side === 'credit').map((c) => c.concept);
    expect(debit).toContain('merchant_payable');
    expect(debit).toContain('platform_commission');
    expect(debit).toContain('tax_liability');
    expect(debit).toContain('receivable_from_org');
    expect(debit).toContain('refund_expense');
    expect(credit).toEqual(['wallet_liability']);
  });

  it('no generic wallet_refund (4300 revenue_contra) is used for complaint refunds', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../application/accounting-event.listener.ts', import.meta.url), 'utf-8');
    expect(src).toContain("if (referenceType === 'complaint')");
    expect(src).toContain('postMarketplaceComplaintRefundAccounting');
    // The complaint branch returns before reaching the generic wallet_refund fallback.
  });
});