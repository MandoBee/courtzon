-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- ---------------------------------------------------------------------------
-- 205_tournaments_max_events_check.sql
--
-- Formalizes the live-only CHECK constraint on tournaments.max_events_per_player
-- so every environment carries the same integrity rule:
--
--   chk_tournaments_max_events_per_player
--   CHECK ((max_events_per_player IS NULL) OR (max_events_per_player >= 1))
--
-- Provenance: migration 202 added the column and explicitly did NOT add a CHECK
-- (202_max_events_per_player.sql:8-11). The rule was later introduced outside
-- the migration chain and matches the application contract
-- (tournament.dto.ts: min(1).nullable()). This migration is the additive,
-- auditable registration of that rule.
--
-- This file is ADDITIVE and IDEMPOTENT:
--   * It never drops, renames or modifies an existing constraint.
--   * The ADD is guarded on information_schema.table_constraints joined to
--     information_schema.check_constraints, using the same prepared-statement
--     pattern as 203/204.
--   * It is a no-op on any database that already has the named CHECK.
--   * No table row or column is modified.
--
-- FAILURE IS EXPLICIT: the guard skips ONLY when the named CHECK already
-- exists. If the table or the required column is missing, the ALTER still runs
-- and MySQL aborts with a clear "table/column doesn't exist" error. Because
-- scripts/migrate.sh runs each file without --force, the non-zero exit stops
-- the run, records a failed history event and disables automatic retry.
-- ---------------------------------------------------------------------------

SET @has_chk := (SELECT COUNT(*)
                 FROM information_schema.table_constraints tc
                 JOIN information_schema.check_constraints cc
                   ON cc.constraint_schema = tc.constraint_schema
                  AND cc.constraint_name = tc.constraint_name
                 WHERE tc.constraint_schema = DATABASE()
                   AND tc.table_name = 'tournaments'
                   AND tc.constraint_type = 'CHECK'
                   AND tc.constraint_name = 'chk_tournaments_max_events_per_player');
SET @sql := IF(@has_chk = 0,
  'ALTER TABLE `tournaments` ADD CONSTRAINT `chk_tournaments_max_events_per_player` CHECK ((max_events_per_player IS NULL) OR (max_events_per_player >= 1))',
  'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
