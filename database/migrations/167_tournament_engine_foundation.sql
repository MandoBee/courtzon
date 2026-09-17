-- ============================================================================
-- COURTZON V3 : TOURNAMENT ENGINE FOUNDATION (Group 5A)
-- Tournament becomes an ORCHESTRATOR of the shared Match domain (Groups 1-4):
-- a tournament-generated Match lives in `matches` with frozen format + rule
-- snapshots; `tournament_matches` carries the bracket/progression metadata and
-- links to the real shared Match.
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- (Machine-readable classification for backend/scripts/migration-guard.sh —
--  eligible in every environment.)
--
-- Scope (Group 5A ONLY):
--   1. matches.tournament_id        — nullable link Match -> Tournament
--   2. tournaments.match_format_id  — nullable FK sport_formats (Match Format
--      the generated Matches must use; distinct from tournament progression
--      `format`)
--   3. tournaments.rule_set_id      — nullable FK sport_rule_sets (Rule Set the
--      generated Matches must freeze)
--   4. tournaments.draw_seed        — persisted deterministic draw seed
--      (reproducible + auditable draws)
--   5. tournament_stages            — stage table so MIXED tournaments can
--      declare per-stage progression + Match Format + Rule Set
--   6. tournament_matches.match_id  — nullable link to the shared `matches` row
--      (bracket metadata references the real Match; no parallel Match entity)
--
-- Design notes (AGENTS.md Database Relationship & Historical Data Policy):
--   * matches.tournament_id -> tournaments RESTRICT : a Match's tournament
--     provenance is historical and must survive a tournament archive attempt.
--   * tournament_matches.match_id -> matches RESTRICT : a bracket slot must
--     keep its real Match (never cascade-deleted).
--   * All new columns nullable + additive; NO DROP/TRUNCATE/reset. UAT
--     fixtures (matches 11/12/13, bookings 27/28/29) untouched.
--   * Existing tournament_matches rows (legacy parallel system) remain
--     readable for historical display; new generation links to `matches`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Match -> Tournament provenance
-- ---------------------------------------------------------------------------
ALTER TABLE `matches`
  ADD COLUMN `tournament_id` int unsigned DEFAULT NULL AFTER `sport_id`,
  ADD KEY `idx_match_tournament` (`tournament_id`),
  ADD CONSTRAINT `fk_match_tournament` FOREIGN KEY (`tournament_id`)
    REFERENCES `tournaments` (`id`) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 2. Tournament -> Match Format / Rule Set configuration
-- ---------------------------------------------------------------------------
ALTER TABLE `tournaments`
  ADD COLUMN `match_format_id` bigint unsigned DEFAULT NULL AFTER `format`,
  ADD COLUMN `rule_set_id` bigint unsigned DEFAULT NULL AFTER `match_format_id`,
  ADD COLUMN `draw_seed` bigint unsigned DEFAULT NULL AFTER `rule_set_id`,
  ADD KEY `idx_tourn_match_format` (`match_format_id`),
  ADD KEY `idx_tourn_rule_set` (`rule_set_id`),
  ADD CONSTRAINT `fk_tourn_match_format` FOREIGN KEY (`match_format_id`)
    REFERENCES `sport_formats` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `fk_tourn_rule_set` FOREIGN KEY (`rule_set_id`)
    REFERENCES `sport_rule_sets` (`id`) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 5. Tournament stages (Mixed tournaments: per-stage progression + format)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tournament_stages` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL,
  `stage_order` int unsigned NOT NULL DEFAULT '1',
  `name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `progression_format` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'round_robin',
  `match_format_id` bigint unsigned DEFAULT NULL,
  `rule_set_id` bigint unsigned DEFAULT NULL,
  `advance_count` int unsigned NOT NULL DEFAULT '1',
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stage_tournament` (`tournament_id`),
  KEY `idx_stage_match_format` (`match_format_id`),
  KEY `idx_stage_rule_set` (`rule_set_id`),
  CONSTRAINT `fk_stage_tournament` FOREIGN KEY (`tournament_id`)
    REFERENCES `tournaments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stage_match_format` FOREIGN KEY (`match_format_id`)
    REFERENCES `sport_formats` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_stage_rule_set` FOREIGN KEY (`rule_set_id`)
    REFERENCES `sport_rule_sets` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 6. tournament_matches -> shared matches link
-- ---------------------------------------------------------------------------
ALTER TABLE `tournament_matches`
  ADD COLUMN `match_id` bigint unsigned DEFAULT NULL AFTER `tournament_id`,
  ADD KEY `idx_tm_match` (`match_id`),
  ADD CONSTRAINT `fk_tm_match` FOREIGN KEY (`match_id`)
    REFERENCES `matches` (`id`) ON DELETE RESTRICT;