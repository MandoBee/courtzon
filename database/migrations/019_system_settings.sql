-- Migration 019: System Settings & Platform Configuration
-- Creates tables for centralized configuration management.

CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category` VARCHAR(50) NOT NULL,
  `key` VARCHAR(100) NOT NULL,
  `value` TEXT NULL,
  `value_type` ENUM('string', 'number', 'boolean', 'json', 'select') NOT NULL DEFAULT 'string',
  `description` TEXT NULL,
  `is_public` TINYINT(1) NOT NULL DEFAULT 0,
  `is_editable` TINYINT(1) NOT NULL DEFAULT 1,
  `validation_rules` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` INT UNSIGNED NULL,
  `updated_by` INT UNSIGNED NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_setting_key` (`key`),
  KEY `idx_setting_category` (`category`),
  KEY `idx_setting_public` (`is_public`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `application_settings_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `setting_key` VARCHAR(100) NOT NULL,
  `old_value` TEXT NULL,
  `new_value` TEXT NULL,
  `changed_by` INT UNSIGNED NULL,
  `request_id` VARCHAR(100) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_history_setting` (`setting_key`),
  KEY `idx_history_changed_by` (`changed_by`),
  KEY `idx_history_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default system settings
INSERT IGNORE INTO `system_settings` (`category`, `key`, `value`, `value_type`, `description`, `is_public`, `is_editable`) VALUES
('general', 'app.name', 'CourtZon', 'string', 'Application name displayed throughout the platform', 1, 1),
('general', 'app.support_email', 'support@courtzon.cloud', 'string', 'Support email address', 1, 1),
('general', 'app.support_phone', '', 'string', 'Support phone number', 0, 1),
('general', 'app.privacy_url', '', 'string', 'Privacy policy URL', 1, 1),
('general', 'app.terms_url', '', 'string', 'Terms of service URL', 1, 1),
('general', 'app.maintenance_mode', 'false', 'boolean', 'Enable maintenance mode to block public access', 0, 1),
('localization', 'default_language', 'en', 'select', 'Default system language', 1, 1),
('localization', 'supported_languages', '["en","ar"]', 'json', 'Languages available on the platform', 1, 1),
('localization', 'timezone', 'Africa/Cairo', 'string', 'Default timezone', 1, 1),
('localization', 'date_format', 'YYYY-MM-DD', 'select', 'Date display format', 1, 1),
('localization', 'time_format', 'HH:mm', 'select', 'Time display format', 1, 1),
('localization', 'week_start', 'saturday', 'select', 'First day of the week', 1, 1),
('booking', 'default_slot_duration', '60', 'number', 'Default booking slot duration in minutes', 1, 1),
('booking', 'advance_booking_days', '30', 'number', 'Maximum days in advance a booking can be made', 1, 1),
('booking', 'cancellation_window_minutes', '60', 'number', 'Minutes before booking start when cancellation is allowed', 1, 1),
('booking', 'no_show_timeout_minutes', '15', 'number', 'Minutes after booking start to mark as no-show', 1, 1),
('booking', 'auto_confirm', 'true', 'boolean', 'Automatically confirm bookings without payment', 0, 1),
('booking', 'buffer_minutes', '0', 'number', 'Buffer time between consecutive bookings', 1, 1),
('booking', 'grace_period_minutes', '5', 'number', 'Grace period for late arrival', 1, 1),
('payments', 'default_currency', 'EGP', 'string', 'Default currency code', 1, 1),
('payments', 'currency_symbol', 'E£', 'string', 'Default currency symbol', 1, 1),
('payments', 'decimal_precision', '2', 'number', 'Number of decimal places for monetary values', 1, 1),
('payments', 'tax_enabled', 'false', 'boolean', 'Enable tax calculation on bookings', 0, 1),
('payments', 'tax_percentage', '14', 'number', 'Default tax percentage', 1, 1),
('payments', 'invoice_prefix', 'INV-', 'string', 'Prefix for invoice numbers', 0, 1),
('security', 'session_timeout_minutes', '60', 'number', 'User session timeout in minutes', 0, 1),
('security', 'max_login_attempts', '5', 'number', 'Maximum failed login attempts before lockout', 0, 1),
('security', 'jwt_expiration_hours', '24', 'number', 'JWT token expiration in hours', 0, 1),
('platform', 'registration_enabled', 'true', 'boolean', 'Allow new user registration', 1, 1),
('platform', 'public_booking_enabled', 'true', 'boolean', 'Allow public booking without login', 1, 1),
('platform', 'debug_mode', 'false', 'boolean', 'Enable debug mode for development', 0, 1);
