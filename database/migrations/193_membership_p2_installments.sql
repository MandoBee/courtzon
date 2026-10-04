-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- ============================================================================
-- 193_membership_p2_installments.sql — G11.22 P2: Membership installments
-- ============================================================================
-- Additive P2 schema for installment-based membership subscriptions (approved
-- G11.22 P2 final decisions). Creates:
--   membership_plan_installment_templates  installment schedule template per
--                                          plan version (immutable once active)
--   membership_installments                per-subscription installment rows
--   organisation_membership_settings       + cancellation/refund policy JSON
--
-- P2 rules encoded here:
--   * First installment paid+finalized  →  subscription.status = 'active'
--   * Overdue installments NEVER deactivate/freeze the membership
--   * One invoice covers the FULL subscription amount; installments are
--     payment obligations against that invoice
--   * Cancellation voids FUTURE (pending) unpaid installments per org policy;
--     refund is a SEPARATE financial operation
--   * Paid financial history is never deleted (RESTRICT on subscription)
--
-- No existing financial / payment / ledger / P1 table is modified except an
-- ADDITIVE policy column on organisation_membership_settings (approved
-- decision #7). payment_transactions.reference_type is varchar(50) so the new
-- per-installment payments need no ENUM change. ledger_entries.source_type
-- already includes 'membership'.
-- ============================================================================

-- Installment schedule TEMPLATE per plan version (immutable once the version
-- is active; created at version create / draft edit only).
CREATE TABLE IF NOT EXISTS `membership_plan_installment_templates` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `plan_version_id` int unsigned NOT NULL,
  `seq` tinyint unsigned NOT NULL COMMENT '1-based installment sequence',
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Installment amount (template)',
  `due_offset_days` smallint unsigned NOT NULL DEFAULT '0' COMMENT 'Days after subscription start',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mpit_version_seq` (`plan_version_id`,`seq`),
  KEY `idx_mpit_version` (`plan_version_id`),
  CONSTRAINT `fk_mpit_version` FOREIGN KEY (`plan_version_id`) REFERENCES `membership_plan_versions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_mpit_amount` CHECK (`amount` >= 0),
  CONSTRAINT `chk_mpit_seq` CHECK (`seq` >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-subscription installments (immutable financial obligations once paid).
CREATE TABLE IF NOT EXISTS `membership_installments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `subscription_id` int unsigned NOT NULL,
  `seq` tinyint unsigned NOT NULL COMMENT '1-based installment sequence',
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `commission_amount` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'CourtZon commission allocated to THIS installment (P1 snapshot proportion)',
  `due_date` date NOT NULL,
  `status` enum('pending','paid','overdue','voided','refunded') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `paid_at` datetime DEFAULT NULL,
  `payment_transaction_id` bigint unsigned DEFAULT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EGP',
  `aggregate_version` int unsigned NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_mi_subscription_seq` (`subscription_id`,`seq`),
  KEY `idx_mi_due_status` (`due_date`,`status`),
  KEY `idx_mi_status` (`status`),
  KEY `idx_mi_payment` (`payment_transaction_id`),
  CONSTRAINT `fk_mi_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `membership_subscriptions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_mi_payment` FOREIGN KEY (`payment_transaction_id`) REFERENCES `payment_transactions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_mi_amount` CHECK (`amount` >= 0),
  CONSTRAINT `chk_mi_commission` CHECK (`commission_amount` >= 0),
  CONSTRAINT `chk_mi_seq` CHECK (`seq` >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Organisation-level membership cancellation / refund policy (approved decision
-- #7). Additive JSON column with the same style as enabled_durations /
-- allowed_payment_methods. NULL/absent ⇒ default policy
--   { cancellation: { void_future_unpaid: true }, refund: { type: 'none' } }.
ALTER TABLE `organisation_membership_settings`
  ADD COLUMN `cancellation_refund_policy` json DEFAULT NULL
    COMMENT '{"cancellation":{"void_future_unpaid":true},"refund":{"type":"none"|"full"|"proportional"|"before_start_only","window_days_before_start":0}}'
    AFTER `allowed_payment_methods`,
  ADD CONSTRAINT `chk_oms_cancel_refund`
    CHECK (`cancellation_refund_policy` IS NULL OR json_valid(`cancellation_refund_policy`));