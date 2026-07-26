export const BOOKING_STATUSES = [
  'pending',
  'pending_payment',
  'confirmed',
  'cancelled',
  'completed',
  'expired',
  'no-show',
  'check-in',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];
