-- ============================================================================
-- COURTZON V3 : ACADEMY G4 — CAPACITY + WAITLIST HARDENING
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- (Machine-readable classification enforced by backend/scripts/migration-guard.sh.
--  Promoted from LOCAL_DOCKER_ONLY → PRODUCTION_SAFE by the Phase 0 / Group 3
--  baseline-consistency hardening. Direct verification of the live Hostinger
--  database (2026-09-13) confirmed migrations 159–162 are already applied and
--  recorded in `migration_history`. The Academy G2–G8 schema is current
--  production state; keeping it LOCAL_DOCKER_ONLY would make the baseline and
--  migration history tell different stories. This migration is now eligible in
--  every environment so a fresh baseline hydration converges everywhere.)
--
-- Additive, backward-compatible, non-destructive.
-- Introduces the G4 capacity model on academy_programs:
--   * original_capacity          — immutable baseline (backfilled = capacity).
--   * capacity_override_amount   — temporary seats above original (NULL = none).
--   * capacity_override_until    — optional expiry (NULL = no expiry).
--   * capacity_override_by       — actor who set the override (audit aid).
--   * capacity_override_reason   — mandatory reason for any override change.
--
-- Effective maximum (computed in the application layer, never stored):
--   override active (amount > 0 and, if until set, until > now)
--     -> original_capacity + capacity_override_amount
--   otherwise -> original_capacity
--
-- original_capacity is NEVER mutated by override operations. Override changes
-- are non-retroactive: confirmed enrollments are never demoted.
--
-- The existing waitlist mechanism (academy_enrollments.status='waiting' +
-- waiting_order) is REUSED. No new waitlist table. waiting_order assignment is
-- hardened by serializing enrollment under a program FOR UPDATE lock in the
-- application layer; no unique constraint is added so existing legitimate data
-- cannot be broken.
--
-- ZERO financial postings: no ledger, settlement, wallet, or payment rows.
--
-- PRODUCTION SAFE (promoted). See baseline `001_courtzon_v3.sql` appended
-- ACADEMY G4 section for the equivalent fresh-hydration DDL.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) G4 capacity columns on academy_programs.
-- ---------------------------------------------------------------------------
ALTER TABLE `academy_programs`
  ADD COLUMN `original_capacity` int unsigned NOT NULL DEFAULT 0 AFTER `capacity`,
  ADD COLUMN `capacity_override_amount` int unsigned DEFAULT NULL AFTER `original_capacity`,
  ADD COLUMN `capacity_override_until` timestamp NULL DEFAULT NULL AFTER `capacity_override_amount`,
  ADD COLUMN `capacity_override_by` int unsigned DEFAULT NULL AFTER `capacity_override_until`,
  ADD COLUMN `capacity_override_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `capacity_override_by`,
  ADD CONSTRAINT `fk_academy_program_override_by` FOREIGN KEY (`capacity_override_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2) Backfill: the existing capacity is the original baseline.
--    capacity = 0 preserves the unlimited semantics (original_capacity = 0).
-- ---------------------------------------------------------------------------
UPDATE `academy_programs`
  SET `original_capacity` = `capacity`
  WHERE `original_capacity` = 0;

-- DOWN: intentionally omitted — this migration is a forward-only, additive
-- migration. The baseline captures the final schema; a fresh environment
-- rebuilds from `database/baseline/001_courtzon_v3.sql`.