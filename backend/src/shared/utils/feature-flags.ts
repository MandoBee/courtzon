const features = new Map<string, boolean>();

// All V2 feature flags are permanently enabled.
// The env-var override remains available for emergency rollback only.
const ALWAYS_ENABLED = new Set([
  'BOOKING_V2_CREATE', 'BOOKING_V2_CONFIRM', 'BOOKING_V2_COMPLETE',
  'BOOKING_V2_CANCEL', 'BOOKING_V2_EXPIRE',
  'PAYMENT_V2_PROCESS',
  'WALLET_V2_DEPOSIT', 'WALLET_V2_WITHDRAW',
  'SETTLEMENT_V2_APPROVE', 'SETTLEMENT_V2_COMPLETE',
  'SETTLEMENT_V2_REJECT', 'SETTLEMENT_V2_CANCEL',
  'NOTIFICATION_V2_DISPATCH',
]);

export function isFeatureEnabled(flag: string): boolean {
  if (features.has(flag)) return features.get(flag)!;
  if (ALWAYS_ENABLED.has(flag)) return true;
  return process.env[flag] === 'true';
}

export function setFeatureFlag(flag: string, enabled: boolean): void {
  features.set(flag, enabled);
}

export function resetFeatureFlags(): void {
  features.clear();
}
