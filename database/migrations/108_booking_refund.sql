-- Migration 108: Booking partial refund tracking
-- Adds refunded_amount to bookings to bound multiple partial refunds.
-- Idempotent. Does NOT alter historical accounting records.

ALTER TABLE bookings
  ADD COLUMN refunded_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Cumulative refunded amount (economic gross incl. tax)' AFTER coach_amount;
