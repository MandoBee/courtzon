-- ============================================================================
-- COURTZON V3 : TOURNAMENT SCHEDULE CONFIGURATION (Group 4)
-- Adds the Tournament-level daily playing window (venue-local time).
--
-- Requirement: a Tournament declares explicit daily playing start/end times
-- (e.g. 09:00 – 21:00). This is the playing window for matches, NOT the
-- registration deadline (registration_closes already exists on `tournaments`).
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- (Machine-readable classification for backend/scripts/migration-guard.sh —
--  eligible in every environment.)
--
-- Design notes:
--   * Only the daily playing window is genuinely missing from the schema.
--     Registration deadline = `registration_closes` (timestamp) — exists.
--     Venue = `branch_id` (FK → branches, ON DELETE SET NULL) — exists.
--   * The window is stored as plain TIME values interpreted in the venue's
--     branch timezone (`branches.timezone`). NO second timezone mechanism is
--     introduced: branch timezone is authoritative when a branch is set.
--   * NULL = not configured (no playing-window restriction) — backward
--     compatible with all existing Tournament rows.
--   * Additive ONLY. No DROP/TRUNCATE/reset. No rewrite of existing rows.
-- ============================================================================

ALTER TABLE `tournaments`
  ADD COLUMN `daily_start_time` time DEFAULT NULL
  COMMENT 'Daily playing window start (venue-local time); NULL = not configured'
  AFTER `end_date`,
  ADD COLUMN `daily_end_time` time DEFAULT NULL
  COMMENT 'Daily playing window end (venue-local time); NULL = not configured'
  AFTER `daily_start_time`;