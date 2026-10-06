-- ============================================================================
-- COURTZON V3 : GSK DATA CONTRACT FOUNDATION (STEP 3B-1)
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- PURPOSE
--   Prepare the persistent data contract for the future Group Stage + Knockout
--   (GSK) engine. This step implements ONLY storage + a defensive constraint.
--   NO engine, qualification, match generation or runtime behaviour ships here.
--
--   Change 1 — `tournament_stages.config`
--     Per-stage configuration JSON (e.g. the future GSK stage payload:
--       { "format": "group_stage_knockout", "groupStage": {...},
--         "qualification": {...}, "knockout": {...} }).
--     NULL = unconfigured; existing knockout / round_robin stages are NOT
--     affected and keep config NULL forever until configured.
--
--   Change 2 — defensive FK `tournament_matches.group_id → tournament_groups`
--     `group_id` already exists (indexed, nullable, never written by the current
--     engine). Adding the FK guarantees integrity for the future group-stage
--     match generation. ON DELETE SET NULL preserves match history (same
--     convention as `stage_id`). Verified: the Docker courtzon_v3 database has
--     ZERO orphan group_id rows, so the constraint is safe to add — it fails
--     loudly (never mutates data) if a future environment ever violates it.
--
-- SAFETY / BACKWARD COMPATIBILITY
--   * Fully additive: one nullable column + one FK.
--   * No existing row is modified; no value backfilled.
--   * Existing knockout / round_robin tournaments and matches behave exactly as
--     before (config = NULL, group_id = NULL).
--   * No unrelated index, table, or seed is touched.
-- ============================================================================

-- 1. Per-stage configuration JSON (nullable; no default object).
ALTER TABLE `tournament_stages`
  ADD COLUMN `config` json DEFAULT NULL
  COMMENT 'Stage-specific configuration (e.g. future Group Stage + Knockout parameters); NULL = unconfigured'
  AFTER `status`;

-- 2. Defensive FK for group-stage matches (guarded above; fails cleanly, never
--    modifies data, if an environment ever contains orphan group_id values).
ALTER TABLE `tournament_matches`
  ADD CONSTRAINT `fk_tm_group`
  FOREIGN KEY (`group_id`) REFERENCES `tournament_groups` (`id`) ON DELETE SET NULL;