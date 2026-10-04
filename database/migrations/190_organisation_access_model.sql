-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- ============================================================================
-- 190_organisation_access_model.sql — G11.22 Membership & Club Access P0
-- ============================================================================
-- Adds the organisation-level club access model.
--
--   access_model:
--     PUBLIC_CLUB      — organisation is open by default; branches may be
--                        individually restricted (members/authorized only)
--                        using the existing branches.access_type +
--                        branch_player_access mechanism.
--     MEMBERSHIP_CLUB  — organisation is fundamentally membership-based;
--                        branch access will respect membership/entitlement
--                        rules (enforced by later membership phases). Existing
--                        branch access_type behaviour is preserved.
--
-- Backward compatibility: NOT NULL DEFAULT 'PUBLIC_CLUB' means every existing
-- organisation keeps today's effective behaviour (open-by-default) with no
-- data migration. Additive, PRODUCTION_SAFE, no existing column is changed.
-- ============================================================================

ALTER TABLE `organisations`
  ADD COLUMN `access_model` enum('PUBLIC_CLUB','MEMBERSHIP_CLUB') NOT NULL DEFAULT 'PUBLIC_CLUB' COMMENT 'Organisation-wide club access model (PUBLIC_CLUB = open by default; MEMBERSHIP_CLUB = membership-gated by default)' AFTER `cancellation_fee_fixed`;