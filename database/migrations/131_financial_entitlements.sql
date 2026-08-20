-- 131_financial_entitlements.sql
-- Create the financial_entitlements table: immutable financial position records.
--
-- Purpose:
--   Replace the complex double-entry ledger (ledger_entries, general_ledger) with a
--   simple "who is entitled to how much, why, what status, has it been paid?" model.
--   Each entitlement is an immutable claim against a revenue event. The system only
--   mutates status — never the financial amounts after creation.
--
-- Entitlement types:
--   ORGANIZATION_EARNING  — org's share of a booking/marketplace/academy revenue
--   COURTZON_COMMISSION   — platform commission on any revenue event
--   ORGANIZATION_ADJUSTMENT — manual credit/debit to an org (e.g., penalty, bonus)
--   COURTZON_ADJUSTMENT    — manual credit/debit to the platform
--
-- Source types (strict ENUM matching polymorphic convention):
--   booking, academy, marketplace, tournament, coach_session, manual
--
-- Status lifecycle:
--   PENDING → AVAILABLE (via activation worker) → ON_HOLD (dispute/admin hold) → SETTLED
--   Any status → CANCELLED (refund/reversal)
--
-- Dependencies: organisations(id), bookings(id), orders(id), users(id)

CREATE TABLE IF NOT EXISTS `financial_entitlements` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) NOT NULL COMMENT 'UUID for API exposure',
  `organisation_id` int(10) unsigned NOT NULL COMMENT 'Owning organisation',
  `branch_id` int(10) unsigned DEFAULT NULL COMMENT 'Branch scope (NULL = org-wide)',

  `entitlement_type` enum('ORGANIZATION_EARNING','COURTZON_COMMISSION','ORGANIZATION_ADJUSTMENT','COURTZON_ADJUSTMENT') NOT NULL,
  `source_type` enum('booking','academy','marketplace','tournament','coach_session','manual') NOT NULL,
  `source_id` bigint(20) unsigned DEFAULT NULL COMMENT 'ID of the source entity (booking.id, order.id, etc.)',

  `amount` decimal(14,2) NOT NULL COMMENT 'Entitlement amount (always positive)',
  `currency` char(3) NOT NULL DEFAULT 'EGP',

  `status` enum('PENDING','AVAILABLE','ON_HOLD','SETTLED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `hold_reason` varchar(255) DEFAULT NULL COMMENT 'Reason if ON_HOLD',
  `cancelled_reason` varchar(255) DEFAULT NULL COMMENT 'Reason if CANCELLED',

  `available_at` timestamp NULL DEFAULT NULL COMMENT 'When entitlement becomes AVAILABLE (activation window)',
  `settled_at` timestamp NULL DEFAULT NULL COMMENT 'When settlement was completed',
  `settled_by` bigint(20) unsigned DEFAULT NULL COMMENT 'User who processed settlement',
  `settlement_id` int(10) unsigned DEFAULT NULL COMMENT 'FK to settlements.id (future unified settlement)',

  `description` text DEFAULT NULL COMMENT 'Human-readable description',
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'JSON metadata (booking details, line items, etc.)' CHECK (json_valid(`metadata`)),

  `aggregate_version` int(10) unsigned NOT NULL DEFAULT 1 COMMENT 'Optimistic concurrency',
  `created_by` bigint(20) unsigned DEFAULT NULL COMMENT 'User who created (NULL = system)',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_fe_public_id` (`public_id`),
  KEY `idx_fe_org_status` (`organisation_id`, `status`),
  KEY `idx_fe_source` (`source_type`, `source_id`),
  KEY `idx_fe_type_status` (`entitlement_type`, `status`),
  KEY `idx_fe_available_at` (`available_at`, `status`),
  KEY `idx_fe_settlement` (`settlement_id`),
  KEY `idx_fe_branch` (`branch_id`),
  KEY `idx_fe_created_at` (`created_at`),

  CONSTRAINT `fk_fe_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fe_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fe_settlement` FOREIGN KEY (`settlement_id`) REFERENCES `settlements` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
