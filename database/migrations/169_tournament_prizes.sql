-- ============================================================================
-- COURTZON V3 : STRUCTURED TOURNAMENT PRIZES (Group 2)
-- Introduces a reusable, structured prize model for Tournaments.
--
-- Requirement: a Tournament prize must support multiple prize categories
-- (cash / gold / silver / bronze / trophy / gift / other) and multiple
-- placements, with MORE THAN ONE prize per placement (e.g. 1st = Cash +
-- Gold medal + Trophy). This cannot be expressed in the legacy free-text
-- `tournaments.prize_description` column, which is retained as a backwards-
-- compatible fallback and is NEVER fabricated into structured rows.
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- (Machine-readable classification for backend/scripts/migration-guard.sh —
--  eligible in every environment.)
--
-- Design notes (AGENTS.md Database Relationship & Historical Data Policy):
--   * `tournament_prizes` is a logical child of `tournaments` → the owning
--     entity relationship is CASCADE (deleting a tournament cleans its prizes).
--   * `amount` is NULL for non-cash prizes and `currency_code` is NULL for
--     non-cash prizes. Cash prizes MUST carry the Tournament's authoritative
--     resolved currency (branch → organisation country default), never a
--     hardcoded code and never an arbitrary client-supplied one.
--   * `placement` is a nullable unsigned int: NULL = special/non-ranked prize,
--     1 = 1st, 2 = 2nd, 3 = 3rd, N = arbitrary ranked placement. This allows
--     special prizes (e.g. a "Best of the tournament" Gift) that are not tied
--     to a rank while preserving deterministic ordering via `display_order`.
--   * `prize_type` is a stable machine-readable ENUM — never arbitrary
--     free-text as the primary discriminator.
--   * Additive ONLY. NO DROP/TRUNCATE/reset. No rewrite of existing
--     tournaments.prize_description. No fabrication of structured prizes from
--     legacy text.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `tournament_prizes` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL,
  `placement` int unsigned DEFAULT NULL COMMENT 'Ranked placement (1=1st, 2=2nd, 3=3rd, ...); NULL = special/non-ranked prize',
  `prize_type` enum('cash','gold','silver','bronze','trophy','gift','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(12,2) DEFAULT NULL COMMENT 'Monetary value for cash prizes; NULL for non-cash prizes',
  `currency_code` char(3) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Authoritative Tournament currency for cash prizes; NULL for non-cash prizes',
  `display_order` int unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tprize_tournament` (`tournament_id`),
  KEY `idx_tprize_order` (`tournament_id`, `display_order`),
  CONSTRAINT `fk_tprize_tournament` FOREIGN KEY (`tournament_id`)
    REFERENCES `tournaments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;