export type AccountType =
  | 'platform_revenue' | 'club_revenue' | 'wallet_liability'
  | 'customer_balance' | 'tax' | 'discount' | 'commission'
  | 'receivable' | 'payable' | 'refund';

export type EntrySide = 'debit' | 'credit';

export type SourceType =
  | 'booking' | 'academy' | 'membership' | 'marketplace'
  | 'wallet' | 'subscription' | 'adjustment' | 'refund'
  | 'coupon' | 'commission' | 'settlement';

export interface LedgerEntry {
  id?: number;
  transactionId: string;
  sourceType: SourceType;
  sourceId: number;
  accountType: AccountType;
  side: EntrySide;
  amount: number;
  currency: string;
  description: string;
  referenceId?: string;
  recordedAt: string;
}

export interface SettlementBatch {
  id?: number;
  batchType: 'daily' | 'weekly' | 'monthly' | 'manual';
  periodStart: string;
  periodEnd: string;
  grossAmount: number;
  discountAmount: number;
  taxAmount: number;
  commissionAmount: number;
  refundAmount: number;
  netAmount: number;
  status: 'pending' | 'completed' | 'failed';
  organisationId?: number;
  createdAt: string;
}

export interface CommissionRule {
  id?: number;
  entityType: 'booking' | 'academy' | 'marketplace' | 'membership';
  entityId?: number;
  rateType: 'fixed' | 'percentage' | 'tiered';
  rateValue: number;
  minAmount?: number;
  maxAmount?: number;
  isActive: boolean;
}

/**
 * Create a balanced pair of ledger entries.
 * Every transaction must have equal total debits and total credits.
 */
export function createLedgerPair(
  transactionId: string,
  sourceType: SourceType,
  sourceId: number,
  debitAccount: AccountType,
  creditAccount: AccountType,
  amount: number,
  currency: string,
  description: string,
): [LedgerEntry, LedgerEntry] {
  if (amount <= 0) throw new Error('Amount must be positive');
  const now = new Date().toISOString();
  return [
    { transactionId, sourceType, sourceId, accountType: debitAccount, side: 'debit', amount, currency, description, recordedAt: now },
    { transactionId, sourceType, sourceId, accountType: creditAccount, side: 'credit', amount, currency, description, recordedAt: now },
  ];
}

export function validateLedgerBalance(entries: LedgerEntry[]): boolean {
  const totalDebit = entries.filter(e => e.side === 'debit').reduce((s, e) => s + e.amount, 0);
  const totalCredit = entries.filter(e => e.side === 'credit').reduce((s, e) => s + e.amount, 0);
  return Math.abs(totalDebit - totalCredit) < 0.001;
}
