-- ============================================================================
-- COURTZON V3 : MATCH FORMAT FOUNDATION (Group 1)
-- Authoritative Match -> Sport Format relationship + historical snapshot.
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- (Machine-readable classification for backend/scripts/migration-guard.sh —
--  eligible in every environment.)
--
-- Scope (Group 1 ONLY):
--   1. sport_formats.players_per_side   — per-format side size configuration
--      (singles = 1, doubles = 2, team = configured team size; NULL = unset)
--   2. matches.format_id                — authoritative Match -> Sport Format link
--   3. matches.format_snapshot          — historical format snapshot frozen at
--      creation so later sport-format edits never reinterpret an old Match
--
-- OUT OF SCOPE (later groups): authoritative participant sides, team grouping,
-- match creation UI, tournament format inheritance, result-card redesign,
-- rating changes, admin/org UI.
--
-- Design notes (AGENTS.md Database Relationship & Historical Data Policy):
--   * matches.format_id -> sport_formats RESTRICT : a Match's format identity
--     is historical and must survive a sport-format archive attempt.
--   * matches.format_snapshot is denormalized JSON (like
--     match_result_records.rules_snapshot) so the Match carries its own
--     historical format even if the sport_format row is later edited.
--   * Existing matches are backfilled conservatively: an existing result
--     record's format_id is authoritative; otherwise a sport's SINGLE active
--     default format is used; ambiguous rows stay NULL (never guessed).
--   * UAT fixtures (matches 11/12/13, bookings 27/28/29) are NOT deleted or
--     altered beyond the deterministic format backfill below.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. sport_formats.players_per_side (NULL = not configured)
-- ---------------------------------------------------------------------------
ALTER TABLE `sport_formats`
  ADD COLUMN `players_per_side` int unsigned DEFAULT NULL AFTER `format_type`;

-- Deterministic backfill from format semantics (not sport names):
-- singles is 1v1, doubles is 2v2; team size is configuration and stays NULL
-- until explicitly configured (the seeded Football 11v11 default is set below
-- because its configured size is already encoded in the existing seed name).
UPDATE `sport_formats` SET `players_per_side` = 1
  WHERE `format_type` = 'singles' AND `players_per_side` IS NULL;
UPDATE `sport_formats` SET `players_per_side` = 2
  WHERE `format_type` = 'doubles' AND `players_per_side` IS NULL;
UPDATE `sport_formats` SET `players_per_side` = 11
  WHERE `format_type` = 'team' AND `name` = 'Football 11v11' AND `players_per_side` IS NULL;

-- ---------------------------------------------------------------------------
-- 2. matches.format_id + 3. matches.format_snapshot
-- ---------------------------------------------------------------------------
ALTER TABLE `matches`
  ADD COLUMN `format_id` bigint unsigned DEFAULT NULL AFTER `sport_id`,
  ADD COLUMN `format_snapshot` json DEFAULT NULL COMMENT 'Historical match format snapshot (format_type, players_per_side, name) frozen at creation',
  ADD KEY `idx_match_format` (`format_id`),
  ADD CONSTRAINT `fk_match_format` FOREIGN KEY (`format_id`)
    REFERENCES `sport_formats` (`id`) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- Backfill existing matches (deterministic, conservative)
-- ---------------------------------------------------------------------------

-- 1) Authoritative evidence: an existing result record already pins the
--    format the match was scored under — reuse it verbatim.
UPDATE `matches` m
JOIN `match_result_records` r ON r.match_id = m.id
JOIN `sport_formats` sf ON sf.id = r.format_id
SET m.format_id = sf.id,
    m.format_snapshot = JSON_OBJECT(
      'format_id', sf.id,
      'format_type', sf.format_type,
      'players_per_side', sf.players_per_side,
      'name', sf.name
    )
WHERE m.format_id IS NULL;

-- 2) No result record: use the sport's default active format ONLY when it is
--    unambiguous (exactly one active default for the sport). Ambiguous or
--    missing configuration is left NULL and reported, never guessed.
UPDATE `matches` m
JOIN `sport_formats` sf
  ON sf.sport_id = m.sport_id AND sf.is_active = 1 AND sf.is_default = 1
SET m.format_id = sf.id,
    m.format_snapshot = JSON_OBJECT(
      'format_id', sf.id,
      'format_type', sf.format_type,
      'players_per_side', sf.players_per_side,
      'name', sf.name
    )
WHERE m.format_id IS NULL
  AND (SELECT COUNT(*) FROM `sport_formats` sf2
        WHERE sf2.sport_id = m.sport_id AND sf2.is_active = 1 AND sf2.is_default = 1) = 1;