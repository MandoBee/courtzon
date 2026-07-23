export type PaymentStatus = 'created' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded';

const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  created: ['pending', 'cancelled'],
  pending: ['paid', 'failed', 'cancelled', 'expired'],
  paid: ['refunded'],
  failed: [],
  cancelled: [],
  expired: [],
  refunded: [],
};

export interface PaymentRecord {
  payment_status: PaymentStatus;
  aggregate_version: number;
}

export interface TransitionRequest {
  fromStatus: PaymentStatus;
  toStatus: PaymentStatus;
  currentVersion: number;
}

export interface TransitionResult {
  newVersion: number;
  didTransition: boolean;
}

export function assertValidTransition(from: PaymentStatus, to: PaymentStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Illegal payment state transition: ${from} → ${to}`);
  }
}

export function isFinal(status: PaymentStatus): boolean {
  return ['paid', 'failed', 'cancelled', 'expired', 'refunded'].includes(status);
}

export function planTransition(request: TransitionRequest): TransitionResult {
  assertValidTransition(request.fromStatus, request.toStatus);
  return { newVersion: request.currentVersion + 1, didTransition: true };
}
