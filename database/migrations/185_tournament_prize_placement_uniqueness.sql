-- ============================================================================
-- COURTZON V3 : TOURNAMENT PRIZE PLACEMENT UNIQUENESS (G11.15)
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- PURPOSE
--   Enforce ONE CASH prize per tournament+placement so placement-based payout
--   (G11.15) always resolves an unambiguous prize for placements 1..3.
--
--   The generated stored column `cash_placement` is the placement value only
--   for CASH rows and NULL for every non-cash prize. MySQL UNIQUE indexes
--   allow multiple NULLs, so:
--     * non-cash prizes (trophy/gift/gold/silver/bronze/other) may repeat per
--       placement exactly as before (unchanged behavior);
--     * a second CASH prize for the same tournament+placement is rejected by
--       the database (fail-closed).
--   A CASH prize with placement NULL is treated as non-ranked and remains
--   permitted (cash_placement NULL); non-ranked prizes are never auto-bound.
--
-- SAFETY
--   * Additive only: one generated column + one unique index — no column is
--     dropped, no enum changed, no data rewritten, no constraint altered.
--   * Verified read-only (2026-10-01): production `tournament_prizes` = 1 row
--     (prize_type 'cash', placement NULL → cash_placement NULL) and local
--     Docker = 0 rows; no tournament has duplicate cash prizes per placement,
--     so the UNIQUE index cannot fail on existing data.
--   * No accounting, wallet, entitlement, settlement, ledger, or payment
--     schema is touched.
-- ============================================================================

ALTER TABLE `tournament_prizes`
  ADD COLUMN `cash_placement` int unsigned
    GENERATED ALWAYS AS (IF(`prize_type` = 'cash', `placement`, NULL)) STORED
    COMMENT 'Placement projected for CASH prizes only (NULL for non-cash / non-ranked) — enables one-cash-prize-per-placement uniqueness',
  ADD UNIQUE KEY `uk_tprize_cash_placement` (`tournament_id`,`cash_placement`);