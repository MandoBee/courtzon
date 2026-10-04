-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- ============================================================================
-- 191_membership_plan_versions.sql — G11.22 P1: Membership plan versioning
-- ============================================================================
-- Adds the versioned commercial layer for membership plans:
--   membership_plan_versions          immutable commercial terms per version
--   membership_plan_components        version-scoped revenue components
--   membership_plan_branches          version branch scope (all / selected)
--   organisation_membership_settings  org-level durations + payment methods
--
-- P1 support: FULL PAYMENT only. `installments_enabled` is a future flag only.
-- Existing tables are NOT altered except an additive index on
-- membership_plans.organisation_id. No financial/accounting/payment table is
-- touched in this migration.
-- ============================================================================

-- Organisation-level membership settings (enabled durations + payment channels).
CREATE TABLE IF NOT EXISTS `organisation_membership_settings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `organisation_id` int unsigned NOT NULL,
  `enabled_durations` json NOT NULL COMMENT '["monthly","quarterly","semi_annual","annual"]',
  `allowed_payment_methods` json NOT NULL COMMENT '["cash","card"]',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_oms_organisation` (`organisation_id`),
  CONSTRAINT `fk_oms_organisation` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_oms_durations` CHECK (json_valid(`enabled_durations`)),
  CONSTRAINT `chk_oms_payment_methods` CHECK (json_valid(`allowed_payment_methods`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Immutable commercial terms per plan version.
CREATE TABLE IF NOT EXISTS `membership_plan_versions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `membership_plan_id` int unsigned NOT NULL,
  `version_no` int unsigned NOT NULL DEFAULT '1',
  `status` enum('draft','active','superseded','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `effective_from` date NOT NULL,
  `duration_type` enum('monthly','quarterly','semi_annual','annual') COLLATE utf8mb4_unicode_ci NOT NULL,
  `duration_periods` smallint unsigned NOT NULL DEFAULT '1',
  `renewal_model` enum('anniversary','fixed_date') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'anniversary',
  `fixed_renewal_month` tinyint unsigned DEFAULT NULL,
  `fixed_renewal_day` tinyint unsigned DEFAULT NULL,
  `initial_charge_type` enum('full','percentage') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'full',
  `initial_charge_percent` decimal(5,2) DEFAULT NULL,
  `grace_days` smallint unsigned NOT NULL DEFAULT '0',
  `branch_scope` enum('ALL','SELECTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ALL',
  `allowed_payment_methods` json NOT NULL COMMENT '["cash","card"]',
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EGP',
  `installments_enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Reserved for P2; P1 supports full payment only',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mpv_plan_version` (`membership_plan_id`,`version_no`),
  KEY `idx_mpv_plan` (`membership_plan_id`),
  KEY `idx_mpv_status` (`status`,`effective_from`),
  KEY `idx_mpv_creator` (`created_by`),
  CONSTRAINT `fk_mpv_plan` FOREIGN KEY (`membership_plan_id`) REFERENCES `membership_plans` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mpv_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_mpv_payment_methods` CHECK (json_valid(`allowed_payment_methods`)),
  CONSTRAINT `chk_mpv_percent` CHECK (`initial_charge_percent` IS NULL OR (`initial_charge_percent` > 0 AND `initial_charge_percent` <= 100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Version-scoped revenue components (organisation-defined).
CREATE TABLE IF NOT EXISTS `membership_plan_components` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `plan_version_id` int unsigned NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `is_required` tinyint(1) NOT NULL DEFAULT '1',
  `quantity` smallint unsigned NOT NULL DEFAULT '1',
  `sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mpc_version_code` (`plan_version_id`,`code`),
  KEY `idx_mpc_version` (`plan_version_id`),
  CONSTRAINT `fk_mpc_version` FOREIGN KEY (`plan_version_id`) REFERENCES `membership_plan_versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Branch scope of a plan version (only populated when branch_scope = 'SELECTED').
CREATE TABLE IF NOT EXISTS `membership_plan_branches` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `plan_version_id` int unsigned NOT NULL,
  `branch_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mpb_version_branch` (`plan_version_id`,`branch_id`),
  KEY `idx_mpb_branch` (`branch_id`),
  CONSTRAINT `fk_mpb_version` FOREIGN KEY (`plan_version_id`) REFERENCES `membership_plan_versions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mpb_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Additive index enabling tenancy-safe plan lookups (service-side uniqueness).
ALTER TABLE `membership_plans`
  ADD KEY `idx_plan_organisation` (`organisation_id`);