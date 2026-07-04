-- Migration 009: Extend booking intent lifecycle with retry tracking and failure categorization

-- Lifecycle state machine:
--   pending            → intent created, awaiting payment
--   payment_initiated  → gateway charge succeeded, user redirected to payment page
--   fulfilled          → payment confirmed, booking created
--   failed             → payment gateway rejected or connection failed
--   expired            → payment not completed before expiry
--   cancelled          → user explicitly cancelled

-- Retry tracking:
--   retry_of_intent_id → links a retry intent to the original failed intent
--   attempt_number     → 1-based attempt count (1 for first attempt, 2+ for retries)

-- Failure categorization:
--   failure_category   → machine-readable: gateway_unavailable, gateway_rejected, timeout
--   failure_reason     → human-readable detail (existing column)

ALTER TABLE booking_intents
  ADD COLUMN retry_of_intent_id INT UNSIGNED NULL DEFAULT NULL AFTER failure_reason,
  ADD COLUMN attempt_number INT UNSIGNED NOT NULL DEFAULT 1 AFTER retry_of_intent_id,
  ADD COLUMN failure_category VARCHAR(50) NULL DEFAULT NULL AFTER failure_reason,
  ADD INDEX idx_intent_retry_of (retry_of_intent_id),
  ADD INDEX idx_intent_failure_category (failure_category);
