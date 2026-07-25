-- Migration 060: Create user_organisations and user_branches junction tables
-- These tables are referenced by socket-room-manager, notification dispatcher,
-- and player-matching service but were never created in the V3 baseline.

CREATE TABLE IF NOT EXISTS `user_organisations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `organisation_id` int(10) unsigned NOT NULL,
  `role_in_org` varchar(50) DEFAULT 'member' COMMENT 'owner, admin, member',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_org` (`user_id`, `organisation_id`),
  KEY `idx_org` (`organisation_id`),
  CONSTRAINT `fk_uo_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_uo_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_branches` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `branch_id` int(10) unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_branch` (`user_id`, `branch_id`),
  KEY `idx_branch` (`branch_id`),
  CONSTRAINT `fk_ub_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ub_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Populate from existing data: org owners
INSERT IGNORE INTO `user_organisations` (`user_id`, `organisation_id`, `role_in_org`)
SELECT `owner_id`, `id`, 'owner' FROM `organisations` WHERE `is_active` = 1;

-- Populate from existing data: booking users → their orgs
INSERT IGNORE INTO `user_organisations` (`user_id`, `organisation_id`, `role_in_org`)
SELECT DISTINCT `user_id`, `organisation_id`, 'member'
FROM `bookings`
WHERE `organisation_id` IS NOT NULL AND `user_id` IS NOT NULL;

-- Populate from existing data: booking users → their branches
INSERT IGNORE INTO `user_branches` (`user_id`, `branch_id`)
SELECT DISTINCT `user_id`, `branch_id`
FROM `bookings`
WHERE `branch_id` IS NOT NULL AND `user_id` IS NOT NULL;
