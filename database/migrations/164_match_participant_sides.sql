-- ============================================================================
-- COURTZON V3 : AUTHORITATIVE MATCH PARTICIPANT SIDES (Group 2)
-- The Match itself knows which participant belongs to which side/team.
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- (Machine-readable classification for backend/scripts/migration-guard.sh —
--  eligible in every environment.)
--
-- Scope (Group 2 ONLY):
--   1. match_participants.side        — authoritative side ('home' | 'away')
--   2. match_participants.team_index  — side/team grouping index (0 = home,
--      1 = away, matching the existing match_result_participants convention)
--
-- OUT OF SCOPE (later groups): UI side selection, tournaments, rating changes,
-- admin/org UI, result-card redesign.
--
-- Design notes (AGENTS.md Database Relationship & Historical Data Policy):
--   * Columns are NULLABLE so legacy records (and matches created before side
--     assignment existed) remain intact — no destructive rewrite.
--   * Backfill is conservative: side/team_index are recovered ONLY from the
--     authoritative match_result_participants rows (the result engine already
--     persisted sides at scoring time). Unambiguous per (match_id, user_id)
--     because match_result_records is UNIQUE on match_id and participants are
--     UNIQUE on (result_id, user_id). Nothing is invented.
--   * Existing UAT fixtures (matches 11/12/13, bookings 27/28/29) are NOT
--     deleted or altered beyond this nullable backfill.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Authoritative side fields on match_participants
-- ---------------------------------------------------------------------------
ALTER TABLE `match_participants`
  ADD COLUMN `side` enum('home','away') COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `role`,
  ADD COLUMN `team_index` int DEFAULT NULL AFTER `side`,
  ADD KEY `idx_side` (`match_id`,`side`);

-- ---------------------------------------------------------------------------
-- Backfill from authoritative result records (unambiguous only).
-- A match_result_record pins the sides its participants were scored under;
-- match_result_participants is the single authoritative source of that
-- historical truth. Only fills rows that still have no side.
-- ---------------------------------------------------------------------------
UPDATE `match_participants` mp
JOIN `match_result_records` r ON r.match_id = mp.match_id
JOIN `match_result_participants` mrp ON mrp.result_id = r.id AND mrp.user_id = mp.user_id
SET mp.side = mrp.side,
    mp.team_index = mrp.team_index
WHERE mp.side IS NULL;