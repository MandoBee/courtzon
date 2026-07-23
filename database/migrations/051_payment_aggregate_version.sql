-- Migration 051: Add aggregate_version to payment_transactions for optimistic concurrency
ALTER TABLE payment_transactions
  ADD COLUMN aggregate_version INT UNSIGNED NOT NULL DEFAULT 1
  AFTER payment_status,
  ALGORITHM=INPLACE,
  LOCK=NONE;

UPDATE payment_transactions SET aggregate_version = 1 WHERE aggregate_version = 0;
