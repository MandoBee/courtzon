-- Phase 4: Subscription Plan Commission Rates
-- Each plan defines commission rates per entity type.
-- The commission engine uses plan-specific rates when available,
-- falling back to the global commission_rules defaults.

-- Step 0: Ensure parent table exists
CREATE TABLE IF NOT EXISTS `subscription_plans` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `plan_name` varchar(255) NOT NULL,
  `billing_cycle` enum('monthly','yearly') NOT NULL DEFAULT 'monthly',
  `price` decimal(12,2) NOT NULL,
  `features` JSON DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed initial plans (used by Step 2 updates)
INSERT IGNORE INTO `subscription_plans` (`id`, `plan_name`, `billing_cycle`, `price`, `features`, `is_active`) VALUES
(1, 'Starter', 'monthly', 999.00, '{"courts":5}', 1),
(2, 'Professional', 'monthly', 2999.00, '{"courts":20}', 1),
(3, 'Freemium', 'monthly', 0.00, '{"courts":5,"commission":"highest"}', 1),
(4, 'Premium Yearly', 'yearly', 49990.00, '{"courts":"unlimited","priority_support":true,"analytics":true,"custom_branding":true,"discount":"16%"}', 1);

-- Step 1: Create the plan-specific commission rates table
CREATE TABLE IF NOT EXISTS `subscription_plan_rates` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `plan_id` bigint(20) UNSIGNED NOT NULL,
  `applicable_entity` varchar(100) NOT NULL COMMENT 'booking, tournament, marketplace, coach_session, academy',
  `rate_type` enum('percentage','fixed') NOT NULL DEFAULT 'percentage',
  `amount` decimal(5,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_plan_entity` (`plan_id`, `applicable_entity`),
  CONSTRAINT `fk_spr_plan` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 2: Update subscription plans to match 3-tier revenue model
-- Plan 1 (was Starter): Premium — highest price, lowest commission
-- Plan 2 (was Professional): Standard — medium price, medium commission
-- Plan 3 (was Enterprise): Freemium — zero price, highest commission

UPDATE `subscription_plans` SET
  plan_name = 'Premium',
  billing_cycle = 'monthly',
  price = 4999.00,
  features = '{"courts":"unlimited","priority_support":true,"analytics":true,"custom_branding":true}'
WHERE id = 1;

UPDATE `subscription_plans` SET
  plan_name = 'Standard',
  billing_cycle = 'monthly',
  price = 1999.00,
  features = '{"courts":20,"support":"standard","analytics":true,"custom_branding":false}'
WHERE id = 2;

UPDATE `subscription_plans` SET
  plan_name = 'Freemium',
  billing_cycle = 'monthly',
  price = 0.00,
  features = '{"courts":5,"support":"basic","analytics":false,"custom_branding":false}'
WHERE id = 3;

-- Step 3: Seed plan-specific commission rates
-- Premium Plan rates (lowest commission) — plan_id = 1
INSERT INTO `subscription_plan_rates` (`plan_id`, `applicable_entity`, `rate_type`, `amount`) VALUES
  (1, 'booking', 'percentage', 5.00),
  (1, 'tournament', 'percentage', 7.50),
  (1, 'marketplace', 'percentage', 3.00),
  (1, 'coach_session', 'percentage', 5.00),
  (1, 'academy', 'percentage', 5.00);

-- Standard Plan rates (medium commission) — plan_id = 2
INSERT INTO `subscription_plan_rates` (`plan_id`, `applicable_entity`, `rate_type`, `amount`) VALUES
  (2, 'booking', 'percentage', 10.00),
  (2, 'tournament', 'percentage', 15.00),
  (2, 'marketplace', 'percentage', 7.00),
  (2, 'coach_session', 'percentage', 10.00),
  (2, 'academy', 'percentage', 10.00);

-- Freemium Plan rates (highest commission) — plan_id = 3
INSERT INTO `subscription_plan_rates` (`plan_id`, `applicable_entity`, `rate_type`, `amount`) VALUES
  (3, 'booking', 'percentage', 18.00),
  (3, 'tournament', 'percentage', 22.00),
  (3, 'marketplace', 'percentage', 12.00),
  (3, 'coach_session', 'percentage', 18.00),
  (3, 'academy', 'percentage', 18.00);

-- Premium Yearly rates (same as Premium monthly)
INSERT INTO `subscription_plan_rates` (`plan_id`, `applicable_entity`, `rate_type`, `amount`) VALUES
  (4, 'booking', 'percentage', 5.00),
  (4, 'tournament', 'percentage', 7.50),
  (4, 'marketplace', 'percentage', 3.00),
  (4, 'coach_session', 'percentage', 5.00),
  (4, 'academy', 'percentage', 5.00);

-- Step 4: Add commission tracking columns to bookings table
ALTER TABLE `bookings`
  ADD COLUMN `commission_rate` decimal(5,2) DEFAULT 0.00 AFTER `total_amount`,
  ADD COLUMN `net_amount` decimal(12,2) DEFAULT 0.00 AFTER `commission_amount`,
  ADD COLUMN `plan_name` varchar(100) DEFAULT NULL AFTER `net_amount`;

-- Step 5: Update existing subscriptions to use new plan IDs
-- subscription_id 1 (Club 1) was on plan_id=2 (Professional→Standard), still valid
-- subscription_id 2 (Club 2) was on plan_id=1 (Starter→Premium), still valid
