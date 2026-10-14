-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- ---------------------------------------------------------------------------
-- Phase 4 — schema convergence: restore the CANONICAL indexes that are defined
-- by earlier migrations but are not present on every existing database.
--
-- Root cause (read-only audit): the earlier definitions use statements whose
-- effect is not reliably applied on MySQL 8.0 (016 relies on
-- `ADD INDEX IF NOT EXISTS`, which is MariaDB-only syntax; 005/083 are plain
-- CREATE INDEX/KEY definitions that were recorded before those definitions
-- existed in the file, so no re-run ever created them).
--
--   notifications.idx_notifications_event
--       -> database/migrations/016_monitoring_alerts.sql:55
--       -> database/baseline/001_courtzon_v3.sql:3429
--   payment_transactions.idx_pt_status_created
--       -> database/migrations/005_payment_state_machine.sql:14
--   professional_services.idx_ps_pp
--       -> database/migrations/083_professional_services.sql:57
--
-- This file is ADDITIVE and IDEMPOTENT:
--   * It never uses `ADD INDEX IF NOT EXISTS` (unsupported on MySQL 8.0).
--   * Each ADD is guarded on information_schema — the same pattern already
--     used by 096_settings_metadata_v2.sql and 152_align_system_settings_schema.sql.
--   * No table, column, constraint, index or row is dropped or altered; the
--     only possible effect is creating an index that should already exist.
--   * It is a no-op on any database that already has the index.
-- ---------------------------------------------------------------------------

-- 1) notifications.idx_notifications_event (event_name)
SET @has_col := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'notifications' AND column_name = 'event_name');
SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics
                 WHERE table_schema = DATABASE() AND table_name = 'notifications' AND index_name = 'idx_notifications_event');
SET @sql := IF(@has_col = 1 AND @has_idx = 0,
  'ALTER TABLE `notifications` ADD INDEX `idx_notifications_event` (`event_name`)',
  'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) payment_transactions.idx_pt_status_created (payment_status, created_at)
SET @has_col := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'payment_transactions'
                   AND column_name IN ('payment_status', 'created_at'));
SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics
                 WHERE table_schema = DATABASE() AND table_name = 'payment_transactions' AND index_name = 'idx_pt_status_created');
SET @sql := IF(@has_col = 2 AND @has_idx = 0,
  'ALTER TABLE `payment_transactions` ADD INDEX `idx_pt_status_created` (`payment_status`, `created_at`)',
  'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) professional_services.idx_ps_pp (professional_profile_id)
SET @has_col := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'professional_services' AND column_name = 'professional_profile_id');
SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics
                 WHERE table_schema = DATABASE() AND table_name = 'professional_services' AND index_name = 'idx_ps_pp');
SET @sql := IF(@has_col = 1 AND @has_idx = 0,
  'ALTER TABLE `professional_services` ADD INDEX `idx_ps_pp` (`professional_profile_id`)',
  'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
