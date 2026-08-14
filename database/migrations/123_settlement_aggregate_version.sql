-- Migration 123: Add aggregate_version to settlements for optimistic concurrency
-- The V2 settlement aggregate (persistTransition) requires aggregate_version for
-- optimistic locking, but the column was never added (unlike bookings=050,
-- payment_transactions=051). Without it, approve/complete/reject/cancel fail with
-- ER_BAD_FIELD_ERROR: Unknown column 'aggregate_version'.
ALTER TABLE settlements
  ADD COLUMN aggregate_version INT UNSIGNED NOT NULL DEFAULT 1
  AFTER settlement_status,
  ALGORITHM=INPLACE,
  LOCK=NONE;

UPDATE settlements SET aggregate_version = 1 WHERE aggregate_version = 0;
