export type WalletStatus = 'active' | 'locked';

export type TransactionType = 'deposit' | 'withdrawal' | 'payment' | 'refund' | 'commission' | 'settlement' | 'due' | 'penalty';

export type TransactionDirection = 'credit' | 'debit';

const LOW_BALANCE_THRESHOLD = 50;

export interface WalletRecord {
  id: number;
  user_id: number;
  balance: number;
  currency_code: string;
  is_locked: boolean;
  aggregate_version: number;
}

export interface BalanceUpdateRequest {
  type: TransactionType;
  direction: TransactionDirection;
  amount: number;
  currentBalance: number;
  currentVersion: number;
  isLocked: boolean;
}

export interface BalanceUpdateResult {
  newBalance: number;
  newVersion: number;
  didUpdate: boolean;
}

export function assertValidBalanceUpdate(request: BalanceUpdateRequest): void {
  if (request.amount <= 0) {
    throw new Error('Transaction amount must be positive');
  }
  if (request.isLocked) {
    throw new Error('Wallet is locked');
  }
  if (request.direction === 'debit' && request.currentBalance < request.amount) {
    throw new Error('Insufficient balance');
  }
}

export function planBalanceUpdate(request: BalanceUpdateRequest): BalanceUpdateResult {
  assertValidBalanceUpdate(request);
  const delta = request.direction === 'credit' ? request.amount : -request.amount;
  return {
    newBalance: request.currentBalance + delta,
    newVersion: request.currentVersion + 1,
    didUpdate: true,
  };
}

export function isLowBalance(balance: number, threshold: number = LOW_BALANCE_THRESHOLD): boolean {
  return balance < threshold;
}
