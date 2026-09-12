-- ============================================================================
-- COURTZON V3 : ACADEMY G8 — ENROLLMENT PAYMENT SNAPSHOT
--
-- COURTZON_MIGRATION_ENV: LOCAL_DOCKER_ONLY
-- (Machine-readable classification enforced by backend/scripts/migration-guard.sh.
--  This migration is applied ONLY when COURTZON_MIGRATION_ENV=local. In
--  production/unknown environments it is skipped and never recorded.)
--
-- Additive, backward-compatible, non-destructive. Introduces the single
-- immutable `academy_enrollment_payments` snapshot table (G8).
--
--   1. Exactly ONE snapshot may ever exist per enrollment
--      (`uk_sep_enrollment`). The snapshot is created once at payment time
--      (online capture or offline admin acknowledgment) and is NEVER updated —
--      it carries the authoritative economics for accounting, entitlements and
--      future refund support.
--   2. Loose, indexed references (per the Database Relationship & Historical
--      Data Policy): program_id/group_id/organisation_id have NO FK — the
--      snapshot must survive entity changes. `payment_transaction_id` has an
--      FK with ON DELETE SET NULL because the snapshot is a financial record:
--      it must never cascade-delete with a transaction, and the transaction
--      may legitimately be purged without harming the snapshot.
--   3. No ledger, accounting or entitlement rows are created here — those are
--      downstream consumers of the snapshot (payment module + financial
--      module). This migration is purely the durable storage contract.
--
-- LOCAL DOCKER DEVELOPMENT ONLY. Migration 162 MUST NEVER be applied to
-- Hostinger / production (157-161 are legacy dev migrations; 162 continues
-- the same chain).
-- ============================================================================

CREATE TABLE IF NOT EXISTS `academy_enrollment_payments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `enrollment_id` int unsigned NOT NULL,
  `program_id` int unsigned NOT NULL,
  `group_id` int unsigned DEFAULT NULL,
  `organisation_id` int unsigned DEFAULT NULL,
  `branch_id` int unsigned DEFAULT NULL,
  `player_id` int unsigned NOT NULL,
  `status` enum('authorized') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'authorized' COMMENT 'Write-once: a snapshot row is immutable and never transitions',
  `gross_amount` decimal(14,2) NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EGP',
  `program_price` decimal(14,2) NOT NULL,
  `price_type` enum('FREE','FIXED','MEMBERS_ONLY') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'FIXED',
  `session_count` int unsigned NOT NULL DEFAULT '0',
  `court_rental_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `court_rental_currency` char(3) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `commission_rate` decimal(8,4) NOT NULL DEFAULT '0.0000',
  `commission_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `organization_earning_amount` decimal(14,2) NOT NULL,
  `coach_comp_type` enum('fixed_total','fixed_per_session','percent_gross') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `coach_comp_value` decimal(12,2) DEFAULT NULL,
  `coach_comp_amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `collector` enum('courtzon','org') COLLATE utf8mb4_unicode_ci NOT NULL,
  `payment_method` enum('wallet','cash','card','bank_transfer','online') COLLATE utf8mb4_unicode_ci NOT NULL,
  `cancellation_window_minutes` int unsigned DEFAULT NULL,
  `payment_transaction_id` bigint unsigned DEFAULT NULL,
  `snapshot_created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sep_enrollment` (`enrollment_id`),
  KEY `idx_sep_program` (`program_id`),
  KEY `idx_sep_group` (`group_id`),
  KEY `idx_sep_org` (`organisation_id`),
  KEY `idx_sep_player` (`player_id`),
  KEY `idx_sep_status_created` (`status`,`snapshot_created_at`),
  KEY `idx_sep_payment_txn` (`payment_transaction_id`),
  CONSTRAINT `fk_sep_payment_txn` FOREIGN KEY (`payment_transaction_id`) REFERENCES `payment_transactions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- DOWN: intentionally omitted — this migration is a forward-only, additive
-- LOCAL DOCKER DEVELOPMENT migration. The baseline captures the final schema;
-- a fresh environment rebuilds from `database/baseline/001_courtzon_v3.sql`.