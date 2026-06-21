/** Payment methods not offered during signup (user has no wallet yet). */
export const REGISTRATION_EXCLUDED_PAYMENT_SLUGS = new Set(['wallet']);

/** Not valid for topping up a wallet (only card is allowed). */
export const WALLET_TOPUP_EXCLUDED_PAYMENT_SLUGS = new Set(['wallet', 'cash', 'bank_transfer', 'e-wallet', 'penalty']);

export function isPaymentMethodAllowedAtRegistration(slug: string): boolean {
  return !REGISTRATION_EXCLUDED_PAYMENT_SLUGS.has(slug.trim().toLowerCase());
}

export function isPaymentMethodAllowedForWalletTopup(slug: string): boolean {
  return !WALLET_TOPUP_EXCLUDED_PAYMENT_SLUGS.has(slug.trim().toLowerCase());
}
