-- ============================================================================
-- COURTZON V3 : USER-FACING MATCH SIDE SELECTION (Group 3)
-- A joining player may request a preferred side; the request persists so the
-- approval step can revalidate it against the Match's authoritative format.
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- (Machine-readable classification for backend/scripts/migration-guard.sh —
--  eligible in every environment.)
--
-- Scope (Group 3 ONLY):
--   1. join_requests.requested_side — the side ('home' | 'away') a joining
--      player prefers. NULL = no preference (default assignment). Stored on
--      the request because approval may happen later and must revalidate the
--      choice against the Match's frozen format snapshot + current capacity.
--
-- OUT OF SCOPE (later groups): tournament draw/teams, rating, score UI,
-- result-card redesign, admin/org monitoring.
--
-- Design notes:
--   * Nullable — a player who does not care keeps NULL and receives the
--     domain default assignment (host-first fill).
--   * No destructive operation, no DROP/TRUNCATE. UAT fixtures 11/12/13 and
--     bookings 27/28/29 are untouched.
-- ============================================================================

ALTER TABLE `join_requests`
  ADD COLUMN `requested_side` enum('home','away') COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `status`;