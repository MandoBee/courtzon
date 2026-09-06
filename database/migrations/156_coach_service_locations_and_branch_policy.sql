-- Migration 156: Coach Service Locations & Branch Coach Policy
-- Adds:
--   1. `coach_policy` ENUM on `branches` — controls whether branches require
--      a formal coach-organisation agreement or allow independent coaches.
--   2. `coach_service_locations` table — maps which branches a coach can
--      provide services at (independent of any financial agreement).

-- ─── 1. Branch coach policy ────────────────────────────────────────────────
ALTER TABLE `branches`
  ADD COLUMN `coach_policy` ENUM('contract_required','independent_coaches_allowed')
    NOT NULL DEFAULT 'contract_required'
    AFTER `access_type`;

-- ─── 2. Coach service locations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `coach_service_locations` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `coach_id`   INT UNSIGNED NOT NULL,
  `branch_id`  INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_coach_branch` (`coach_id`, `branch_id`),
  KEY `idx_csl_coach` (`coach_id`),
  KEY `idx_csl_branch` (`branch_id`),
  CONSTRAINT `fk_csl_coach`  FOREIGN KEY (`coach_id`)  REFERENCES `coach_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_csl_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
