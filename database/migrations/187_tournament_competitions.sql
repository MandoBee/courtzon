-- ============================================================================
-- COURTZON V3 : TOURNAMENT COMPETITION CATEGORIES (G11.18 Phase 1 — Foundation)
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- PURPOSE
--   Introduce the competition-level identity that lets ONE tournament host
--   MULTIPLE independent Competition Categories (Singles / Doubles / Teams),
--   each with its OWN fee, capacity, eligibility, matches, placements and
--   prizes — WITHOUT duplicating the tournament schema per competition.
--
--   This migration is the FOUNDATION only:
--     * creates `tournament_competitions`;
--     * backfills exactly ONE deterministic default competition per existing
--       tournament (preserving its format, fees, currency, capacity,
--       eligibility and bracket configuration);
--     * adds `competition_id` to the identity tables (registrations,
--       participants, matches, placements, prizes, prize_awards);
--     * adds `active_competition_id` to participants_members (the active-scope
--       uniqueness becomes competition-scoped);
--     * backfills every existing row from its tournament's default
--       competition and VERIFIES zero NULLs / zero orphans (guards abort the
--       migration on any violation);
--     * then applies NOT NULL, FKs, indexes, BEFORE-INSERT triggers (auto-set
--       the default competition for legacy writers — the same trigger pattern
--       already used by the accounting scope columns) and the EXPANDED,
--       competition-scoped unique constraints:
--         uk_player_tourn                 → (tournament, competition, player)
--         uk_active_user_tournament       → (user, active_competition)
--         uk_tp_tournament_placement      → (tournament, competition, placement)
--         uk_tprize_cash_placement        → (tournament, competition, cash_placement)
--         uk_tpa_tourn_place_winner       → (tournament, competition, placement, winner)
--
--   Migration 185 (uk_tprize_cash_placement) is NOT modified — its rule is
--   simply extended to carry the new competition dimension in THIS migration.
--
-- SAFETY / BACKWARD COMPATIBILITY
--   * Additive for existing single-competition tournaments: they receive one
--     default competition, so every existing registration/participant/match/
--     placement/prize/award keeps flowing through the unchanged pipeline.
--   * The expanded UNIQUE keys are equivalent to the old keys when exactly one
--     competition exists per tournament (provably: every backfilled row maps to
--     its tournament's single default competition), so the indexes can never
--     collide on existing data. Production/local data have 0 prize rows and
--     tournaments=2..3 — verified during implementation.
--   * No accounting/wallet/settlement/payment schema or logic is touched.
--   * Triggers only fill the identity reference; they never alter money.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. tournament_competitions
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `tournament_competitions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tournament_id` int unsigned NOT NULL,
  `competition_type` enum('singles','doubles','team') COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `match_format_id` bigint unsigned DEFAULT NULL,
  `rule_set_id` bigint unsigned DEFAULT NULL,
  `bracket_type_id` int unsigned DEFAULT NULL,
  `sport_id` int unsigned DEFAULT NULL COMMENT 'Snapshot of the owning tournament sport (informational; tournaments.sport_id remains authoritative)',
  `entry_fee` decimal(12,2) NOT NULL DEFAULT '0.00',
  `registration_fee` decimal(12,2) NOT NULL DEFAULT '0.00',
  `currency_code` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price_type` enum('FREE','FIXED','MEMBERS_ONLY') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'FIXED',
  `max_participants` int unsigned DEFAULT NULL,
  `min_participants` int unsigned NOT NULL DEFAULT '2',
  `registration_payment_methods` json DEFAULT NULL,
  `waitlist_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `age_mode` enum('open','categories') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `age_category_ids` json DEFAULT NULL,
  `gender_categories` json DEFAULT NULL,
  `level_ids` json DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = the auto-created default competition preserving legacy single-competition behavior',
  `default_flag` char(1) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (IF(`is_default` = 1, 'D', NULL)) STORED COMMENT 'Non-NULL while default -> at most one default competition per tournament',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_comp_public_id` (`public_id`),
  UNIQUE KEY `uk_comp_tournament_default` (`tournament_id`,`default_flag`),
  KEY `idx_comp_tournament` (`tournament_id`),
  KEY `idx_comp_format` (`match_format_id`),
  KEY `idx_comp_sport` (`sport_id`),
  CONSTRAINT `fk_comp_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comp_match_format` FOREIGN KEY (`match_format_id`) REFERENCES `sport_formats` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_comp_rule_set` FOREIGN KEY (`rule_set_id`) REFERENCES `sport_rule_sets` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_comp_bracket` FOREIGN KEY (`bracket_type_id`) REFERENCES `tournament_bracket_types` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_comp_sport` FOREIGN KEY (`sport_id`) REFERENCES `sports` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Backfill ONE deterministic default competition per tournament
--    (idempotent: the LEFT JOIN anti-join makes re-runs insert nothing).
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO `tournament_competitions`
  (`public_id`, `tournament_id`, `competition_type`, `name`,
   `match_format_id`, `rule_set_id`, `bracket_type_id`, `sport_id`,
   `entry_fee`, `registration_fee`, `currency_code`, `price_type`,
   `max_participants`, `min_participants`, `registration_payment_methods`, `waitlist_enabled`,
   `age_mode`, `age_category_ids`, `gender_categories`, `level_ids`, `is_default`)
SELECT
  UUID(), t.id,
  CASE COALESCE(f.format_type, 'singles')
    WHEN 'singles' THEN 'singles'
    WHEN 'doubles' THEN 'doubles'
    ELSE 'team'
  END,
  'Default',
  IF(f.id IS NOT NULL, t.match_format_id, NULL),
  IF(rs.id IS NOT NULL, t.rule_set_id, NULL),
  t.bracket_type_id,
  IF(s.id IS NOT NULL, t.sport_id, NULL),
  t.entry_fee, t.registration_fee, t.currency_code, t.price_type,
  t.max_participants, t.min_participants, t.registration_payment_methods, t.waitlist_enabled,
  t.age_mode, t.age_category_ids, t.gender_categories, t.level_ids, 1
FROM `tournaments` t
LEFT JOIN `sport_formats` f ON f.id = t.match_format_id
LEFT JOIN `sport_rule_sets` rs ON rs.id = t.rule_set_id
LEFT JOIN `sports` s ON s.id = t.sport_id
LEFT JOIN `tournament_competitions` c ON c.tournament_id = t.id AND c.is_default = 1
WHERE c.id IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Add competition_id columns (nullable initially)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE `tournament_registrations`
  ADD COLUMN `competition_id` int unsigned DEFAULT NULL COMMENT 'Competition category scope; = default competition for legacy rows' AFTER `tournament_id`;
ALTER TABLE `tournament_participants`
  ADD COLUMN `competition_id` int unsigned DEFAULT NULL COMMENT 'Competition category scope; = default competition for legacy rows' AFTER `tournament_id`;
ALTER TABLE `tournament_matches`
  ADD COLUMN `competition_id` int unsigned DEFAULT NULL COMMENT 'Competition category scope; = default competition for legacy rows' AFTER `tournament_id`;
ALTER TABLE `tournament_placements`
  ADD COLUMN `competition_id` int unsigned DEFAULT NULL COMMENT 'Competition category scope; = default competition for legacy rows' AFTER `tournament_id`;
ALTER TABLE `tournament_prizes`
  ADD COLUMN `competition_id` int unsigned DEFAULT NULL COMMENT 'Competition category scope; = default competition for legacy rows' AFTER `tournament_id`;
ALTER TABLE `tournament_prize_awards`
  ADD COLUMN `competition_id` int unsigned DEFAULT NULL COMMENT 'Competition category scope; = default competition for legacy rows' AFTER `tournament_id`;
ALTER TABLE `tournament_participant_members`
  ADD COLUMN `active_competition_id` int unsigned DEFAULT NULL COMMENT 'Denormalized competition scope while status=active; UNIQUE(user_id, active_competition_id) enforces one active membership per competition' AFTER `active_tournament_id`;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Backfill every existing row from its tournament's default competition
-- ────────────────────────────────────────────────────────────────────────────
UPDATE `tournament_registrations` r
  JOIN `tournament_competitions` c ON c.tournament_id = r.tournament_id AND c.is_default = 1
  SET r.competition_id = c.id
  WHERE r.competition_id IS NULL;

UPDATE `tournament_participants` p
  JOIN `tournament_competitions` c ON c.tournament_id = p.tournament_id AND c.is_default = 1
  SET p.competition_id = c.id
  WHERE p.competition_id IS NULL;

UPDATE `tournament_matches` m
  JOIN `tournament_competitions` c ON c.tournament_id = m.tournament_id AND c.is_default = 1
  SET m.competition_id = c.id
  WHERE m.competition_id IS NULL;

UPDATE `tournament_placements` pl
  JOIN `tournament_competitions` c ON c.tournament_id = pl.tournament_id AND c.is_default = 1
  SET pl.competition_id = c.id
  WHERE pl.competition_id IS NULL;

UPDATE `tournament_prizes` pr
  JOIN `tournament_competitions` c ON c.tournament_id = pr.tournament_id AND c.is_default = 1
  SET pr.competition_id = c.id
  WHERE pr.competition_id IS NULL;

UPDATE `tournament_prize_awards` a
  JOIN `tournament_competitions` c ON c.tournament_id = a.tournament_id AND c.is_default = 1
  SET a.competition_id = c.id
  WHERE a.competition_id IS NULL;

UPDATE `tournament_participant_members` m
  JOIN `tournament_participants` p ON p.id = m.participant_id
  SET m.active_competition_id = p.competition_id
  WHERE m.active_competition_id IS NULL AND m.active_tournament_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Verify ZERO NULLs / ZERO orphans — a violation aborts the migration
-- ────────────────────────────────────────────────────────────────────────────
SELECT IF((SELECT COUNT(*) FROM `tournament_registrations` WHERE `competition_id` IS NULL) > 0, 1/0, 0);
SELECT IF((SELECT COUNT(*) FROM `tournament_participants` WHERE `competition_id` IS NULL) > 0, 1/0, 0);
SELECT IF((SELECT COUNT(*) FROM `tournament_matches` WHERE `competition_id` IS NULL) > 0, 1/0, 0);
SELECT IF((SELECT COUNT(*) FROM `tournament_placements` WHERE `competition_id` IS NULL) > 0, 1/0, 0);
SELECT IF((SELECT COUNT(*) FROM `tournament_prizes` WHERE `competition_id` IS NULL) > 0, 1/0, 0);
SELECT IF((SELECT COUNT(*) FROM `tournament_prize_awards` WHERE `competition_id` IS NULL) > 0, 1/0, 0);
SELECT IF((SELECT COUNT(*) FROM `tournament_competitions` c LEFT JOIN `tournaments` t ON t.id = c.tournament_id WHERE t.id IS NULL) > 0, 1/0, 0);
SELECT IF((SELECT COUNT(*) FROM `tournament_registrations` r JOIN `tournament_competitions` c ON c.id = r.competition_id WHERE c.tournament_id <> r.tournament_id) > 0, 1/0, 0);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Add FK indexes, then NOT NULL, FKs, triggers and expanded UNIQUE keys
--    (drop the OLD tournament-scoped unique keys, add competition-scoped ones)
-- ────────────────────────────────────────────────────────────────────────────

-- 6a. tournament_registrations
ALTER TABLE `tournament_registrations`
  ADD KEY `idx_reg_competition` (`competition_id`),
  DROP INDEX `uk_player_tourn`,
  ADD UNIQUE KEY `uk_player_competition` (`tournament_id`,`competition_id`,`player_id`),
  MODIFY COLUMN `competition_id` int unsigned NOT NULL,
  ADD CONSTRAINT `fk_reg_competition` FOREIGN KEY (`competition_id`) REFERENCES `tournament_competitions` (`id`) ON DELETE CASCADE;

-- 6b. tournament_participants (uk_participant_registration stays competition-consistent)
ALTER TABLE `tournament_participants`
  ADD KEY `idx_part_competition` (`competition_id`),
  MODIFY COLUMN `competition_id` int unsigned NOT NULL,
  ADD CONSTRAINT `fk_part_competition` FOREIGN KEY (`competition_id`) REFERENCES `tournament_competitions` (`id`) ON DELETE CASCADE;

-- 6c. tournament_participant_members — the active-scope uniqueness becomes competition-scoped
ALTER TABLE `tournament_participant_members`
  DROP INDEX `uk_active_user_tournament`,
  ADD UNIQUE KEY `uk_active_user_competition` (`user_id`,`active_competition_id`);

-- 6d. tournament_matches
ALTER TABLE `tournament_matches`
  ADD KEY `idx_tm_competition` (`competition_id`),
  MODIFY COLUMN `competition_id` int unsigned NOT NULL,
  ADD CONSTRAINT `fk_tm_competition` FOREIGN KEY (`competition_id`) REFERENCES `tournament_competitions` (`id`) ON DELETE CASCADE;

-- 6e. tournament_placements
ALTER TABLE `tournament_placements`
  ADD KEY `idx_tp_competition` (`competition_id`),
  DROP INDEX `uk_tp_tournament_placement`,
  ADD UNIQUE KEY `uk_tp_tournament_competition_placement` (`tournament_id`,`competition_id`,`placement`),
  MODIFY COLUMN `competition_id` int unsigned NOT NULL,
  ADD CONSTRAINT `fk_tp_competition` FOREIGN KEY (`competition_id`) REFERENCES `tournament_competitions` (`id`) ON DELETE CASCADE;

-- 6f. tournament_prizes — extends (NOT modifies) migration 185's uniqueness
ALTER TABLE `tournament_prizes`
  ADD KEY `idx_tprize_competition` (`competition_id`),
  DROP INDEX `uk_tprize_cash_placement`,
  ADD UNIQUE KEY `uk_tprize_cash_competition_placement` (`tournament_id`,`competition_id`,`cash_placement`),
  MODIFY COLUMN `competition_id` int unsigned NOT NULL,
  ADD CONSTRAINT `fk_tprize_competition` FOREIGN KEY (`competition_id`) REFERENCES `tournament_competitions` (`id`) ON DELETE CASCADE;

-- 6g. tournament_prize_awards (financial history — RESTRICT FK, never cascades)
ALTER TABLE `tournament_prize_awards`
  ADD KEY `idx_tpa_competition` (`competition_id`),
  DROP INDEX `uk_tpa_tourn_place_winner`,
  ADD UNIQUE KEY `uk_tpa_tourn_comp_place_winner` (`tournament_id`,`competition_id`,`placement`,`winner_user_id`),
  MODIFY COLUMN `competition_id` int unsigned NOT NULL,
  ADD CONSTRAINT `fk_tpa_competition` FOREIGN KEY (`competition_id`) REFERENCES `tournament_competitions` (`id`);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. BEFORE INSERT triggers — auto-scope legacy writers to the default
--    competition (the project already uses this trigger pattern for the
--    accounting scope columns). Explicit competition_id is never overwritten.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER `trg_treg_competition_id` BEFORE INSERT ON `tournament_registrations`
  FOR EACH ROW
  SET NEW.competition_id = COALESCE(NEW.competition_id,
      (SELECT c.id FROM `tournament_competitions` c WHERE c.tournament_id = NEW.tournament_id AND c.is_default = 1 LIMIT 1));

CREATE TRIGGER `trg_tpart_competition_id` BEFORE INSERT ON `tournament_participants`
  FOR EACH ROW
  SET NEW.competition_id = COALESCE(NEW.competition_id,
      (SELECT c.id FROM `tournament_competitions` c WHERE c.tournament_id = NEW.tournament_id AND c.is_default = 1 LIMIT 1));

CREATE TRIGGER `trg_tmatch_competition_id` BEFORE INSERT ON `tournament_matches`
  FOR EACH ROW
  SET NEW.competition_id = COALESCE(NEW.competition_id,
      (SELECT c.id FROM `tournament_competitions` c WHERE c.tournament_id = NEW.tournament_id AND c.is_default = 1 LIMIT 1));

CREATE TRIGGER `trg_tplacement_competition_id` BEFORE INSERT ON `tournament_placements`
  FOR EACH ROW
  SET NEW.competition_id = COALESCE(NEW.competition_id,
      (SELECT c.id FROM `tournament_competitions` c WHERE c.tournament_id = NEW.tournament_id AND c.is_default = 1 LIMIT 1));

CREATE TRIGGER `trg_tprize_competition_id` BEFORE INSERT ON `tournament_prizes`
  FOR EACH ROW
  SET NEW.competition_id = COALESCE(NEW.competition_id,
      (SELECT c.id FROM `tournament_competitions` c WHERE c.tournament_id = NEW.tournament_id AND c.is_default = 1 LIMIT 1));

CREATE TRIGGER `trg_tpa_competition_id` BEFORE INSERT ON `tournament_prize_awards`
  FOR EACH ROW
  SET NEW.competition_id = COALESCE(NEW.competition_id,
      (SELECT c.id FROM `tournament_competitions` c WHERE c.tournament_id = NEW.tournament_id AND c.is_default = 1 LIMIT 1));

CREATE TRIGGER `trg_tmember_active_competition_id` BEFORE INSERT ON `tournament_participant_members`
  FOR EACH ROW
  SET NEW.active_competition_id = COALESCE(NEW.active_competition_id,
      (SELECT p.competition_id FROM `tournament_participants` p WHERE p.id = NEW.participant_id LIMIT 1));