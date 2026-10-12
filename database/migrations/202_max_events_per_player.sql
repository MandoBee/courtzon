-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- Phase 3 — per-player event limit per tournament.
--
-- NULL = unlimited (default). No NOT NULL / non-null default is imposed so
-- existing rows (and tournaments created before this setting existed) remain
-- unlimited — backward compatible by construction.
--
-- Enforced ONLY at registration time; lowering the limit never deletes or
-- cancels existing registrations. No CHECK constraint: this baseline's dump
-- style does not carry CHECK constraints, and the application DTO/service
-- already enforce `max_events_per_player >= 1` when non-null.
ALTER TABLE `tournaments`
  ADD COLUMN `max_events_per_player` int unsigned DEFAULT NULL
    COMMENT 'Max events a player may enter in this tournament; NULL = unlimited (default)'
  AFTER `max_teams`;