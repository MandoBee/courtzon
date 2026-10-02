-- ============================================================================
-- COURTZON V3 : TOURNAMENT VENUE MODES + COMPETITION-SCOPED DRAW/STAGE/GROUP (G11.18 Phase 3)
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- PURPOSE
--   1. VENUE — a tournament now declares how courts/venue are handled:
--        ORGANISATION_COURTS (default; existing branch/court booking model) OR
--        EXTERNAL_VENUE (informational location data captured by the map picker;
--        NO fake CourtZon resource is ever created).
--      A competition may OPTIONALLY override the tournament venue
--      (`tournament_competitions.venue_override` JSON — validated server-side;
--      documented shape). Effective venue = competition.venue_override ?? tournament.venue.
--   2. DRAW/STAGE/GROUP SCOPING — Singles/Doubles/Teams must never share a
--      draw / stage / group namespace inside one tournament. `competition_id`
--      is added and backfilled from each tournament's single DEFAULT competition
--      (existing behavior preserved), then enforced NOT NULL + FK + index.
--      `uk_draw_attempt` is extended to `(tournament_id, competition_id, attempt_number)`
--      so two competitions may each own attempt #1.
--
-- SAFETY / BACKWARD COMPATIBILITY
--   * Additive; validates ZERO NULLs / ZERO orphan competition ids before NOT NULL.
--   * For existing single-competition tournaments the expanded constraint is
--     provably identical to the old one (every row maps to the single default).
--   * No accounting/wallet/ledger/prize/settlement/refund schema or logic touched.
--   * Does NOT modify migrations 185/186/187.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. tournaments — venue mode + external/default venue fields
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE `tournaments`
  ADD COLUMN `venue_type` enum('ORGANISATION_COURTS','EXTERNAL_VENUE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ORGANISATION_COURTS' COMMENT 'How tournament courts/venue are handled; existing tournaments are ORGANISATION_COURTS (no invented external venue data)' AFTER `branch_id`,
  ADD COLUMN `venue_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'External venue / courts place name (ORGANISATION_COURTS may still be blank; branch name is used for display)' AFTER `venue_type`,
  ADD COLUMN `venue_address` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `venue_name`,
  ADD COLUMN `venue_city` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `venue_address`,
  ADD COLUMN `venue_country` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `venue_city`,
  ADD COLUMN `latitude` decimal(10,7) DEFAULT NULL AFTER `venue_country`,
  ADD COLUMN `longitude` decimal(10,7) DEFAULT NULL AFTER `latitude`,
  ADD COLUMN `place_id` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Optional provider place identifier (e.g. OSM osm_id); never a secret' AFTER `longitude`,
  ADD COLUMN `venue_contact` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `place_id`,
  ADD COLUMN `maps_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Safe key-less map/navigation link; always derived server-side from coordinates' AFTER `venue_contact`;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. tournament_competitions — optional venue override (validated JSON, server-side)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE `tournament_competitions`
  ADD COLUMN `venue_override` json DEFAULT NULL COMMENT 'Optional competition-level venue override. Documented shape: {venueName,address,city,country,latitude,longitude,placeId,venueContact,mapsUrl}. NULL = inherit the tournament venue.' AFTER `sport_id`;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. tournament_draws / tournament_stages / tournament_groups — competition_id
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE `tournament_draws`
  ADD COLUMN `competition_id` int unsigned DEFAULT NULL COMMENT 'Competition category scope; = default competition for legacy rows' AFTER `tournament_id`;

ALTER TABLE `tournament_stages`
  ADD COLUMN `competition_id` int unsigned DEFAULT NULL COMMENT 'Competition category scope; = default competition for legacy rows' AFTER `tournament_id`;

ALTER TABLE `tournament_groups`
  ADD COLUMN `competition_id` int unsigned DEFAULT NULL COMMENT 'Competition category scope; = default competition for legacy rows' AFTER `tournament_id`;

-- Backfill from the tournament's single default competition (deterministic).
UPDATE `tournament_draws` d
  JOIN `tournament_competitions` c ON c.tournament_id = d.tournament_id AND c.is_default = 1
  SET d.competition_id = c.id
  WHERE d.competition_id IS NULL;

UPDATE `tournament_stages` s
  JOIN `tournament_competitions` c ON c.tournament_id = s.tournament_id AND c.is_default = 1
  SET s.competition_id = c.id
  WHERE s.competition_id IS NULL;

UPDATE `tournament_groups` g
  JOIN `tournament_competitions` c ON c.tournament_id = g.tournament_id AND c.is_default = 1
  SET g.competition_id = c.id
  WHERE g.competition_id IS NULL;

-- Fail-fast verification: any NULL / orphan aborts the migration.
SELECT IF((SELECT COUNT(*) FROM `tournament_draws` WHERE `competition_id` IS NULL) > 0, 1/0, 0);
SELECT IF((SELECT COUNT(*) FROM `tournament_stages` WHERE `competition_id` IS NULL) > 0, 1/0, 0);
SELECT IF((SELECT COUNT(*) FROM `tournament_groups` WHERE `competition_id` IS NULL) > 0, 1/0, 0);
SELECT IF((SELECT COUNT(*) FROM `tournament_draws` d LEFT JOIN `tournament_competitions` c ON c.id = d.competition_id WHERE c.id IS NULL OR c.tournament_id <> d.tournament_id) > 0, 1/0, 0);
SELECT IF((SELECT COUNT(*) FROM `tournament_stages` s LEFT JOIN `tournament_competitions` c ON c.id = s.competition_id WHERE c.id IS NULL OR c.tournament_id <> s.tournament_id) > 0, 1/0, 0);
SELECT IF((SELECT COUNT(*) FROM `tournament_groups` g LEFT JOIN `tournament_competitions` c ON c.id = g.competition_id WHERE c.id IS NULL OR c.tournament_id <> g.tournament_id) > 0, 1/0, 0);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Enforce NOT NULL + FK + index; extend the draw-attempt uniqueness to the
--    competition dimension.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE `tournament_draws`
  MODIFY COLUMN `competition_id` int unsigned NOT NULL,
  ADD KEY `idx_draw_competition` (`competition_id`),
  DROP INDEX `uk_draw_attempt`,
  ADD UNIQUE KEY `uk_draw_attempt` (`tournament_id`,`competition_id`,`attempt_number`),
  ADD CONSTRAINT `fk_draw_competition` FOREIGN KEY (`competition_id`) REFERENCES `tournament_competitions` (`id`) ON DELETE CASCADE;

ALTER TABLE `tournament_stages`
  MODIFY COLUMN `competition_id` int unsigned NOT NULL,
  ADD KEY `idx_stage_competition` (`competition_id`),
  ADD CONSTRAINT `fk_stage_competition` FOREIGN KEY (`competition_id`) REFERENCES `tournament_competitions` (`id`) ON DELETE CASCADE;

ALTER TABLE `tournament_groups`
  MODIFY COLUMN `competition_id` int unsigned NOT NULL,
  ADD KEY `idx_group_competition` (`competition_id`),
  ADD CONSTRAINT `fk_group_competition` FOREIGN KEY (`competition_id`) REFERENCES `tournament_competitions` (`id`) ON DELETE CASCADE;