-- 149_gateway_settlements.sql
-- Introduces the CourtZon-scoped GATEWAY SETTLEMENT record (Admin
-- "Receive Gateway Settlement") that is DISTINCT from customer payment state
-- (payment_transactions.payment_status='paid') and from org/seller settlement
-- (settlements + settlement_entitlements).
--
-- Purpose:
--   A card/online customer payment debits 1100 Payment Clearing (the gateway
--   clearing asset). Only when CourtZon actually receives the funds from the
--   gateway (Admin confirms receipt) does the money move clearing → bank and
--   the payment become "gateway settled". This migration adds:
--     1. gateway_settlements                 — a settlement batch (CourtZon book, org NULL)
--     2. gateway_settlement_transactions     — per-transaction linkage + fee snapshot
--     3. payment_transactions.gateway_settlement_id / gateway_settled_at
--
-- Duplicate protection:
--   gateway_settlement_transactions.uk_gst_payment (UNIQUE on
--   payment_transaction_id) guarantees a payment transaction can never be
--   included in a gateway settlement twice — enforced by the database, not
--   just application code.
--
-- Fee snapshot:
--   The fee % / fixed fee are SNAPSHOTTED per transaction on the linkage row
--   at settlement time, so later changes to payment_methods never retroactively
--   alter historical settlement amounts.
--
-- Scope:
--   Only additive columns on payment_transactions. No existing table/column is
--   modified, no historical financial record is touched, no existing
--   accounting balance is altered.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS `gateway_settlements` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `batch_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `settlement_status` enum('completed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'completed',
  `gross_amount` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT 'Sum of customer gross amounts settled',
  `gateway_fee_amount` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT 'Sum of gateway fees (percentage + fixed)',
  `net_amount` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT 'Gross - fees = amount actually received',
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EGP',
  `transaction_count` int unsigned NOT NULL DEFAULT '0',
  `settled_by` int unsigned DEFAULT NULL COMMENT 'Admin user who recorded the settlement',
  `settled_at` timestamp NULL DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gs_batch_code` (`batch_code`),
  KEY `idx_gs_settled_at` (`settled_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='CourtZon gateway settlement batch (clearing -> bank)';

CREATE TABLE IF NOT EXISTS `gateway_settlement_transactions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `gateway_settlement_id` int unsigned NOT NULL,
  `payment_transaction_id` bigint unsigned NOT NULL,
  `payment_method_id` int unsigned DEFAULT NULL,
  `gross_amount` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT 'Customer gross amount at settlement time',
  `gateway_fee_pct` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'Fee % snapshot at settlement time',
  `gateway_fee_fixed` decimal(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Fixed fee snapshot at settlement time',
  `gateway_fee_amount` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT 'Computed gateway fee = pct*gross + fixed',
  `net_amount` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT 'Gross - gateway_fee_amount',
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EGP',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_gst_payment` (`payment_transaction_id`),
  KEY `idx_gst_settlement` (`gateway_settlement_id`),
  CONSTRAINT `fk_gst_settlement` FOREIGN KEY (`gateway_settlement_id`) REFERENCES `gateway_settlements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gst_payment` FOREIGN KEY (`payment_transaction_id`) REFERENCES `payment_transactions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Payment transactions included in a gateway settlement (fee snapshot)';

ALTER TABLE `payment_transactions`
  ADD COLUMN `gateway_settlement_id` int unsigned DEFAULT NULL COMMENT 'FK gateway_settlements.id when included in a gateway settlement' AFTER `paid_at`,
  ADD COLUMN `gateway_settled_at` timestamp NULL DEFAULT NULL COMMENT 'When the payment was included in a gateway settlement' AFTER `gateway_settlement_id`,
  ADD KEY `idx_payment_gateway_settlement` (`gateway_settlement_id`),
  ADD CONSTRAINT `fk_payment_gateway_settlement` FOREIGN KEY (`gateway_settlement_id`) REFERENCES `gateway_settlements` (`id`) ON DELETE SET NULL;

COMMIT;