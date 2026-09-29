-- ============================================================================
-- COURTZON V3 : PLAYER WALLET PAYOUT (G11.6 Phase 1)
-- Validated withdrawal channel + player-scoped bank payout details.
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- Design notes (locked G11.6 decisions):
--   * `withdrawal_requests.method` is the AUTHORITATIVE, server-validated payout
--     channel enum('bank_transfer','cash'). The legacy free-text
--     `execution_method` column is preserved only as an admin annotation and is
--     never the business source of truth.
--   * Player bank payout details live on `player_profiles` (the player-scoped
--     1:1 profile) — mirroring the org-side `branch_financial_details`
--     plaintext + zod-validated convention. The org `bank_accounts` /
--     `branch_financial_details` tables are BRANCH-scoped (org settlements),
--     NOT player-scoped, so they are deliberately not reused for players.
--   * No new tables, no financial_entitlements / chart_of_accounts /
--     payment_transactions / wallet_transactions changes, no data backfill.
-- ============================================================================

-- 1. Validated withdrawal channel (source of truth).
ALTER TABLE `withdrawal_requests`
  ADD COLUMN `method` enum('bank_transfer','cash') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'bank_transfer'
    AFTER `player_notes`;

-- 2. Player-scoped bank payout details (plaintext per repo convention, same
--    column widths as branch_financial_details; zod-validated at the API).
ALTER TABLE `player_profiles`
  ADD COLUMN `bank_account_holder` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `bank_account_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `bank_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `iban` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL;