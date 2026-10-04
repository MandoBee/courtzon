-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- ============================================================================
-- 192_membership_subscriptions.sql — G11.22 P1: Membership subscriptions
-- ============================================================================
-- Creates the immutable membership-subscription snapshot layer:
--   membership_subscriptions         the player's purchased membership (snapshot)
--   membership_subscription_components  per-subscription component snapshot
--
-- The subscription carries EVERY commercial term that was in force at purchase
-- (duration, renewal/proration policy, grace, branch scope, payment methods,
-- total, CourtZon commission snapshot, currency). It never reconstructs an old
-- subscription from today's membership_plans / membership_plan_versions.
--
-- Payments use the existing `payment_transactions` (reference_type =
-- 'membership_subscription'); invoicing reuses `invoices`+`invoice_items`
-- (reference_type = 'membership_subscription'). No financial table is changed.
-- Installments (P2) are NOT created; `payment_status` stays future-proof.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `membership_subscriptions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `organisation_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `plan_id` int unsigned NOT NULL,
  `plan_version_id` int unsigned NOT NULL,
  `status` enum('pending','active','expired','cancelled','terminated') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `grace_until` date DEFAULT NULL,
  `duration_type_snapshot` enum('monthly','quarterly','semi_annual','annual') COLLATE utf8mb4_unicode_ci NOT NULL,
  `duration_periods_snapshot` smallint unsigned NOT NULL DEFAULT '1',
  `renewal_model_snapshot` enum('anniversary','fixed_date') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'anniversary',
  `fixed_renewal_month_snapshot` tinyint unsigned DEFAULT NULL,
  `fixed_renewal_day_snapshot` tinyint unsigned DEFAULT NULL,
  `initial_charge_type_snapshot` enum('full','percentage') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'full',
  `initial_charge_percent_snapshot` decimal(5,2) DEFAULT NULL,
  `grace_days_snapshot` smallint unsigned NOT NULL DEFAULT '0',
  `branch_scope_snapshot` enum('ALL','SELECTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ALL',
  `selected_branch_ids` json DEFAULT NULL COMMENT 'Branch scope snapshot when branch_scope_snapshot = SELECTED',
  `allowed_payment_methods_snapshot` json NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EGP',
  `total_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `commission_rate_type_snapshot` enum('percentage','fixed') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `commission_rate_value_snapshot` decimal(5,2) DEFAULT NULL,
  `commission_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `org_net_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `payment_status` enum('unpaid','paid','partially_paid','refunded') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `payment_method` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invoice_id` int unsigned DEFAULT NULL,
  `renewal_of_subscription_id` int unsigned DEFAULT NULL,
  `aggregate_version` int unsigned NOT NULL DEFAULT '1',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ms_public_id` (`public_id`),
  KEY `idx_ms_org_status` (`organisation_id`,`status`),
  KEY `idx_ms_user_status` (`user_id`,`status`),
  KEY `idx_ms_plan` (`plan_id`),
  KEY `idx_ms_plan_version` (`plan_version_id`),
  KEY `idx_ms_invoice` (`invoice_id`),
  KEY `idx_ms_renewal_of` (`renewal_of_subscription_id`),
  KEY `idx_ms_creator` (`created_by`),
  CONSTRAINT `fk_ms_organisation` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ms_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ms_plan` FOREIGN KEY (`plan_id`) REFERENCES `membership_plans` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ms_plan_version` FOREIGN KEY (`plan_version_id`) REFERENCES `membership_plan_versions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ms_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ms_renewal_of` FOREIGN KEY (`renewal_of_subscription_id`) REFERENCES `membership_subscriptions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ms_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_ms_payment_methods` CHECK (json_valid(`allowed_payment_methods_snapshot`)),
  CONSTRAINT `chk_ms_branch_ids` CHECK (`selected_branch_ids` IS NULL OR json_valid(`selected_branch_ids`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Immutable per-subscription component snapshot (what the player actually paid).
CREATE TABLE IF NOT EXISTS `membership_subscription_components` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `subscription_id` int unsigned NOT NULL,
  `component_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `component_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity` smallint unsigned NOT NULL DEFAULT '1',
  `unit_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `total_amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `is_required_at_purchase` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_msc_subscription` (`subscription_id`),
  CONSTRAINT `fk_msc_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `membership_subscriptions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;