-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- ---------------------------------------------------------------------------
-- 204_convergence_idx_status_enddate.sql
--
-- Roll-forward repair for the ONE convergence index that migration 203 did not
-- cover:
--
--   organisation_subscriptions.idx_status_enddate (subscription_status, end_date)
--       -> database/migrations/038_subscription_lifecycle.sql:8
--       -> database/baseline/001_courtzon_v3.sql:3670
--
-- Why a new file: 203 is already applied (and recorded in migration_history),
-- so editing it would only cause checksum drift — the runner never re-executes
-- an applied filename. This file is the additive roll-forward for databases
-- that were created before migration 038's index definition took effect.
--
-- This file is ADDITIVE and IDEMPOTENT:
--   * It never uses `ADD INDEX IF NOT EXISTS` (unsupported on MySQL 8.0).
--   * The ADD is guarded on information_schema.statistics using the same
--     prepared-statement pattern as 203_convergence_indexes.sql.
--   * No table, column, constraint, index or row is dropped or altered; the
--     only possible effect is creating an index that should already exist.
--   * It is a no-op on any database that already has the index.
--
-- FAILURE IS EXPLICIT: the guard skips ONLY when the index already exists. If
-- the table or either required column is missing, the ALTER still runs and
-- MySQL aborts with a clear "table/column doesn't exist" error. Because
-- scripts/migrate.sh runs each file without --force, the non-zero exit stops
-- the run, records a `failed` history event and disables automatic retry.
-- ---------------------------------------------------------------------------

SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics
                 WHERE table_schema = DATABASE()
                   AND table_name = 'organisation_subscriptions'
                   AND index_name = 'idx_status_enddate');
SET @sql := IF(@has_idx = 0,
  'ALTER TABLE `organisation_subscriptions` ADD INDEX `idx_status_enddate` (`subscription_status`, `end_date`)',
  'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
