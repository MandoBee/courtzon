-- ============================================================================
-- COURTZON V3 : TOURNAMENT PROGRESSION ENGINE (Group 5B)
-- Bracket progression is derived EXCLUSIVELY from authoritative APPROVED shared
-- Match results (Groups 1-4). `tournament_matches` metadata rows carry the
-- progression wiring so the engine can rebuild the bracket topology without
-- recomputation:
--   * stage_id           — which tournament_stage a slot belongs to (optional;
--                          stage is an optional association -> SET NULL)
--   * progression_state  — lifecycle label for a bracket slot:
--                          pending  (placeholder, not yet fillable)
--                          ready    (both participants known, shared Match linked)
--                          bye      (explicit bye slot finalised)
--                          completed(slot resolved via an approved result)
--                          cancelled(reserved; not used in 5B)
--   * progression_meta   — JSON provenance written at draw time:
--                          { is_bracket, target_round, target_bracket_position,
--                            source_round, source_bracket_position, stage_index }
--   Discriminator: bracket slots carry is_bracket=true; round-robin/group rows
--   carry is_bracket=false (or NULL for legacy rows, where the engine falls
--   back to a (tournament_id, round, bracket_position) duplicate count).
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- (Machine-readable classification for backend/scripts/migration-guard.sh —
--  eligible in every environment.)
--
-- Design notes (AGENTS.md Database Relationship & Historical Data Policy):
--   * Additive ONLY. NO DROP/TRUNCATE/reset. UAT fixtures (matches 11/12/13,
--     bookings 27/28/29, existing tournament_matches rows) untouched.
--   * stage_id -> tournament_stages SET NULL : a stage config may be removed
--     but the slot record stays independently (optional association pattern).
--   * NO unique (tournament_id, round, bracket_position) index — round-robin
--     matches legitimately share bracket_position 0 across many rounds.
--   * idx_tm_progression speeds the progression hot-path lookup
--     (tournament_id, round, bracket_position).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Slot -> Stage association (optional; MIXED tournaments only)
-- ---------------------------------------------------------------------------
ALTER TABLE `tournament_matches`
  ADD COLUMN `stage_id` int unsigned DEFAULT NULL AFTER `group_id`,
  ADD KEY `idx_tm_stage` (`stage_id`),
  ADD CONSTRAINT `fk_tm_stage` FOREIGN KEY (`stage_id`)
    REFERENCES `tournament_stages` (`id`) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. Progression lifecycle + provenance metadata
-- ---------------------------------------------------------------------------
ALTER TABLE `tournament_matches`
  ADD COLUMN `progression_state` varchar(30) COLLATE utf8mb4_unicode_ci
    NOT NULL DEFAULT 'pending' AFTER `status`,
  ADD COLUMN `progression_meta` json DEFAULT NULL AFTER `progression_state`,
  ADD KEY `idx_tm_progression` (`tournament_id`, `round`, `bracket_position`);