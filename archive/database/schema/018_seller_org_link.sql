-- ============================================================================
-- COURTZON-V2 : SELLER ORGANISATION LINK
-- Links seller_profiles to organisations and branches
-- ============================================================================

USE courtzon_v2;

ALTER TABLE seller_profiles
  ADD COLUMN organisation_id INT UNSIGNED DEFAULT NULL COMMENT 'Link to organisations table (org_type=seller)'
  AFTER user_id,
  ADD COLUMN branch_id INT UNSIGNED DEFAULT NULL COMMENT 'Auto-created branch for seller accounting'
  AFTER organisation_id,
  ADD INDEX idx_seller_org (organisation_id),
  ADD INDEX idx_seller_branch (branch_id),
  ADD CONSTRAINT fk_seller_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_seller_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
