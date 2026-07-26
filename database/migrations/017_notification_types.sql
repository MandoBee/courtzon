-- Migration 017: Notification Types
-- Creates the notification_types configuration table for the Communication Center.
-- This is additive — does not modify existing tables.

SET @prev = (SELECT MAX(`sequence`) FROM `migrations` WHERE `name` = '017_notification_types');
INSERT IGNORE INTO `migrations` (`name`, `sequence`) VALUES ('017_notification_types', COALESCE(@prev, 0) + 1);

CREATE TABLE IF NOT EXISTS `notification_types` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(100) NOT NULL,
  `event_key` VARCHAR(100) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `category` VARCHAR(50) NOT NULL DEFAULT 'system',
  `priority` ENUM('low', 'normal', 'high', 'critical') NOT NULL DEFAULT 'normal',
  `default_channels` JSON NOT NULL,
  `icon` VARCHAR(50) NULL DEFAULT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `requires_action` TINYINT(1) NOT NULL DEFAULT 0,
  `system_managed` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `created_by` INT UNSIGNED NULL DEFAULT NULL,
  `updated_by` INT UNSIGNED NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_type_code` (`code`),
  UNIQUE KEY `uk_notification_type_event_key` (`event_key`),
  KEY `idx_notification_type_category` (`category`),
  KEY `idx_notification_type_enabled` (`enabled`),
  KEY `idx_notification_type_sort` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed data: default notification types
INSERT IGNORE INTO `notification_types` (`code`, `event_key`, `name`, `description`, `category`, `priority`, `default_channels`, `icon`, `enabled`, `requires_action`, `system_managed`, `sort_order`) VALUES
('booking.created', 'booking.created', 'Booking Created', 'When a new booking is created', 'bookings', 'normal', '["in_app"]', '📅', 1, 0, 1, 10),
('booking.confirmed', 'booking.confirmed', 'Booking Confirmed', 'When a booking payment is confirmed', 'bookings', 'high', '["in_app", "push"]', '✅', 1, 0, 1, 20),
('booking.cancelled', 'booking.cancelled', 'Booking Cancelled', 'When a booking is cancelled', 'bookings', 'high', '["in_app"]', '❌', 1, 0, 1, 30),
('booking.reminder', 'booking.reminder', 'Booking Reminder', 'Reminder before a booking starts', 'bookings', 'normal', '["in_app", "push"]', '⏰', 1, 0, 1, 40),
('payment.succeeded', 'payment.succeeded', 'Payment Succeeded', 'When a payment completes successfully', 'payments', 'high', '["in_app", "email"]', '💳', 1, 0, 1, 50),
('payment.failed', 'payment.failed', 'Payment Failed', 'When a payment fails', 'payments', 'high', '["in_app", "email"]', '💔', 1, 0, 1, 60),
('academy.session.created', 'academy.session.created', 'Academy Session Created', 'When a new academy session is scheduled', 'academy', 'normal', '["in_app"]', '📚', 1, 0, 1, 70),
('academy.session.cancelled', 'academy.session.cancelled', 'Academy Session Cancelled', 'When an academy session is cancelled', 'academy', 'normal', '["in_app"]', '📚', 1, 0, 1, 80),
('membership.expired', 'membership.expired', 'Membership Expired', 'When a membership expires', 'membership', 'high', '["in_app", "email"]', '⭐', 1, 0, 1, 90),
('membership.renewed', 'membership.renewed', 'Membership Renewed', 'When a membership is renewed', 'membership', 'normal', '["in_app"]', '⭐', 1, 0, 1, 100),
('tournament.started', 'tournament.started', 'Tournament Started', 'When a tournament begins', 'tournaments', 'high', '["in_app", "push"]', '🏆', 1, 0, 1, 110),
('tournament.finished', 'tournament.finished', 'Tournament Finished', 'When a tournament ends', 'tournaments', 'normal', '["in_app"]', '🏆', 1, 0, 1, 120);
