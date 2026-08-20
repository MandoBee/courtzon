-- 134_marketplace_complaint_config.sql
-- Store the platform-wide complaint/return window in days.
--
-- The financial entitlement system keeps marketplace ORGANIZATION_EARNING and
-- COURTZON_COMMISSION entitlements in PENDING status until the complaint window
-- has passed after delivery. The window is configurable via this singleton table
-- (id = 1), editable by admins without a code change.

CREATE TABLE IF NOT EXISTS `marketplace_complaint_config` (
  `id` tinyint(3) unsigned NOT NULL DEFAULT 1 COMMENT 'Singleton row (always 1)',
  `complaint_period_days` int(10) unsigned NOT NULL DEFAULT 7 COMMENT 'Days after delivery during which buyers may raise a complaint/refund',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '0 disables the complaint window (entitlements activate immediately on delivery)',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Platform-wide marketplace complaint window configuration';

INSERT INTO `marketplace_complaint_config` (`id`, `complaint_period_days`, `is_active`)
VALUES (1, 7, 1)
ON DUPLICATE KEY UPDATE `id` = `id`;