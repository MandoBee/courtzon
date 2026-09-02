-- 152_align_system_settings_schema.sql
-- Corrective, idempotent migration for databases whose `system_settings` table
-- diverged from the canonical repo baseline (observed on production).
--
-- Problem:
--   Production's `system_settings` was missing the columns `category`,
--   `value_type`, `is_public`, `is_editable`, `validation_rules`, `created_by`
--   and `updated_by` — columns that the application code
--   (SystemAdminPage -> /admin/settings/metadata) and migration 151
--   (marketplace complaint period) depend on. As a result:
--     * /admin/settings/metadata errored (Settings screen rendered empty), and
--     * migration 151's INSERT could not create the
--       marketplace.complaint_period_days row.
--
-- This migration:
--   1. Adds each missing column if and only if it does not already exist
--      (INFORMATION_SCHEMA pattern, identical to migration 096). No-op on
--      environments that already match the canonical schema (local dev,
--      fresh baseline imports).
--   2. Ensures the canonical admin-controlled complaint-period setting exists
--      (INSERT IGNORE — default 7 days). Safe to re-run.
--
-- Column types match the canonical baseline CREATE TABLE. No data is deleted;
-- existing rows receive the columns' defaults (category 'general',
-- value_type 'string', is_public 0, is_editable 1).

-- 1. category
SELECT COUNT(*) INTO @c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'category';
SET @sql = IF(@c = 0, 'ALTER TABLE system_settings ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT ''general'' AFTER `id`', 'SELECT 1 AS skipped');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2. value_type (canonical enum, matching the baseline)
SELECT COUNT(*) INTO @c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'value_type';
SET @sql = IF(@c = 0, 'ALTER TABLE system_settings ADD COLUMN value_type ENUM(''string'',''number'',''boolean'',''json'',''select'',''decimal'',''text'',''enum'') NOT NULL DEFAULT ''string'' AFTER `value`', 'SELECT 1 AS skipped');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 3. is_public
SELECT COUNT(*) INTO @c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'is_public';
SET @sql = IF(@c = 0, 'ALTER TABLE system_settings ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER `description`', 'SELECT 1 AS skipped');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 4. is_editable
SELECT COUNT(*) INTO @c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'is_editable';
SET @sql = IF(@c = 0, 'ALTER TABLE system_settings ADD COLUMN is_editable TINYINT(1) NOT NULL DEFAULT 1 AFTER `is_public`', 'SELECT 1 AS skipped');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 5. validation_rules
SELECT COUNT(*) INTO @c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'validation_rules';
SET @sql = IF(@c = 0, 'ALTER TABLE system_settings ADD COLUMN validation_rules JSON NULL AFTER `is_editable`', 'SELECT 1 AS skipped');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 6. created_by / 7. updated_by
SELECT COUNT(*) INTO @c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'created_by';
SET @sql = IF(@c = 0, 'ALTER TABLE system_settings ADD COLUMN created_by INT UNSIGNED NULL AFTER `created_at`', 'SELECT 1 AS skipped');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SELECT COUNT(*) INTO @c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'updated_by';
SET @sql = IF(@c = 0, 'ALTER TABLE system_settings ADD COLUMN updated_by INT UNSIGNED NULL AFTER `updated_at`', 'SELECT 1 AS skipped');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 8. Ensure the canonical complaint-period setting exists (default 7 days).
INSERT IGNORE INTO `system_settings`
  (`category`, `key`, `value`, `value_type`, `description`, `display_name`, `unit`,
   `min_value`, `help_text`, `sort_order`, `is_visible`, `is_editable`, `scope`)
VALUES
  ('marketplace',
   'marketplace.complaint_period_days',
   '7',
   'number',
   'Number of days after marketplace delivery during which the buyer can submit a complaint before the entitlement becomes available for settlement.',
   'Complaint Period',
   'days',
   '0',
   'Entitlements become settlement-eligible only after delivery + this many days. Set to 0 to disable the complaint window (immediate eligibility).',
   10,
   1,
   1,
   'global');