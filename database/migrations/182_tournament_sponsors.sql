-- ============================================================================
-- COURTZON V3 : TOURNAMENT SPONSORS (Tournament phase — sponsors)
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- Simple tournament-level sponsor model (product rule):
--   * A tournament may have ZERO, ONE, or MANY sponsors (multiple rows).
--   * support_type CASH: amount > 0 REQUIRED; amount is tournament revenue of
--     the owning Organisation/creator (NOT CourtZon revenue). NO GL posting in
--     this phase — stored as sponsor data only.
--   * support_type IN-KIND: description REQUIRED; amount MUST stay NULL — no
--     monetary value is ever stored.
--   * display_order provides deterministic ordering (insert order by default).
--
-- Convention mirrors tournament_prizes/prize_awards (bigint id + public_id,
-- utf8mb4_unicode_ci, created_at/updated_at, FK to tournaments ON DELETE
-- CASCADE). No soft-delete column (the tournament child tables do not use one),
-- no accounting/ledger/sponsor-GL tables.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `tournament_sponsors` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tournament_id` int unsigned NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `support_type` enum('cash','inkind') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(12,2) DEFAULT NULL COMMENT 'CASH sponsors only; must be > 0. NULL for IN-KIND.',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT 'IN-KIND sponsors only; descriptive (trophies, medals, gifts, equipment, products).',
  `display_order` int unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tsp_tournament` (`tournament_id`),
  KEY `idx_tsp_order` (`tournament_id`,`display_order`),
  CONSTRAINT `fk_tsp_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;