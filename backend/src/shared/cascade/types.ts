import type { PoolConnection } from 'mysql2/promise';

/** Connection or pool for cascade SQL (supports transactions). */
export type CascadeExec = Pick<PoolConnection, 'execute' | 'query'>;

/** Booking statuses that should be cancelled when a parent entity is removed. */
export const CANCELLABLE_BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'checked_in',
] as const;
