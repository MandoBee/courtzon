-- Migration: 024 — Time Engine Columns
-- Adds UTC timestamp and business_date columns to bookings and booking_intents.
-- These are the source of truth for all time operations.
-- Existing booking_date/start_time/end_time remain for backward compatibility.
--
-- Phase: 2 (Database)
-- Architecture: CourtZon Time Architecture v1.0

-- ============================================================
-- 1. Backfill helper: compute UTC date from booking_date + start_time + branch timezone
-- This is a temporary function; will be dropped after backfill is complete.
-- ============================================================

-- ============================================================
-- 2. Add columns to bookings (nullable for backfill)
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN `start_at_utc` timestamp NULL DEFAULT NULL COMMENT 'Absolute start time in UTC. Source of truth for all time operations.' AFTER `visibility`,
  ADD COLUMN `end_at_utc` timestamp NULL DEFAULT NULL COMMENT 'Absolute end time in UTC. Source of truth for all time operations.' AFTER `start_at_utc`,
  ADD COLUMN `business_date` date NULL DEFAULT NULL COMMENT 'The Business Day this booking belongs to. Resolved by OperatingHoursEngine.' AFTER `booking_date`,
  ADD INDEX `idx_bookings_start_at_utc` (`start_at_utc`),
  ADD INDEX `idx_bookings_business_date` (`business_date`);

-- ============================================================
-- 3. Add columns to booking_intents (nullable for backfill)
-- ============================================================

ALTER TABLE booking_intents
  ADD COLUMN `start_at_utc` timestamp NULL DEFAULT NULL COMMENT 'Absolute start time in UTC.' AFTER `end_time`,
  ADD COLUMN `end_at_utc` timestamp NULL DEFAULT NULL COMMENT 'Absolute end time in UTC.' AFTER `start_at_utc`,
  ADD COLUMN `business_date` date NULL DEFAULT NULL COMMENT 'The Business Day this intent belongs to.' AFTER `booking_date`,
  ADD INDEX `idx_booking_intents_start_at_utc` (`start_at_utc`),
  ADD INDEX `idx_booking_intents_business_date` (`business_date`);

-- ============================================================
-- Migration complete.
-- After this migration is applied, run:
--   node backend/scripts/backfill-time-columns.js
-- to populate start_at_utc, end_at_utc, and business_date for existing rows.
-- Then run the follow-up migration to make the columns NOT NULL.
-- ============================================================
