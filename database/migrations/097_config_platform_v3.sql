-- 097_config_platform_v3.sql
-- Configuration Platform V3: Dependencies, Profiles, Feature Flag

-- 1. Dependency engine columns (idempotent — skip if already exist)
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'depends_on';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN depends_on VARCHAR(100) DEFAULT NULL', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'depends_value';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN depends_value VARCHAR(200) DEFAULT NULL', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'depends_operator';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN depends_operator VARCHAR(10) DEFAULT "=="', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. Configuration Profiles
CREATE TABLE IF NOT EXISTS `configuration_profiles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `description` text DEFAULT NULL,
  `category` varchar(50) NOT NULL DEFAULT 'general',
  `scope` varchar(50) NOT NULL DEFAULT 'global',
  `profile_version` int NOT NULL DEFAULT 1,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cp_category` (`category`),
  KEY `idx_cp_scope` (`scope`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `configuration_profile_settings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `profile_id` int unsigned NOT NULL,
  `setting_key` varchar(100) NOT NULL,
  `setting_value` text NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_profile_setting` (`profile_id`,`setting_key`),
  CONSTRAINT `fk_cps_profile` FOREIGN KEY (`profile_id`) REFERENCES `configuration_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Feature flag for Configuration Profiles (disabled by default for MVP)
-- feature_flags uses `flag_key` (not `feature_key`) and requires label/module.
INSERT IGNORE INTO feature_flags (flag_key, label, description, module, is_enabled, is_system) VALUES ('config_profiles', 'Configuration Profiles', 'Create and apply reusable configuration profiles', 'system', 0, 0);
