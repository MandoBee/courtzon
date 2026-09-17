-- ============================================================================
-- COURTZON V3 : MATCH HISTORICAL RULE-SET FREEZE (Group 4)
-- The Match freezes the rule set (sport_rule_sets version) at creation so a
-- later rule-version change never reinterprets an existing Match.
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- (Machine-readable classification for backend/scripts/migration-guard.sh —
--  eligible in every environment.)
--
-- Scope (Group 4 ONLY):
--   1. matches.rule_set_id    — the sport_rule_sets row active at Match creation
--   2. matches.rule_snapshot  — frozen rules JSON (same shape as
--      match_result_records.rules_snapshot) so the Match's scoring context is
--      historically reproducible without relying on mutable current config.
--
-- Rationale: Group 1 froze matches.format_snapshot; Group 2 froze participant
-- sides. Group 4 completes the historical context by freezing the rule set.
-- `match_result_records.rules_snapshot` remains the authoritative freeze for
-- each submitted result; this Match-level freeze covers the period BEFORE a
-- result exists (score entry must use the rules the Match was created under).
--
-- Design notes:
--   * Nullable + conservative backfill: existing matches get their rule set
--     recovered from the authoritative result record when one exists,
--     otherwise from the format's single active rule set (deterministic);
--     ambiguous rows stay NULL (legacy fallback preserved).
--   * No destructive operation, no DROP/TRUNCATE. UAT fixtures 11/12/13 and
--     bookings 27/28/29 are untouched.
-- ============================================================================

ALTER TABLE `matches`
  ADD COLUMN `rule_set_id` bigint unsigned DEFAULT NULL AFTER `format_snapshot`,
  ADD COLUMN `rule_snapshot` json DEFAULT NULL COMMENT 'Historical rule-set snapshot frozen at match creation',
  ADD KEY `idx_match_rule_set` (`rule_set_id`),
  ADD CONSTRAINT `fk_match_rule_set` FOREIGN KEY (`rule_set_id`)
    REFERENCES `sport_rule_sets` (`id`) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- Backfill (conservative, deterministic)
-- ---------------------------------------------------------------------------

-- 1) Authoritative evidence: an existing result record already froze the rule
--    set the match was scored under — reuse it verbatim.
UPDATE `matches` m
JOIN `match_result_records` r ON r.match_id = m.id
SET m.rule_set_id = r.rule_set_id,
    m.rule_snapshot = r.rules_snapshot
WHERE m.rule_set_id IS NULL;

-- 2) No result record yet: freeze the format's single active rule set when it
--    is unambiguous (exactly one active rule set for the format). Ambiguous or
--    missing stays NULL — never guessed.
UPDATE `matches` m
JOIN `sport_formats` sf ON sf.id = m.format_id
JOIN `sport_rule_sets` srs ON srs.format_id = sf.id AND srs.is_active = 1
SET m.rule_set_id = srs.id,
    m.rule_snapshot = srs.rules
WHERE m.rule_set_id IS NULL
  AND m.format_id IS NOT NULL
  AND (SELECT COUNT(*) FROM `sport_rule_sets` s2
        WHERE s2.format_id = sf.id AND s2.is_active = 1) = 1;