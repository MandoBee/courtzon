import { describe, it, expect } from 'vitest';
import { createLedgerPair, validateLedgerBalance } from '../domain/ledger-aggregate.js';

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
