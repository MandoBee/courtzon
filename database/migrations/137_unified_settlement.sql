-- 137_unified_settlement.sql
--
-- Phase 3 — Unified Settlement.
--
-- Adds the minimal schema to settle AVAILABLE Financial Entitlements between
-- CourtZon and one Organization, in either direction, with partial selection,
-- netting, and entitlement-level reservation/finalization.
--
-- Changes:
--   1. financial_entitlements.collector — who originally collected the money
--      ('courtzon' = player paid CourtZon online/wallet; 'org' = player paid
--       the organization cash/COD). Set at entitlement creation time so the
--       settlement engine can determine financial direction source-agnostically.
--   2. settlements — batch grouping (batch_code) + payment recording fields
--      (payment_method, payment_reference, paid_amount, paid_by) + the two
--      parties' computed positions (organization_position, courtzon_position).
--   3. settlement_entitlements — join between a settlement and the entitlements
--      it includes. UNIQUE(entitlement_id) enforces that one entitlement can
--      never belong to two settlements at the DB level.

ALTER TABLE `financial_entitlements`
  ADD COLUMN `collector` enum('courtzon','org') DEFAULT NULL COMMENT 'Who originally collected the money: courtzon (online/wallet) or org (cash/COD)' AFTER `source_id`,
  ADD KEY `idx_fe_org_status_settlement` (`organisation_id`, `status`, `settlement_id`);

ALTER TABLE `settlements`
  ADD COLUMN `batch_code` varchar(50) DEFAULT NULL COMMENT 'Shared batch grouping code (e.g. SET-2026-08-001); multiple settlements may share it' AFTER `settlement_type`,
  ADD COLUMN `organization_position` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT 'Net organization position included in this settlement' AFTER `net_amount`,
  ADD COLUMN `courtzon_position` decimal(14,2) NOT NULL DEFAULT '0.00' COMMENT 'Net CourtZon position included in this settlement' AFTER `organization_position`,
  ADD COLUMN `payment_method` varchar(50) DEFAULT NULL AFTER `courtzon_position`,
  ADD COLUMN `payment_reference` varchar(255) DEFAULT NULL AFTER `payment_method`,
  ADD COLUMN `paid_amount` decimal(14,2) DEFAULT NULL AFTER `payment_reference`,
  ADD COLUMN `paid_by` int unsigned DEFAULT NULL AFTER `paid_amount`,
  ADD KEY `idx_stl_batch_code` (`batch_code`);

CREATE TABLE IF NOT EXISTS `settlement_entitlements` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `settlement_id` int(10) unsigned NOT NULL,
  `entitlement_id` bigint(20) unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_se_entitlement` (`entitlement_id`) COMMENT 'One entitlement may belong to at most one settlement',
  KEY `idx_se_settlement` (`settlement_id`),
  CONSTRAINT `fk_se_settlement` FOREIGN KEY (`settlement_id`) REFERENCES `settlements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_se_entitlement` FOREIGN KEY (`entitlement_id`) REFERENCES `financial_entitlements` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Entitlements included in each unified settlement';