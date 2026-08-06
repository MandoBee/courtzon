-- Migration 096: Settings Metadata V2 — Add self-describing metadata columns to system_settings
-- Also seeds metadata for the 15 configurable business rule settings from migration 095.
-- Idempotent: uses INFORMATION_SCHEMA to skip already-existing columns.

/* =========================================================================
   ADD METADATA COLUMNS (idempotent — skips if already exist)
   ========================================================================= */

-- display_name
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'display_name';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN display_name VARCHAR(200) DEFAULT NULL AFTER `description`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- unit
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'unit';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN unit VARCHAR(50) DEFAULT NULL AFTER `display_name`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- min_value
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'min_value';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN min_value VARCHAR(50) DEFAULT NULL AFTER `unit`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- max_value
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'max_value';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN max_value VARCHAR(50) DEFAULT NULL AFTER `min_value`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- allowed_values
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'allowed_values';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN allowed_values TEXT DEFAULT NULL AFTER `max_value`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- placeholder
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'placeholder';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN placeholder VARCHAR(200) DEFAULT NULL AFTER `allowed_values`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- help_text
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'help_text';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN help_text TEXT DEFAULT NULL AFTER `placeholder`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sort_order
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'sort_order';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER `help_text`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- is_visible
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'is_visible';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN is_visible TINYINT(1) NOT NULL DEFAULT 1 AFTER `sort_order`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- is_required
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'is_required';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN is_required TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_visible`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- scope
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'scope';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN scope VARCHAR(50) NOT NULL DEFAULT "global" AFTER `is_required`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- restart_policy
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'restart_policy';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN restart_policy VARCHAR(50) DEFAULT NULL AFTER `scope`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- feature_flag
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'feature_flag';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN feature_flag VARCHAR(100) DEFAULT NULL AFTER `restart_policy`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- setting_version
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'setting_version';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN setting_version INT NOT NULL DEFAULT 1 AFTER `feature_flag`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

/* =========================================================================
   Extend value_type ENUM to support 'decimal', 'text', 'enum'
   ========================================================================= */
ALTER TABLE system_settings MODIFY COLUMN value_type ENUM('string','number','boolean','json','select','decimal','text','enum') NOT NULL DEFAULT 'string';

/* =========================================================================
   Ensure category and value_type exist (may be missing depending on baseline)
   ========================================================================= */
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'category';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT "general" AFTER `id`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'value_type';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN value_type VARCHAR(20) NOT NULL DEFAULT "string" AFTER `value`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'is_public';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER `description`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'is_editable';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN is_editable TINYINT(1) NOT NULL DEFAULT 1 AFTER `is_public`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'validation_rules';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN validation_rules JSON NULL AFTER `is_editable`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'created_by';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN created_by INT UNSIGNED NULL AFTER `created_at`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'updated_by';
SET @sql = IF(@col_exists = 0, 'ALTER TABLE system_settings ADD COLUMN updated_by INT UNSIGNED NULL AFTER `updated_at`', 'SELECT 1 AS skipped');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

/* =========================================================================
   SEED METADATA for the 15 business-rule settings from migration 095
   ========================================================================= */

UPDATE system_settings SET display_name = 'Withdrawal SLA', value_type = 'number', unit = 'hours', category = 'wallet', min_value = '1', max_value = '168', sort_order = 10, help_text = 'Maximum time in hours to process withdrawal requests before SLA breach', scope = 'wallet' WHERE `key` = 'wallet.withdrawal_sla_hours';

UPDATE system_settings SET display_name = 'Max Login Attempts', value_type = 'number', unit = 'attempts', category = 'security', min_value = '1', max_value = '20', sort_order = 10, help_text = 'Number of failed login attempts before account lockout', scope = 'security' WHERE `key` = 'security.max_login_attempts';

UPDATE system_settings SET display_name = 'Lockout Duration', value_type = 'number', unit = 'minutes', category = 'security', min_value = '1', max_value = '1440', sort_order = 20, help_text = 'Duration in minutes that an account remains locked after exceeding max login attempts', scope = 'security' WHERE `key` = 'security.lockout_duration_minutes';

UPDATE system_settings SET display_name = 'Brute Force Window', value_type = 'number', unit = 'minutes', category = 'security', min_value = '1', max_value = '60', sort_order = 30, help_text = 'Rolling window in minutes for counting failed login attempts', scope = 'security' WHERE `key` = 'security.brute_force_window_minutes';

UPDATE system_settings SET display_name = 'Password Min Length', value_type = 'number', unit = 'characters', category = 'security', min_value = '4', max_value = '64', sort_order = 40, help_text = 'Minimum password length required for new passwords', scope = 'security' WHERE `key` = 'security.password_min_length';

UPDATE system_settings SET display_name = 'Password Reset Expiry', value_type = 'number', unit = 'minutes', category = 'security', min_value = '5', max_value = '10080', sort_order = 50, help_text = 'Password reset token expiry time in minutes', scope = 'security' WHERE `key` = 'security.password_reset_expiry_minutes';

UPDATE system_settings SET display_name = 'Payment Expiry', value_type = 'number', unit = 'minutes', category = 'booking', min_value = '1', max_value = '60', sort_order = 10, help_text = 'Time window in minutes to complete payment before auto-cancellation', scope = 'booking' WHERE `key` = 'booking.payment_expiry_minutes';

UPDATE system_settings SET display_name = 'Prepare Session TTL', value_type = 'number', unit = 'minutes', category = 'booking', min_value = '1', max_value = '60', sort_order = 20, help_text = 'Booking prepare session TTL in minutes', scope = 'booking' WHERE `key` = 'booking.prepare_ttl_minutes';

UPDATE system_settings SET display_name = 'Min Billable Minutes', value_type = 'number', unit = 'minutes', category = 'booking', min_value = '5', max_value = '480', sort_order = 30, help_text = 'Minimum billable duration in minutes for any booking', scope = 'booking' WHERE `key` = 'booking.min_billable_minutes';

UPDATE system_settings SET display_name = 'Low Balance Threshold', value_type = 'number', unit = 'currency', category = 'wallet', min_value = '0', max_value = '10000', sort_order = 20, help_text = 'Wallet balance below which a low-balance notification is triggered', scope = 'wallet' WHERE `key` = 'wallet.low_balance_threshold';

UPDATE system_settings SET display_name = 'Default Commission', value_type = 'number', unit = 'percent', category = 'platform', min_value = '0', max_value = '100', sort_order = 10, help_text = 'Default platform commission percentage when no plan rate exists', scope = 'platform' WHERE `key` = 'platform.default_commission_percent';

UPDATE system_settings SET display_name = 'Booking Reminder Offset', value_type = 'number', unit = 'minutes', category = 'notifications', min_value = '5', max_value = '1440', sort_order = 10, help_text = 'Minutes before booking start to send reminder notification', feature_flag = 'notifications.enabled' WHERE `key` = 'notifications.booking_reminder_offset_minutes';

UPDATE system_settings SET display_name = 'Review Reminder Offset', value_type = 'number', unit = 'hours', category = 'notifications', min_value = '1', max_value = '168', sort_order = 20, help_text = 'Hours after session completion to send review reminder', feature_flag = 'notifications.enabled' WHERE `key` = 'notifications.review_reminder_offset_hours';

UPDATE system_settings SET display_name = 'Membership Reminder Days', value_type = 'number', unit = 'days', category = 'notifications', min_value = '1', max_value = '365', sort_order = 30, help_text = 'Days before membership expiry to send reminder', feature_flag = 'notifications.enabled' WHERE `key` = 'notifications.membership_reminder_days';

UPDATE system_settings SET display_name = 'Max File Upload Size', value_type = 'number', unit = 'MB', category = 'upload', min_value = '1', max_value = '100', sort_order = 10, help_text = 'Maximum allowed file upload size in megabytes', scope = 'upload' WHERE `key` = 'upload.max_file_size_mb';

/* =========================================================================
   Also set metadata for existing core settings (baseline + 019 seeds)
   ========================================================================= */
UPDATE system_settings SET display_name = 'App Name', value_type = 'string', category = 'general', sort_order = 10, scope = 'platform' WHERE `key` = 'app.name';

UPDATE system_settings SET display_name = 'Support Email', value_type = 'string', category = 'general', sort_order = 20, scope = 'platform' WHERE `key` = 'app.support_email';

UPDATE system_settings SET display_name = 'Support Phone', value_type = 'string', category = 'general', sort_order = 30 WHERE `key` = 'app.support_phone';

UPDATE system_settings SET display_name = 'Privacy URL', value_type = 'string', category = 'general', sort_order = 40, is_visible = 0 WHERE `key` = 'app.privacy_url';

UPDATE system_settings SET display_name = 'Terms URL', value_type = 'string', category = 'general', sort_order = 50, is_visible = 0 WHERE `key` = 'app.terms_url';

UPDATE system_settings SET display_name = 'Maintenance Mode', value_type = 'boolean', category = 'general', sort_order = 60, scope = 'platform' WHERE `key` = 'app.maintenance_mode';

UPDATE system_settings SET display_name = 'Default Language', value_type = 'enum', allowed_values = 'en,ar,fr', category = 'localization', sort_order = 10, scope = 'platform' WHERE `key` = 'default_language';

UPDATE system_settings SET display_name = 'Supported Languages', value_type = 'json', category = 'localization', sort_order = 20, is_visible = 0 WHERE `key` = 'supported_languages';

UPDATE system_settings SET display_name = 'Timezone', value_type = 'string', category = 'localization', sort_order = 30, scope = 'platform' WHERE `key` = 'timezone';

UPDATE system_settings SET display_name = 'Date Format', value_type = 'enum', allowed_values = 'YYYY-MM-DD,DD/MM/YYYY,MM/DD/YYYY', category = 'localization', sort_order = 40, scope = 'platform' WHERE `key` = 'date_format';

UPDATE system_settings SET display_name = 'Time Format', value_type = 'enum', allowed_values = 'HH:mm,hh:mm A', category = 'localization', sort_order = 50 WHERE `key` = 'time_format';

UPDATE system_settings SET display_name = 'Week Start', value_type = 'enum', allowed_values = 'saturday,sunday,monday', category = 'localization', sort_order = 60 WHERE `key` = 'week_start';

UPDATE system_settings SET display_name = 'Default Slot Duration', value_type = 'number', unit = 'minutes', category = 'booking', min_value = '15', max_value = '480', sort_order = 40, scope = 'booking' WHERE `key` = 'default_slot_duration';

UPDATE system_settings SET display_name = 'Advance Booking Days', value_type = 'number', unit = 'days', category = 'booking', min_value = '1', max_value = '365', sort_order = 50, scope = 'booking' WHERE `key` = 'advance_booking_days';

UPDATE system_settings SET display_name = 'Cancellation Window', value_type = 'number', unit = 'minutes', category = 'booking', min_value = '0', max_value = '1440', sort_order = 60, scope = 'booking' WHERE `key` = 'cancellation_window_minutes';

UPDATE system_settings SET display_name = 'No-Show Timeout', value_type = 'number', unit = 'minutes', category = 'booking', min_value = '1', max_value = '120', sort_order = 70, scope = 'booking' WHERE `key` = 'no_show_timeout_minutes';

UPDATE system_settings SET display_name = 'Auto Confirm', value_type = 'boolean', category = 'booking', sort_order = 80, is_visible = 0 WHERE `key` = 'auto_confirm';

UPDATE system_settings SET display_name = 'Buffer Minutes', value_type = 'number', unit = 'minutes', category = 'booking', min_value = '0', max_value = '120', sort_order = 90, scope = 'booking' WHERE `key` = 'buffer_minutes';

UPDATE system_settings SET display_name = 'Grace Period', value_type = 'number', unit = 'minutes', category = 'booking', min_value = '0', max_value = '60', sort_order = 100, scope = 'booking' WHERE `key` = 'grace_period_minutes';

UPDATE system_settings SET display_name = 'Default Currency', value_type = 'string', category = 'payments', sort_order = 10, is_visible = 0 WHERE `key` = 'default_currency';

UPDATE system_settings SET display_name = 'Currency Symbol', value_type = 'string', category = 'payments', sort_order = 20, is_visible = 0 WHERE `key` = 'currency_symbol';

UPDATE system_settings SET display_name = 'Decimal Precision', value_type = 'number', unit = 'places', category = 'payments', min_value = '0', max_value = '4', sort_order = 30, is_visible = 0 WHERE `key` = 'decimal_precision';

UPDATE system_settings SET display_name = 'Tax Enabled', value_type = 'boolean', category = 'payments', sort_order = 40 WHERE `key` = 'tax_enabled';

UPDATE system_settings SET display_name = 'Tax Percentage', value_type = 'number', unit = 'percent', category = 'payments', min_value = '0', max_value = '100', sort_order = 50 WHERE `key` = 'tax_percentage';

UPDATE system_settings SET display_name = 'Invoice Prefix', value_type = 'string', category = 'payments', sort_order = 60, is_visible = 0 WHERE `key` = 'invoice_prefix';

UPDATE system_settings SET display_name = 'Session Timeout', value_type = 'number', unit = 'minutes', category = 'security', min_value = '5', max_value = '1440', sort_order = 60, scope = 'security' WHERE `key` = 'session_timeout_minutes';

UPDATE system_settings SET display_name = 'JWT Expiration', value_type = 'number', unit = 'hours', category = 'security', min_value = '1', max_value = '720', sort_order = 70, is_visible = 0 WHERE `key` = 'jwt_expiration_hours';

UPDATE system_settings SET display_name = 'Registration Enabled', value_type = 'boolean', category = 'platform', sort_order = 20, scope = 'platform' WHERE `key` = 'registration_enabled';

UPDATE system_settings SET display_name = 'Public Booking Enabled', value_type = 'boolean', category = 'platform', sort_order = 30, scope = 'platform' WHERE `key` = 'public_booking_enabled';

UPDATE system_settings SET display_name = 'Debug Mode', value_type = 'boolean', category = 'platform', sort_order = 40, is_visible = 0 WHERE `key` = 'debug_mode';
