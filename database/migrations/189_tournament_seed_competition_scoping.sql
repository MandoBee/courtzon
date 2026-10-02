-- ============================================================================
-- COURTZON V3 : COMPETITION-SCOPED TOURNAMENT SEEDS (G11.19)
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- PURPOSE
--   Fix the real competition-isolation defect in the seed namespace.
--   `tournament_seeds` was tournament-scoped (`uk_seed_tournament_number
--   (tournament_id, seed_number)`), so in a multi-competition tournament
--   Competition A seed #1 and Competition B seed #1 were treated as a
--   UNIQUE conflict. The seed namespace must be per competition:
--
--     (tournament_id, competition_id, seed_number)
--
-- REQUIREMENTS
--   * Add `competition_id` to `tournament_seeds`.
--   * Backfill every existing seed from its tournament's single DEFAULT
--     competition (deterministic, idempotent).
--   * Fail fast: abort if any seed cannot resolve to a valid competition
--     (zero NULL / zero orphan enforced by guard queries before NOT NULL/FK).
--   * Replace the tournament-scoped unique key with the competition-scoped one.
--   * Add the FK + index consistent with migrations 187/188.
--   * No financial table is touched. Migration fully additive.
--
-- SAFETY / BACKWARD COMPATIBILITY
--   * For existing single-competition tournaments the expanded unique is
--     provably identical to the old one (every row maps to the single default).
--   * `uk_seed_participant (participant_id)` is UNCHANGED (a participant has
--     exactly one seed).
--   * Does NOT modify migrations 185/186/187/188.
-- ============================================================================

-- 1. Add the column (nullable initially).
ALTER TABLE `tournament_seeds`
  ADD COLUMN `competition_id` int unsigned DEFAULT NULL COMMENT 'Competition category scope; = default competition for legacy rows' AFTER `tournament_id`;

-- 2. Backfill every row from its tournament's single default competition.
UPDATE `tournament_seeds` s
  JOIN `tournament_competitions` c ON c.tournament_id = s.tournament_id AND c.is_default = 1
  SET s.competition_id = c.id
  WHERE s.competition_id IS NULL;

-- 3. Fail-fast verification before enforcing NOT NULL/FK (any NULL/orphan aborts).
SELECT IF((SELECT COUNT(*) FROM `tournament_seeds` WHERE `competition_id` IS NULL) > 0, 1/0, 0);
SELECT IF((SELECT COUNT(*) FROM `tournament_seeds` s LEFT JOIN `tournament_competitions` c ON c.id = s.competition_id
          WHERE c.id IS NULL OR c.tournament_id <> s.tournament_id) > 0, 1/0, 0);

-- 4. Enforce the competition-scoped namespace.
ALTER TABLE `tournament_seeds`
  MODIFY COLUMN `competition_id` int unsigned NOT NULL,
  DROP INDEX `uk_seed_tournament_number`,
  ADD UNIQUE KEY `uk_seed_tournament_competition_number` (`tournament_id`,`competition_id`,`seed_number`),
  ADD KEY `idx_seed_competition` (`competition_id`),
  ADD CONSTRAINT `fk_seed_competition` FOREIGN KEY (`competition_id`) REFERENCES `tournament_competitions` (`id`) ON DELETE CASCADE;