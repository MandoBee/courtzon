-- ============================================================================
-- COURTZON V3 : ACADEMY G1 — OWNERSHIP + COACH SETUP + CONFIRMATION FOUNDATION
--
-- Additive, backward-compatible, non-destructive.
-- Scope columns are nullable so pre-existing academy rows remain valid without
-- fabricating ownership (ownership is required for NEW academies via the API).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- academy_programs : Organization + Branch + Sport ownership and the
-- SETUP -> CONFIRMED lifecycle foundation (G1 confirmation only; financial /
-- court confirmation is a later group).
-- ---------------------------------------------------------------------------
ALTER TABLE `academy_programs`
  ADD COLUMN `organisation_id` int unsigned DEFAULT NULL AFTER `id`,
  ADD COLUMN `branch_id` int unsigned DEFAULT NULL AFTER `organisation_id`,
  ADD COLUMN `sport_id` int unsigned DEFAULT NULL AFTER `branch_id`,
  ADD COLUMN `lifecycle_state` enum('setup','confirmed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'setup' AFTER `is_public`,
  ADD COLUMN `confirmed_at` timestamp NULL DEFAULT NULL AFTER `lifecycle_state`,
  ADD COLUMN `confirmed_by` int unsigned DEFAULT NULL AFTER `confirmed_at`,
  ADD KEY `idx_academy_org` (`organisation_id`),
  ADD KEY `idx_academy_branch` (`branch_id`),
  ADD KEY `idx_academy_sport` (`sport_id`),
  ADD KEY `idx_academy_lifecycle` (`lifecycle_state`),
  ADD CONSTRAINT `fk_academy_prog_org` FOREIGN KEY (`organisation_id`) REFERENCES `organisations` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_academy_prog_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_academy_prog_sport` FOREIGN KEY (`sport_id`) REFERENCES `sports` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_academy_prog_confirmed_by` FOREIGN KEY (`confirmed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- academy_groups : Coach compensation configuration and coach lock metadata.
-- Coach compensation is an INSTITUTION expense — CourtZon takes no share.
-- ---------------------------------------------------------------------------
ALTER TABLE `academy_groups`
  ADD COLUMN `comp_type` enum('fixed_total','fixed_per_session','percent_gross') COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `coach_id`,
  ADD COLUMN `comp_value` decimal(12,2) DEFAULT NULL AFTER `comp_type`,
  ADD COLUMN `comp_currency` char(3) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `comp_value`,
  ADD COLUMN `coach_locked_at` timestamp NULL DEFAULT NULL AFTER `status`,
  ADD COLUMN `coach_locked_by` int unsigned DEFAULT NULL AFTER `coach_locked_at`,
  ADD CONSTRAINT `fk_academy_group_locked_by` FOREIGN KEY (`coach_locked_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;