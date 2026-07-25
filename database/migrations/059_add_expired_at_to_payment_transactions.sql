-- Migration 059: Add expired_at column to payment_transactions
-- Used by payment expiry cron job in payment.service.ts
ALTER TABLE payment_transactions
  ADD COLUMN expired_at timestamp NULL DEFAULT NULL AFTER paid_at,
  ALGORITHM=INPLACE,
  LOCK=NONE;
