import { nowMySql } from '../../../shared/utils/mysql-date.js';

export type AccountType =
  | 'platform_revenue' | 'club_revenue' | 'wallet_liability'
  | 'customer_balance' | 'tax' | 'discount' | 'commission'
  | 'receivable' | 'payable' | 'refund';

export type EntrySide = 'debit' | 'credit';

export type SourceType =
  | 'booking' | 'academy' | 'membership' | 'marketplace'
  | 'wallet' | 'subscription' | 'adjustment' | 'refund'
  | 'coupon' | 'commission' | 'settlement' | 'journal' | 'year_close' | 'year_close_reopen';

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
  eventType?: string;
  organisationId?: number | null;
  chartAccountId?: number | null;
  periodId?: number | null;
}

export interface LedgerLineInput {
  transactionId: string;
  sourceType: SourceType;
  sourceId: number;
  eventType: string;
  organisationId?: number | null;
  chartAccountId: number;
  side: EntrySide;
  amount: number;
  currency: string;
  description: string;
  referenceId?: string;
  periodId?: number | null;
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
  const now = nowMySql();
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

/**
 * Create ledger lines from resolved inputs (N-line postings).
 * Replaces createLedgerPair() for the new accounting-engine flow.
 */
export function createLedgerLines(inputs: LedgerLineInput[]): LedgerEntry[] {
  if (inputs.length === 0) throw new Error('At least one ledger line is required');
  const now = nowMySql();
  const entries: LedgerEntry[] = [];
  for (const input of inputs) {
    if (input.amount <= 0) throw new Error('Amount must be positive');
    entries.push({
      transactionId: input.transactionId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      accountType: 'platform_revenue', // deprecated — chart_account_id is canonical; column now nullable
      side: input.side,
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      referenceId: input.referenceId,
      recordedAt: now,
      eventType: input.eventType,
      organisationId: input.organisationId ?? null,
      chartAccountId: input.chartAccountId,
      periodId: input.periodId ?? null,
    });
  }
  return entries;
}

export type AccountClassification =
  | 'revenue'
  | 'contraRevenue'
  | 'expense'
  | 'asset'
  | 'liability'
  | 'other';

export const ACCOUNT_TYPE_CLASSIFICATION: Record<AccountType, AccountClassification> = {
  platform_revenue: 'revenue',
  club_revenue: 'revenue',
  wallet_liability: 'liability',
  customer_balance: 'liability',
  tax: 'other',
  discount: 'contraRevenue',
  commission: 'contraRevenue',
  receivable: 'asset',
  payable: 'liability',
  refund: 'contraRevenue',
};

export function classifyAccountType(accountType: string): AccountClassification {
  const coaMap: Record<string, AccountClassification> = {
    revenue: 'revenue', contra_revenue: 'contraRevenue',
    expense: 'expense', contra_expense: 'expense',
    asset: 'asset', contra_asset: 'asset',
    liability: 'liability', contra_liability: 'liability',
    equity: 'other',
  };
  if (coaMap[accountType]) return coaMap[accountType];
  return ACCOUNT_TYPE_CLASSIFICATION[accountType as AccountType] ?? 'other';
}

export interface RevenueGroupRow {
  account_type: string;
  side: string;
  total: number;
  count: number;
  classification: AccountClassification;
}

export interface RevenueSummary {
  revenue: number;
  reductions: number;
  expenses: number;
  netIncome: number;
  transactions: number;
  byAccount: RevenueGroupRow[];
}

export function buildRevenueSummary(
  groups: Array<{ account_type: string; side: string; total: number | string; count: number | string }>,
): RevenueSummary {
  const byAccount: RevenueGroupRow[] = groups.map((g) => ({
    account_type: g.account_type,
    side: g.side,
    total: Number(g.total),
    count: Number(g.count),
    classification: classifyAccountType(g.account_type),
  }));

  const signedTotal = (rows: RevenueGroupRow[], normalSide: 'credit' | 'debit') =>
    rows.reduce((sum, r) => sum + (r.side === normalSide ? r.total : -r.total), 0);

  const revenue = signedTotal(byAccount.filter((r) => r.classification === 'revenue'), 'credit');
  const reductions = signedTotal(byAccount.filter((r) => r.classification === 'contraRevenue'), 'debit');
  const operatingExpenses = signedTotal(byAccount.filter((r) => r.classification === 'expense'), 'debit');
  const expenses = reductions + operatingExpenses;
  const netIncome = revenue - expenses;
  const transactions = byAccount.reduce((sum, r) => sum + r.count, 0);

  return { revenue, reductions, expenses, netIncome, transactions, byAccount };
}
