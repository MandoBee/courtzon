-- 091_coach_lifecycle_v2.sql
-- Coach Lifecycle V2: Platform Status, Organization Relationship Cleanup, Dead Table Removal
--
-- DESIGN:
--   coach_profiles.status          = Approval pipeline (none/pending/approved/rejected)
--   coach_profiles.platform_status  = Post-approval lifecycle (active/suspended/deactivated) [NEW]
--   coach_profiles.is_verified     = Credential verification (0/1)
--   professional_profiles.is_available = Booking availability (0/1)
--   coach_org_agreements.status    = Org relationship (pending/active/rejected/suspended/ended) [EXTENDED]
--
--   'accepted' kept in ENUM as legacy alias; data migrated to 'active'.

-- =========================================================================
-- 1. Add platform_status to coach_profiles
-- =========================================================================
ALTER TABLE `coach_profiles`
  ADD COLUMN `platform_status` enum('active','suspended','deactivated') NOT NULL DEFAULT 'active' AFTER `status`;

-- =========================================================================
-- 2. Extend coach_org_agreements.status ENUM (add active/suspended/ended)
--    Keep 'accepted' for backward compat; data migrated below.
-- =========================================================================
ALTER TABLE `coach_org_agreements`
  MODIFY COLUMN `status` enum('pending','accepted','active','rejected','suspended','ended') NOT NULL DEFAULT 'pending';

-- Migrate existing accepted rows to active
UPDATE `coach_org_agreements` SET `status` = 'active' WHERE `status` = 'accepted';

-- =========================================================================
-- 3. Drop dead tables
--    org_coach_agreements  — 0 code references, created by migration 079
--    organisation_coaches  — 1 read-only COUNT query, moved to coach_org_agreements
-- =========================================================================
DROP TABLE IF EXISTS `org_coach_agreements`;
DROP TABLE IF EXISTS `organisation_coaches`;
