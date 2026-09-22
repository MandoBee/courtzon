-- ============================================================================
-- COURTZON V3 : TOURNAMENT REGISTRATION PAYMENT METHODS (Group 3)
-- Adds the Tournament-level allowed registration payment-method configuration.
--
-- Requirement: a Tournament owner/authorized administrator must define which
-- registration payment methods players may use when paying the entry fee:
--   ['cash']       = Cash only
--   ['card']       = Card/Gateway only
--   ['cash','card']= Both
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- (Machine-readable classification for backend/scripts/migration-guard.sh —
--  eligible in every environment.)
--
-- Design notes:
--   * This is an ALLOWLIST, not a payment implementation. The Tournament domain
--     consumes the existing shared Payment capability (payment_transactions +
--     PaymentService.charge + gateway abstraction). No duplicate Payment
--     mechanism is created.
--   * Wallet is NOT a valid value: CourtZon's global payment policy has Wallet
--     disabled as a payment method (refund destination only). The schema does
--     not constrain the JSON contents (validated in application code against
--     the fixed set {cash, card}); this keeps the storage format stable and
--     machine-readable without an ENUM migration for every policy change.
--   * JSON is the established CourtZon convention for similar configurable
--     sets (payment_gateway_config.config, tournament_matches.progression_meta,
--     payment_transactions.gateway_response). A child table would be overkill
--     for a two-value allowlist.
--   * NULL = backward-compatible default [cash, card] (both), applied in
--     application code. Existing Tournament rows are untouched and remain
--     payable — no backfill of payment transactions, no history rewrite.
--   * Additive ONLY. No DROP/TRUNCATE/reset. No rewrite of existing rows.
-- ============================================================================

ALTER TABLE `tournaments`
  ADD COLUMN `registration_payment_methods` json NULL
  COMMENT 'Allowed registration payment methods (JSON array of cash|card); NULL = both (backward-compatible default)'
  AFTER `price_type`;