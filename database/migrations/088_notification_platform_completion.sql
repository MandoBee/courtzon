-- 088_notification_platform_completion.sql
-- Finalize the Notification Platform with missing configuration tables
-- and default seed data (August 2026).
--
-- All statements are idempotent (safe to re-run).

DROP PROCEDURE IF EXISTS migration_088;
DELIMITER $$
CREATE PROCEDURE migration_088()
BEGIN
  -- 1) Missing notification categories
  INSERT IGNORE INTO `notification_categories` (`id`, `slug`, `is_active`, `sort_order`, `created_at`)
  VALUES
    (9,  'tournament',  1, 9,  NOW()),
    (10, 'security',     1, 10, NOW()),
    (11, 'wallet',       1, 11, NOW()),
    (12, 'match',        1, 12, NOW()),
    (13, 'event',        1, 13, NOW()),
    (14, 'organisation', 1, 14, NOW()),
    (15, 'membership',   1, 15, NOW()),
    (16, 'referee',      1, 16, NOW()),
    (17, 'announcement', 1, 17, NOW()),
    (18, 'subscription', 1, 18, NOW());

  -- 2) Global notification settings table (platform-wide configuration)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_global_settings'
  ) THEN
    CREATE TABLE `notification_global_settings` (
      `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
      `setting_key` varchar(100) NOT NULL,
      `setting_value` text DEFAULT NULL,
      `description` varchar(500) DEFAULT NULL,
      `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
      PRIMARY KEY (`id`),
      UNIQUE KEY `uk_setting_key` (`setting_key`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  END IF;

  -- Seed default global settings
  INSERT IGNORE INTO `notification_global_settings` (`setting_key`, `setting_value`, `description`)
  VALUES
    ('platform.enabled',           'true',   'Master toggle: enable/disable entire notification platform'),
    ('maintenance_mode',           'false',  'Maintenance mode: suppress all non-critical notifications'),
    ('push.enabled',               'true',   'Enable/disable push notifications globally'),
    ('email.enabled',              'true',   'Enable/disable email globally'),
    ('sms.enabled',                'false',  'Enable/disable SMS globally'),
    ('whatsapp.enabled',           'false',  'Enable/disable WhatsApp globally'),
    ('webhooks.enabled',           'true',   'Enable/disable webhook delivery globally'),
    ('default_retry_count',        '3',      'Default max retry attempts per notification'),
    ('default_retry_delay_ms',     '30000',  'Default delay between retries (ms)'),
    ('exponential_backoff_enabled','true',   'Enable exponential backoff on retries'),
    ('max_notifications_per_user_hour','60', 'Global rate limit per user per hour'),
    ('max_notifications_per_user_day','200','Global rate limit per user per day'),
    ('analytics_retention_days',   '365',    'How long to retain notification analytics'),
    ('emergency_override_quiet_hours','true','Critical/security notifications bypass quiet hours'),
    ('emergency_override_prefs',   'true',   'Critical/security notifications bypass user preferences');

  -- 3) Notification retry policies table
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_retry_policies'
  ) THEN
    CREATE TABLE `notification_retry_policies` (
      `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
      `policy_key` varchar(100) NOT NULL,
      `category_slug` varchar(50) DEFAULT NULL COMMENT 'NULL = default policy',
      `max_retries` int(10) unsigned NOT NULL DEFAULT 3,
      `retry_delay_ms` int(10) unsigned NOT NULL DEFAULT 30000,
      `exponential_backoff` tinyint(1) NOT NULL DEFAULT 1,
      `max_delay_ms` int(10) unsigned DEFAULT 300000,
      `is_active` tinyint(1) NOT NULL DEFAULT 1,
      `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
      `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
      PRIMARY KEY (`id`),
      UNIQUE KEY `uk_policy_key` (`policy_key`),
      KEY `idx_category` (`category_slug`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  END IF;

  INSERT IGNORE INTO `notification_retry_policies` (`policy_key`, `category_slug`, `max_retries`, `retry_delay_ms`, `exponential_backoff`, `max_delay_ms`)
  VALUES
    ('default',              NULL,          3,  30000, 1, 300000),
    ('critical_security',    'security',    5,  10000, 1, 120000),
    ('transactional_payment','payment',     3,  60000, 1, 600000),
    ('transactional_wallet', 'wallet',      3,  60000, 1, 600000),
    ('transactional_booking','booking',     2,  30000, 0, 30000),
    ('marketing_promotion',  'promotion',   1, 300000, 0, 300000),
    ('reminder_default',     NULL,          2, 120000, 0, 120000);

  -- 4) Notification rule engine tables
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_rules'
  ) THEN
    CREATE TABLE `notification_rules` (
      `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
      `name` varchar(200) NOT NULL,
      `description` varchar(500) DEFAULT NULL,
      `event_name` varchar(100) DEFAULT NULL COMMENT 'NULL = applies to all events',
      `category_slug` varchar(50) DEFAULT NULL,
      `is_active` tinyint(1) NOT NULL DEFAULT 1,
      `priority` int(10) unsigned NOT NULL DEFAULT 100 COMMENT 'Lower = evaluated first',
      `action` enum('suppress','delay','force_channel','force_priority','require_approval') NOT NULL,
      `action_data` text DEFAULT NULL COMMENT 'JSON: channel, priority, delay, etc.',
      `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
      `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
      PRIMARY KEY (`id`),
      KEY `idx_event` (`event_name`),
      KEY `idx_category` (`category_slug`),
      KEY `idx_active_priority` (`is_active`,`priority`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_rule_conditions'
  ) THEN
    CREATE TABLE `notification_rule_conditions` (
      `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
      `rule_id` int(10) unsigned NOT NULL,
      `field` varchar(100) NOT NULL COMMENT 'e.g. user_online, is_quiet_hours, is_vip, user_role',
      `operator` enum('equals','not_equals','greater_than','less_than','contains','in','is_true','is_false') NOT NULL,
      `value` varchar(500) DEFAULT NULL,
      PRIMARY KEY (`id`),
      KEY `idx_rule` (`rule_id`),
      CONSTRAINT `fk_rule_condition` FOREIGN KEY (`rule_id`) REFERENCES `notification_rules` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  END IF;

  -- Seed default rules
  INSERT IGNORE INTO `notification_rules` (`id`, `name`, `description`, `event_name`, `category_slug`, `is_active`, `priority`, `action`)
  VALUES
    (1, 'App open → Socket only',  'Skip push/email when user is online in-app',     NULL, NULL,          1, 1, 'force_channel'),
    (2, 'Background → Push',       'Use push when user is offline',                     NULL, NULL,          1, 2, 'force_channel'),
    (3, 'Marketing → defer quiet',  'Delay marketing notifications past quiet hours',   NULL, 'promotion',   1, 3, 'delay'),
    (4, 'Security override',        'Force deliver security alerts immediately',        NULL, 'security',    1, 0, 'force_priority'),
    (5, 'VIP priority',             'Deliver notifications to VIP users immediately',   NULL, NULL,          0, 4, 'force_priority');

  INSERT IGNORE INTO `notification_rule_conditions` (`rule_id`, `field`, `operator`, `value`)
  VALUES
    (1, 'user_online',     'is_true',  'true'),
    (2, 'user_online',     'is_false', 'true'),
    (3, 'is_quiet_hours',  'is_true',  'true'),
    (4, 'category',        'equals',   'security'),
    (5, 'user_role',       'contains', 'vip');
END$$
DELIMITER ;
CALL migration_088();
DROP PROCEDURE migration_088;
