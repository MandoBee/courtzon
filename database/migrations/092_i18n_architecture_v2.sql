-- 092_i18n_architecture_v2.sql
-- i18n Architecture V2: is_deprecated column, ON DUPLICATE KEY UPDATE ready
--
-- Adds is_deprecated flag to translation_keys for key lifecycle management.

ALTER TABLE `translation_keys`
  ADD COLUMN `is_deprecated` tinyint(1) NOT NULL DEFAULT 0 AFTER `component_path`,
  ADD INDEX `idx_tk_deprecated` (`is_deprecated`);
