export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled';

export type TransactionType = 'booking_payment' | 'wallet_topup' | 'refund' | 'payout' | 'marketplace_order' | 'withdrawal' | 'settlement_payout';

export type TransactionSide = 'debit' | 'credit';

export type EntityType = 'user_wallet' | 'platform_account' | 'branch';

const ALLOWED_WITHDRAWAL_TRANSITIONS: Record<WithdrawalStatus, WithdrawalStatus[]> = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['completed', 'cancelled'],
  rejected: [],
  completed: [],
  cancelled: [],
};

export interface WithdrawalRequestRecord {
  id: number;
  status: WithdrawalStatus;
  aggregate_version: number;
}

export function assertValidWithdrawalTransition(from: WithdrawalStatus, to: WithdrawalStatus): void {
  const allowed = ALLOWED_WITHDRAWAL_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Illegal withdrawal state transition: ${from} → ${to}`);
  }
}

export function planWithdrawalTransition(from: WithdrawalStatus, to: WithdrawalStatus, currentVersion: number): { newVersion: number } {
  assertValidWithdrawalTransition(from, to);
  return { newVersion: currentVersion + 1 };
}
