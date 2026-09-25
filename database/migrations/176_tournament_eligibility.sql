-- ============================================================================
-- COURTZON V3 : TOURNAMENT ELIGIBILITY — AGE / GENDER / LEVEL (G7-A)
--
-- Group 7-A — data & domain foundation for structured Tournament Eligibility.
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- Business contract (protected):
--   AGE   = YEAR(tournaments.start_date) − YEAR(users.birth_date)  — YEAR ONLY.
--          No month/day, no "as of today", no as-of-registration/deadline.
--   MODE  = 'open' (no filtering) | 'categories' (multi-select reference
--          categories within ONE family: youth XOR masters, never both).
--   GENDER= multi-select ⊆ {male, female, mixed}; 'mixed' is a tournament
--          eligibility category, NOT a user gender (users.gender stays
--          male|female). No team-composition rule is introduced here.
--   LEVEL = multi-select references player_levels.id (authoritative taxonomy).
--          Empty = Open. Level NEVER applies to notification targeting.
--
-- Design notes:
--   * tournament_age_categories is the deterministic reference for age bands.
--     For YOUTH (u14/u16/u18): max_age set, min_age NULL (unbounded below).
--     For MASTERS (40_plus/45_plus/50_plus/55_plus): min_age set, max_age NULL
--     (unbounded above). A player is eligible when Tournament Age is inside
--     [min_age, max_age]. Once a category is used by a tournament/registration
--     it is treated as immutable from a business perspective (no per-category
--     history table is added for MVP; changes require a NEW row).
--   * tournaments gains 4 additive NULL-able columns. NULL rows resolve at
--     runtime to Open Age / No gender restriction / Open Level — every existing
--     tournament keeps its current behavior.
--   * tournament_registrations.eligibility_snapshot is a NULL-able JSON
--     reserved for the future G7-B eligibility service; NULL marks legacy/
--     pre-G7 registrations. No registration behavior changes in this group.
--   * Seeds are INSERT IGNORE (idempotent — safe when re-run).
--   * Additive only. No migration touches payments, accounting, wallet,
--     rating, matches, bookings, notifications or RBAC schema.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `tournament_age_categories` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('youth','masters') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `min_age` int unsigned DEFAULT NULL COMMENT 'Minimum Tournament Age (masters); NULL = unbounded below (youth)',
  `max_age` int unsigned DEFAULT NULL COMMENT 'Maximum Tournament Age (youth); NULL = unbounded above (masters)',
  `label_en` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `label_ar` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_age_cat_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Structured eligibility on tournaments (NULL/legacy = Open / unrestricted).
ALTER TABLE `tournaments`
  ADD COLUMN `age_mode` enum('open','categories') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'NULL = legacy row => Open Age',
  ADD COLUMN `age_category_ids` json DEFAULT NULL COMMENT 'Reference ids of tournament_age_categories (one family only, deterministically ordered)',
  ADD COLUMN `gender_categories` json DEFAULT NULL COMMENT 'Multi-select eligibility categories [male, female, mixed]; empty/NULL = open',
  ADD COLUMN `level_ids` json DEFAULT NULL COMMENT 'Reference ids of player_levels; empty/NULL = Open level';

-- Historical-scope snapshot for future registration eligibility (G7-B).
ALTER TABLE `tournament_registrations`
  ADD COLUMN `eligibility_snapshot` json DEFAULT NULL COMMENT 'Frozen eligibility context captured at registration time (NULL = legacy/pre-G7 registration)';

-- ── Reference seed data (idempotent) ─────────────────────────────────────────
INSERT IGNORE INTO `tournament_age_categories`
  (`id`, `slug`, `type`, `min_age`, `max_age`, `label_en`, `label_ar`, `is_active`) VALUES
  (1, 'u14', 'youth',    NULL, 14, 'U14', 'تحت 14', 1),
  (2, 'u16', 'youth',    NULL, 16, 'U16', 'تحت 16', 1),
  (3, 'u18', 'youth',    NULL, 18, 'U18', 'تحت 18', 1),
  (4, '40_plus', 'masters', 40, NULL, '40+', '40+', 1),
  (5, '45_plus', 'masters', 45, NULL, '45+', '45+', 1),
  (6, '50_plus', 'masters', 50, NULL, '50+', '50+', 1),
  (7, '55_plus', 'masters', 55, NULL, '55+', '55+', 1);