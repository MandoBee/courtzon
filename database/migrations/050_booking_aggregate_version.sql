-- Migration 050: Add aggregate_version to bookings for optimistic concurrency
ALTER TABLE bookings
  ADD COLUMN aggregate_version INT UNSIGNED NOT NULL DEFAULT 1
  AFTER booking_status,
  ALGORITHM=INPLACE,
  LOCK=NONE;

-- Initialize existing rows
UPDATE bookings SET aggregate_version = 1 WHERE aggregate_version = 0;
