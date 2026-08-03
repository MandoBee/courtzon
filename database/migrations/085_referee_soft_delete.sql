-- 085_referee_soft_delete.sql
-- Add `deleted_at` to `referees` for consistency with `coach_profiles`
-- and the rest of the platform's soft-delete convention (August 2026).
--
-- All statements are idempotent (safe to re-run).

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referees' AND COLUMN_NAME = 'deleted_at');

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `referees` ADD COLUMN `deleted_at` timestamp NULL DEFAULT NULL AFTER `updated_at`',
  'SELECT ''referees.deleted_at already exists — skipping'' AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
