-- Migration: 025 — Time Engine Columns NOT NULL
-- Makes start_at_utc, end_at_utc, business_date NOT NULL after backfill is complete.
-- Run this ONLY after node backend/scripts/backfill-time-columns.js has completed successfully.

ALTER TABLE bookings
  MODIFY COLUMN `start_at_utc` timestamp NOT NULL COMMENT 'Absolute start time in UTC.',
  MODIFY COLUMN `end_at_utc` timestamp NOT NULL COMMENT 'Absolute end time in UTC.',
  MODIFY COLUMN `business_date` date NOT NULL COMMENT 'The Business Day this booking belongs to.';

ALTER TABLE booking_intents
  MODIFY COLUMN `start_at_utc` timestamp NOT NULL COMMENT 'Absolute start time in UTC.',
  MODIFY COLUMN `end_at_utc` timestamp NOT NULL COMMENT 'Absolute end time in UTC.',
  MODIFY COLUMN `business_date` date NOT NULL COMMENT 'The Business Day this intent belongs to.';
