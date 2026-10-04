-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- ============================================================================
-- 194_membership_entitlements.sql — G11.22 P3: membership financial entitlement
-- ============================================================================
-- ADDITIVE ONLY: adds 'membership' to the immutable financial_entitlements
-- source_type ENUM so paid membership installments can create entitlements
-- that flow through the EXISTING unified settlement engine (no new table, no
-- new accounting/settlement model, no change to Booking/Tournament/etc).
--
-- Existing rows and other source types are untouched (the enum is extended
-- only). State machine / status / collector semantics are unchanged.
-- ============================================================================
ALTER TABLE `financial_entitlements`
  MODIFY COLUMN `source_type`
    enum('booking','academy','marketplace','tournament','coach_session','manual','membership')
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci
    NOT NULL;