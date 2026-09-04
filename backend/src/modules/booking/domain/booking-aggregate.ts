import type { Clock } from '../../../shared/utils/clock.js';
import { ConflictError } from '../../../shared/errors/app-error.js';

export type BookingStatus = 'pending' | 'pending_payment' | 'confirmed' | 'cancelled' | 'expired' | 'completed' | 'checked_in' | 'no_show' | 'cancelled_with_fee';
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'partially_refunded' | 'penalty' | 'failed';

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'cancelled', 'expired'],
  pending_payment: ['confirmed', 'cancelled', 'expired'],
  confirmed: ['completed', 'cancelled', 'no_show', 'checked_in'],
  checked_in: ['completed', 'no_show'],
  cancelled: [],
  expired: [],
  completed: [],
  no_show: [],
  cancelled_with_fee: [],
};

export interface BookingRecord {
  booking_status: BookingStatus;
  aggregate_version: number;
  expires_at: Date | string | null;
}

export interface TransitionRequest {
  fromStatus: BookingStatus;
  toStatus: BookingStatus;
  currentVersion: number;
}

export interface TransitionResult {
  newVersion: number;
  didTransition: boolean;
}

export function assertValidTransition(from: BookingStatus, to: BookingStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new ConflictError(`Illegal booking state transition: ${from} → ${to}`);
  }
}

export function isTerminal(status: BookingStatus): boolean {
  return ['cancelled', 'expired', 'completed', 'no_show', 'cancelled_with_fee'].includes(status);
}

export function planTransition(request: TransitionRequest): TransitionResult {
  assertValidTransition(request.fromStatus, request.toStatus);
  return { newVersion: request.currentVersion + 1, didTransition: true };
}

export function canExpire(booking: BookingRecord, clock: Clock): void {
  if (booking.booking_status !== 'pending' && booking.booking_status !== 'pending_payment') {
    throw new Error(`Only pending/pending_payment bookings can expire. Current status: ${booking.booking_status}`);
  }
  if (!booking.expires_at) {
    throw new Error('Booking has no expiration time and cannot expire');
  }
  const expiresAt = new Date(booking.expires_at);
  const now = clock.now();
  if (now < expiresAt) {
    throw new Error(`Booking cannot expire yet. Expires at ${expiresAt.toISOString()}, current time ${now.toISOString()}`);
  }
}
