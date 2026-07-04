-- Migration 006: Add fulfilled_booking_id to booking_intents
-- Enables idempotent webhook fulfillment while allowing frontend to poll for the result.
-- Intents are no longer deleted after fulfillment; they persist with a reference to the created booking.

ALTER TABLE booking_intents
  ADD COLUMN fulfilled_booking_id INT UNSIGNED NULL DEFAULT NULL AFTER expires_at,
  ADD INDEX idx_fulfilled_booking (fulfilled_booking_id);
