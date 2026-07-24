-- Membership, Loyalty & Rewards Platform

CREATE TABLE IF NOT EXISTS `membership_plans` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `plan_type` enum('monthly','quarterly','semiannual','annual','unlimited','credits','session_bundle','corporate','family','student') NOT NULL,
  `duration_days` int NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `credits` int DEFAULT NULL,
  `sessions` int DEFAULT NULL,
  `benefits` json DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `organisation_id` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_plan_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `memberships` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `plan_id` int unsigned NOT NULL,
  `status` enum('active','expired','cancelled','pending') NOT NULL DEFAULT 'active',
  `start_date` datetime NOT NULL,
  `end_date` datetime NOT NULL,
  `credits_used` int NOT NULL DEFAULT 0,
  `sessions_used` int NOT NULL DEFAULT 0,
  `auto_renew` tinyint(1) NOT NULL DEFAULT 0,
  `aggregate_version` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_member_user` (`user_id`),
  KEY `idx_member_status` (`status`, `end_date`),
  KEY `idx_member_plan` (`plan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `loyalty_points` (
  `user_id` int unsigned NOT NULL,
  `total_earned` int NOT NULL DEFAULT 0,
  `total_spent` int NOT NULL DEFAULT 0,
  `current_balance` int NOT NULL DEFAULT 0,
  `current_tier` enum('bronze','silver','gold','platinum','diamond') NOT NULL DEFAULT 'bronze',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `loyalty_campaigns` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text,
  `points_multiplier` decimal(5,2) NOT NULL DEFAULT 1.00,
  `start_date` datetime NOT NULL,
  `end_date` datetime NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `applicable_activities` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_campaign_active` (`is_active`, `start_date`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `reward_catalog` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text,
  `points_cost` int NOT NULL,
  `reward_type` enum('wallet_credit','coupon','free_booking','free_session','voucher','merchandise','tournament_ticket') NOT NULL,
  `reward_value` decimal(10,2) NOT NULL,
  `quantity` int NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reward_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `reward_claims` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `reward_id` int unsigned NOT NULL,
  `points_used` int NOT NULL,
  `claimed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_claim_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
