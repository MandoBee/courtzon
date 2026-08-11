import { describe, it, expect } from 'vitest';
import { createLedgerPair, validateLedgerBalance, classifyAccountType, buildRevenueSummary } from '../domain/ledger-aggregate.js';

describe('Ledger Aggregate', () => {
  it('creates balanced debit/credit pair', () => {
    const [debit, credit] = createLedgerPair('tx-1', 'booking', 1, 'platform_revenue', 'club_revenue', 100, 'EGP', 'Test');
    expect(debit.side).toBe('debit');
    expect(debit.amount).toBe(100);
    expect(credit.side).toBe('credit');
    expect(credit.amount).toBe(100);
    expect(debit.transactionId).toBe('tx-1');
    expect(credit.transactionId).toBe('tx-1');
  });

  it('validates balanced entries', () => {
    const entries = [
      { transactionId: '1', sourceType: 'booking' as const, sourceId: 1, accountType: 'platform_revenue' as const, side: 'debit' as const, amount: 100, currency: 'EGP', description: '', recordedAt: '' },
      { transactionId: '1', sourceType: 'booking' as const, sourceId: 1, accountType: 'club_revenue' as const, side: 'credit' as const, amount: 100, currency: 'EGP', description: '', recordedAt: '' },
    ];
    expect(validateLedgerBalance(entries)).toBe(true);
  });

  it('rejects unbalanced entries', () => {
    const entries = [
      { transactionId: '1', sourceType: 'booking' as const, sourceId: 1, accountType: 'platform_revenue' as const, side: 'debit' as const, amount: 100, currency: 'EGP', description: '', recordedAt: '' },
      { transactionId: '1', sourceType: 'booking' as const, sourceId: 1, accountType: 'club_revenue' as const, side: 'credit' as const, amount: 50, currency: 'EGP', description: '', recordedAt: '' },
    ];
    expect(validateLedgerBalance(entries)).toBe(false);
  });

  it('rejects zero or negative amount', () => {
    expect(() => createLedgerPair('tx-2', 'refund', 1, 'refund', 'customer_balance', 0, 'EGP', 'Test')).toThrow();
    expect(() => createLedgerPair('tx-3', 'refund', 1, 'refund', 'customer_balance', -10, 'EGP', 'Test')).toThrow();
  });
});

describe('Account classification (Revenue Summary)', () => {
  it('classifies platform/club revenue as revenue', () => {
    expect(classifyAccountType('platform_revenue')).toBe('revenue');
    expect(classifyAccountType('club_revenue')).toBe('revenue');
  });

  it('classifies discounts, commissions and refunds as contra-revenue', () => {
    expect(classifyAccountType('discount')).toBe('contraRevenue');
    expect(classifyAccountType('commission')).toBe('contraRevenue');
    expect(classifyAccountType('refund')).toBe('contraRevenue');
  });

  it('classifies wallet/balance/payable as liability and receivable as asset', () => {
    expect(classifyAccountType('wallet_liability')).toBe('liability');
    expect(classifyAccountType('customer_balance')).toBe('liability');
    expect(classifyAccountType('payable')).toBe('liability');
    expect(classifyAccountType('receivable')).toBe('asset');
  });

  it('treats tax and unknown types as other', () => {
    expect(classifyAccountType('tax')).toBe('other');
    expect(classifyAccountType('mystery')).toBe('other');
  });

  it('builds a revenue summary: net = revenue - reductions', () => {
    const summary = buildRevenueSummary([
      { account_type: 'platform_revenue', side: 'credit', total: 1000, count: 5 },
      { account_type: 'discount', side: 'debit', total: 100, count: 1 },
      { account_type: 'commission', side: 'debit', total: 50, count: 1 },
    ]);
    expect(summary.revenue).toBe(1000);
    expect(summary.reductions).toBe(150);
    expect(summary.expenses).toBe(150);
    expect(summary.netIncome).toBe(850);
    expect(summary.transactions).toBe(7);
    expect(summary.byAccount).toHaveLength(3);
  });

  it('keeps wallet liability out of revenue and expenses (wallet top-up semantics)', () => {
    const summary = buildRevenueSummary([
      { account_type: 'wallet_liability', side: 'credit', total: 500, count: 2 },
    ]);
    expect(summary.revenue).toBe(0);
    expect(summary.netIncome).toBe(0);
    expect(summary.expenses).toBe(0);
    expect(summary.transactions).toBe(2);
  });
});
