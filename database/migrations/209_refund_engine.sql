-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- ---------------------------------------------------------------------------
-- 209_refund_engine.sql
--
-- Institution-funded Refund Engine (approved business model).
--
-- Principles enforced by this schema:
--   * The owning organisation bears the refund cost. CourtZon never does.
--   * Original payment_transactions / gateway_settlements / settlement
--     entitlements and their journal entries are NEVER modified by a refund.
--   * Approval and payout are independent state machines; a case is COMPLETED
--     only when both are complete.
--   * Payout is cash or an independent bank transfer (no Paymob, no wallet).
--   * Partial refunds require explicit service-unit lines.
--   * Every amount is stored in integer cents.
--
-- Tables are additive only (CREATE TABLE IF NOT EXISTS). No existing table is
-- altered, no data is migrated, and historical refunds are untouched.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `refund_cases` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `domain` enum('booking','tournament','academy','marketplace','membership') COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_id` bigint unsigned NOT NULL,
  `original_payment_id` bigint unsigned DEFAULT NULL,
  `organisation_id` int unsigned NOT NULL,
  `requested_by` bigint unsigned NOT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `policy_snapshot` json DEFAULT NULL,
  `canceled_value_cents` bigint unsigned NOT NULL DEFAULT '0',
  `approved_refund_cents` bigint unsigned NOT NULL DEFAULT '0',
  `fee_cents` bigint unsigned NOT NULL DEFAULT '0',
  `discount_cents` bigint unsigned NOT NULL DEFAULT '0',
  `paid_cents` bigint unsigned NOT NULL DEFAULT '0',
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EGP',
  `status` enum('REQUESTED','UNDER_REVIEW','APPROVED','REJECTED','OPERATIONAL_PROCESSING','PAYOUT_PENDING','PARTIALLY_COMPLETED','COMPLETED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'REQUESTED',
  `operational_status` enum('PENDING','PROCESSING','COMPLETED','PARTIALLY_COMPLETED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `payout_status` enum('PENDING','PROCESSING','COMPLETED','PARTIALLY_COMPLETED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `approved_by` bigint unsigned DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `rejected_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aggregate_version` int unsigned NOT NULL DEFAULT '1',
  `idempotency_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_refund_cases_public_id` (`public_id`),
  UNIQUE KEY `uk_refund_cases_idempotency` (`idempotency_key`),
  KEY `idx_refund_cases_org_status` (`organisation_id`,`status`),
  KEY `idx_refund_cases_source` (`domain`,`source_type`,`source_id`),
  CONSTRAINT `chk_refund_cases_amounts` CHECK (
    `approved_refund_cents` >= 0
    AND `canceled_value_cents` >= 0
    AND `fee_cents` >= 0
    AND `discount_cents` >= 0
    AND `paid_cents` >= 0
    AND `paid_cents` <= `approved_refund_cents`
    AND `approved_refund_cents` <= `canceled_value_cents`
  ),
  CONSTRAINT `chk_refund_cases_policy_json` CHECK (`policy_snapshot` IS NULL OR json_valid(`policy_snapshot`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `refund_case_lines` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `case_id` bigint unsigned NOT NULL,
  `line_no` int unsigned NOT NULL,
  `line_type` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source_id` bigint unsigned NOT NULL,
  `canceled_value_cents` bigint unsigned NOT NULL DEFAULT '0',
  `approved_cents` bigint unsigned NOT NULL DEFAULT '0',
  `operational_status` enum('PENDING','PROCESSING','COMPLETED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `cancellation_ref` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_refund_case_lines_no` (`case_id`,`line_no`),
  KEY `idx_refund_case_lines_source` (`line_type`,`source_id`),
  CONSTRAINT `fk_refund_case_lines_case` FOREIGN KEY (`case_id`) REFERENCES `refund_cases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_refund_case_lines_amounts` CHECK (
    `canceled_value_cents` >= 0
    AND `approved_cents` >= 0
    AND `approved_cents` <= `canceled_value_cents`
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `refund_case_payouts` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `case_id` bigint unsigned NOT NULL,
  `method` enum('cash','bank_transfer') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount_cents` bigint unsigned NOT NULL,
  `status` enum('PENDING','PROCESSING','COMPLETED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `evidence_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `executed_by` bigint unsigned DEFAULT NULL,
  `executed_at` timestamp NULL DEFAULT NULL,
  `idempotency_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_refund_case_payouts_idempotency` (`idempotency_key`),
  KEY `idx_refund_case_payouts_case` (`case_id`,`status`),
  CONSTRAINT `fk_refund_case_payouts_case` FOREIGN KEY (`case_id`) REFERENCES `refund_cases` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_refund_case_payouts_amount` CHECK (`amount_cents` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
