import type { PoolConnection } from 'mysql2/promise';

/** Subset of PoolConnection used for cascade SQL (supports Pool or PoolConnection). */
export type CascadeExec = Pick<PoolConnection, 'execute' | 'query'>;

/** Booking statuses that should be cancelled when a parent entity is removed. */
export const CANCELLABLE_BOOKING_STATUSES = [
  'pending',
  'pending_payment',
  'confirmed',
  'checked_in',
] as const;
