/** Payment methods not offered during signup (user has no wallet yet). */
export const REGISTRATION_EXCLUDED_PAYMENT_SLUGS = new Set(['wallet']);

/** Not valid for topping up a wallet (only card is allowed). */
export const WALLET_TOPUP_EXCLUDED_PAYMENT_SLUGS = new Set(['wallet', 'cash', 'bank_transfer', 'e-wallet', 'penalty']);

/** Contexts where cash is NOT available (online-only checkouts). */
const CASH_EXCLUDED_CONTEXTS = new Set(['wallet']);

export function isPaymentMethodAllowedAtRegistration(slug: string): boolean {
  return !REGISTRATION_EXCLUDED_PAYMENT_SLUGS.has(slug.trim().toLowerCase());
}

export function isPaymentMethodAllowedForWalletTopup(slug: string): boolean {
  return !WALLET_TOPUP_EXCLUDED_PAYMENT_SLUGS.has(slug.trim().toLowerCase());
}

/**
 * Whether a payment method is allowed for a given checkout context.
 * Booking and marketplace checkouts allow wallet, card, and cash.
 * Wallet top-up context only allows card.
 * Registration excludes wallet.
 */
export function isPaymentMethodAllowedInContext(slug: string, context: string): boolean {
  const s = slug.trim().toLowerCase();
  if (context === 'wallet') return isPaymentMethodAllowedForWalletTopup(s);
  if (context === 'booking' || context === 'marketplace' || context === 'checkout') {
    if (s === 'wallet' || s === 'card' || s === 'cash') return true;
    return false;
  }
  // Default: registration context — exclude wallet
  return isPaymentMethodAllowedAtRegistration(s);
}
