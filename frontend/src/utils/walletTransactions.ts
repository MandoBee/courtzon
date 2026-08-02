/**
 * Centralized Wallet Transaction classification & labelling.
 *
 * Single source of truth for how the UI decides whether a wallet transaction
 * is a credit (incoming money) or a debit (outgoing money), and how its
 * type is displayed.
 *
 * The authoritative direction comes from the backend: `direction` (alias for
 * `transaction_entries.side`, the double-entry ledger side). The UI NEVER
 * infers credit/debit from the amount sign alone. When the explicit direction
 * is missing (defensive fallback), it is derived from the transaction type via
 * a single centralized map.
 */

export type WalletTransactionDirection = 'credit' | 'debit';

export interface WalletTransaction {
  id?: number;
  type?: string;
  txn_type?: string;
  transaction_type?: string;
  direction?: string;
  side?: string;
  amount?: number | string;
  description?: string;
  created_at?: string;
}

/** Human-readable label per transaction type. */
export const WALLET_TRANSACTION_LABELS: Record<string, string> = {
  wallet_topup: 'Wallet Top-up',
  deposit: 'Wallet Top-up',
  booking_payment: 'Booking Payment',
  academy_payment: 'Academy Payment',
  academy: 'Academy Payment',
  marketplace_order: 'Marketplace Purchase',
  withdrawal: 'Withdrawal',
  refund: 'Refund',
  payout: 'Payout',
  settlement_payout: 'Settlement Payout',
  admin_credit: 'Admin Credit',
  admin: 'Admin Credit',
  promotional_credit: 'Promotional Credit',
  promo_credit: 'Promotional Credit',
  cashback: 'Cashback',
  reward: 'Reward',
  rewards: 'Rewards',
  penalty: 'Penalty',
  payment: 'Wallet Payment',
  commission: 'Commission',
};

/**
 * Fallback direction per transaction type, used ONLY when the backend does not
 * supply an explicit direction/side. Credits add money to the wallet; debits
 * remove money from it.
 */
export const WALLET_TRANSACTION_DIRECTION_BY_TYPE: Record<string, WalletTransactionDirection> = {
  wallet_topup: 'credit',
  deposit: 'credit',
  refund: 'credit',
  admin_credit: 'credit',
  admin: 'credit',
  promotional_credit: 'credit',
  promo_credit: 'credit',
  cashback: 'credit',
  reward: 'credit',
  rewards: 'credit',
  commission: 'credit',
  settlement_payout: 'credit',
  booking_payment: 'debit',
  academy_payment: 'debit',
  academy: 'debit',
  marketplace_order: 'debit',
  withdrawal: 'debit',
  penalty: 'debit',
  payout: 'debit',
  payment: 'debit',
};

/** Returns the transaction type from any of the field names the API may use. */
export function getWalletTransactionType(tx: WalletTransaction): string {
  return tx.type || tx.txn_type || tx.transaction_type || '';
}

/**
 * Returns the transaction direction.
 *
 * 1. Uses the explicit backend direction (`direction` / `side`).
 * 2. Falls back to the centralized type → direction map.
 * 3. Defaults to 'debit' (wallet transactions are predominantly spending).
 *
 * Never derives the direction from the amount sign.
 */
export function getWalletTransactionDirection(tx: WalletTransaction): WalletTransactionDirection {
  const explicit = tx.direction || tx.side;
  if (explicit === 'credit' || explicit === 'debit') return explicit;
  const type = getWalletTransactionType(tx);
  return WALLET_TRANSACTION_DIRECTION_BY_TYPE[type] || 'debit';
}

/** Returns a human-readable label for the transaction type. */
export function getWalletTransactionLabel(tx: WalletTransaction): string {
  const type = getWalletTransactionType(tx);
  if (!type) return 'Transaction';
  return WALLET_TRANSACTION_LABELS[type] || type.replace(/_/g, ' ');
}
