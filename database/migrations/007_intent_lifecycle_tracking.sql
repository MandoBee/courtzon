-- Migration 007: Add explicit intent lifecycle tracking
-- Provides observability, debugging, audit history, and reporting for booking intents.
-- Statuses: pending (default), fulfilled (booking created), expired (timeout), failed (payment failed).

ALTER TABLE booking_intents
  ADD COLUMN intent_status VARCHAR(20) NOT NULL DEFAULT 'pending' AFTER fulfilled_booking_id,
  ADD COLUMN fulfilled_at DATETIME NULL DEFAULT NULL AFTER intent_status,
  ADD COLUMN failure_reason VARCHAR(255) NULL DEFAULT NULL AFTER fulfilled_at,
  ADD INDEX idx_intent_status (intent_status);
