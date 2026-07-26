-- Migration 020: Membership Foundation
-- Creates membership plans, benefits, and user membership tables.

CREATE TABLE IF NOT EXISTS `membership_plans` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(100) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `category` VARCHAR(50) NOT NULL DEFAULT 'general',
  `duration_type` ENUM('days', 'months', 'years', 'perpetual') NOT NULL DEFAULT 'months',
  `duration_value` INT UNSIGNED NOT NULL DEFAULT 1,
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'EGP',
  `status` ENUM('draft', 'active', 'archived') NOT NULL DEFAULT 'draft',
  `is_default` TINYINT(1) NOT NULL DEFAULT 0,
  `is_public` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` INT UNSIGNED NULL,
  `updated_by` INT UNSIGNED NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_membership_plan_code` (`code`),
  KEY `idx_plan_category` (`category`),
  KEY `idx_plan_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `membership_benefits` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `membership_plan_id` INT UNSIGNED NOT NULL,
  `benefit_key` VARCHAR(100) NOT NULL,
  `benefit_value` VARCHAR(500) NULL,
  `display_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_benefit_plan` (`membership_plan_id`),
  KEY `idx_benefit_key` (`benefit_key`),
  CONSTRAINT `fk_benefit_plan` FOREIGN KEY (`membership_plan_id`) REFERENCES `membership_plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_memberships` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `membership_plan_id` INT UNSIGNED NOT NULL,
  `status` ENUM('pending', 'active', 'frozen', 'expired', 'cancelled', 'completed') NOT NULL DEFAULT 'pending',
  `start_date` DATE NOT NULL,
  `end_date` DATE NULL,
  `renewal_type` ENUM('auto', 'manual', 'none') NOT NULL DEFAULT 'manual',
  `cancelled_at` TIMESTAMP NULL,
  `expired_at` TIMESTAMP NULL,
  `frozen_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_membership_user` (`user_id`),
  KEY `idx_user_membership_plan` (`membership_plan_id`),
  KEY `idx_user_membership_status` (`status`),
  CONSTRAINT `fk_user_membership_plan` FOREIGN KEY (`membership_plan_id`) REFERENCES `membership_plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `membership_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_membership_id` INT UNSIGNED NOT NULL,
  `action` VARCHAR(50) NOT NULL,
  `old_status` VARCHAR(50) NULL,
  `new_status` VARCHAR(50) NULL,
  `notes` TEXT NULL,
  `created_by` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_history_membership` (`user_membership_id`),
  KEY `idx_history_action` (`action`),
  KEY `idx_history_created` (`created_at`),
  CONSTRAINT `fk_history_membership` FOREIGN KEY (`user_membership_id`) REFERENCES `user_memberships` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default membership plans
INSERT IGNORE INTO `membership_plans` (`code`, `name`, `description`, `category`, `duration_type`, `duration_value`, `price`, `currency`, `status`, `is_default`, `is_public`, `sort_order`) VALUES
('basic', 'Basic Membership', 'Access to standard facilities', 'general', 'months', 1, 0.00, 'EGP', 'active', 1, 1, 10),
('premium', 'Premium Membership', 'Full access including priority booking', 'general', 'months', 1, 200.00, 'EGP', 'active', 0, 1, 20),
('vip', 'VIP Membership', 'All premium benefits plus exclusive perks', 'general', 'months', 1, 500.00, 'EGP', 'active', 0, 1, 30),
('annual_basic', 'Annual Basic', 'Discounted annual access', 'general', 'years', 1, 0.00, 'EGP', 'draft', 0, 1, 40),
('annual_premium', 'Annual Premium', 'Discounted annual premium access', 'general', 'years', 1, 2000.00, 'EGP', 'draft', 0, 1, 50);
