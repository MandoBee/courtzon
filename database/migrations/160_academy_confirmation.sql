-- ============================================================================
-- COURTZON V3 : ACADEMY G3 — CONFIRMATION LIFECYCLE
--
-- COURTZON_MIGRATION_ENV: LOCAL_DOCKER_ONLY
-- (Machine-readable classification enforced by backend/scripts/migration-guard.sh.
--  This migration is applied ONLY when COURTZON_MIGRATION_ENV=local. In
--  production/unknown environments it is skipped and never recorded.)
--
-- Additive, backward-compatible, non-destructive.
-- Introduces:
--   1. `reservation_status` enum extended with `confirmed` (G3 finalises
--      pending-hold sessions into confirmed, court-locked sessions).
--   2. `academy_schedules.locked_at` / `locked_by` — recurring schedules are
--      frozen after G3 confirmation.
--   3. `academy_group_sessions` — `confirmed_at`/`confirmed_by` + a snapshot of
--      the court price at finalisation time (`court_price_*`). Snapshot values
--      only; NO bookings rows, NO ledger/accounting/finance postings.
--   4. `academy_enrollments` — manual/offline payment acknowledgment
--      (`payment_confirmed_at`/`payment_confirmed_by`). No payment gateway,
--      transactions or financial postings are created by AGENTS confirmation.
--      Existing `confirmed` enrollments are backfilled as paid at `enrolled_at`
--      so the G3 UNPAID_ENROLLMENT gate is not retroactively broken.
--
-- Also normalises any legacy uppercase `reservation_status` values left by the
-- earlier G2 casing regression (the DB enum is lowercase).
--
-- LOCAL DOCKER DEVELOPMENT ONLY. Migration 160 MUST NEVER be applied to
-- Hostinger / production (157/158/159 are legacy dev migrations).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Extend reservation_status enum with `confirmed`.
-- ---------------------------------------------------------------------------
ALTER TABLE `academy_group_sessions`
  MODIFY COLUMN `reservation_status` enum('pending_court','conflict','pending_expired','deferred','resolved','confirmed') COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `status`;

-- Defensive normalization of any legacy uppercase engine labels.
UPDATE `academy_group_sessions`
  SET `reservation_status` = LOWER(`reservation_status`)
  WHERE `reservation_status` IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) schedule lock columns — recurring schedules freeze after confirmation.
-- ---------------------------------------------------------------------------
ALTER TABLE `academy_schedules`
  ADD COLUMN `locked_at` timestamp NULL DEFAULT NULL AFTER `updated_by`,
  ADD COLUMN `locked_by` int unsigned DEFAULT NULL AFTER `locked_at`,
  ADD CONSTRAINT `fk_academy_schedule_locked_by` FOREIGN KEY (`locked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3) session confirmation + court price snapshot columns.
--    reservation_status='confirmed' + confirmed_at/by mean the court slot is
--    finalised; court_price_* is a snapshot of the court price at finalisation
--    time (informational only — no financial postings).
-- ---------------------------------------------------------------------------
ALTER TABLE `academy_group_sessions`
  ADD COLUMN `confirmed_at` timestamp NULL DEFAULT NULL AFTER `generation_ref`,
  ADD COLUMN `confirmed_by` int unsigned DEFAULT NULL AFTER `confirmed_at`,
  ADD COLUMN `court_price_amount` decimal(12,2) DEFAULT NULL AFTER `confirmed_by`,
  ADD COLUMN `court_price_currency` char(3) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `court_price_amount`,
  ADD COLUMN `court_price_snapshot_at` timestamp NULL DEFAULT NULL AFTER `court_price_currency`,
  ADD KEY `idx_academy_session_confirmed` (`reservation_status`,`confirmed_at`),
  ADD CONSTRAINT `fk_academy_session_confirmed_by` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 4) enrollment payment acknowledgment columns + backfill.
-- ---------------------------------------------------------------------------
ALTER TABLE `academy_enrollments`
  ADD COLUMN `payment_confirmed_at` timestamp NULL DEFAULT NULL AFTER `completed_at`,
  ADD COLUMN `payment_confirmed_by` int unsigned DEFAULT NULL AFTER `payment_confirmed_at`,
  ADD KEY `idx_academy_payment_confirmed` (`status`,`payment_confirmed_at`),
  ADD CONSTRAINT `fk_academy_enrollment_payment_confirmed_by` FOREIGN KEY (`payment_confirmed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

UPDATE `academy_enrollments`
  SET `payment_confirmed_at` = `enrolled_at`
  WHERE `status` = 'confirmed' AND `payment_confirmed_at` IS NULL;

-- DOWN: intentionally omitted — this migration is a forward-only, additive
-- LOCAL DOCKER DEVELOPMENT migration. The baseline captures the final schema;
-- a fresh environment rebuilds from `database/baseline/001_courtzon_v3.sql`.