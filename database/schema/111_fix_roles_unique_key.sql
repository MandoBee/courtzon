-- ============================================================================
-- COURTZON-V2 : Fix roles unique key for org role cloning (MySQL 8 compatible)
-- Migration 105 changed uk_role_slug from (organisation_id, slug) to just (slug)
-- which broke cloneRoleForOrg(). Restore the composite key.
-- Uses a stored procedure to avoid PREPARE/EXECUTE issues in multipleStatements mode.
-- ============================================================================

USE courtzon_v2;

DROP PROCEDURE IF EXISTS cz111_setup_roles;

DELIMITER //

CREATE PROCEDURE cz111_setup_roles()
BEGIN
  DECLARE v INT;

  -- 1. Drop uk_role_slug if exists
  SELECT COUNT(*) INTO v FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND INDEX_NAME = 'uk_role_slug';
  IF v > 0 THEN
    ALTER TABLE roles DROP INDEX uk_role_slug;
  END IF;

  -- 2. Drop uk_role_org_slug if exists
  SELECT COUNT(*) INTO v FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND INDEX_NAME = 'uk_role_org_slug';
  IF v > 0 THEN
    ALTER TABLE roles DROP INDEX uk_role_org_slug;
  END IF;

  -- 3. Add org_id_normalized column if not exists
  --   Plain column (NOT generated) to avoid FK validation on IFNULL(organisation_id, 0).
  --   MySQL 8 rejects GENERATED ALWAYS AS (IFNULL(organisation_id, 0)) STORED because
  --   the generated value 0 has no matching row in organisations(id).
  SELECT COUNT(*) INTO v FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND COLUMN_NAME = 'org_id_normalized';
  IF v = 0 THEN
    ALTER TABLE roles ADD COLUMN org_id_normalized INT UNSIGNED NOT NULL DEFAULT 0;
    UPDATE roles SET org_id_normalized = COALESCE(organisation_id, 0);
  END IF;

  -- 4. Create unique index uk_role_org_slug if not exists
  SELECT COUNT(*) INTO v FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND INDEX_NAME = 'uk_role_org_slug';
  IF v = 0 THEN
    ALTER TABLE roles ADD UNIQUE INDEX uk_role_org_slug (org_id_normalized, slug);
  END IF;

  -- 5. Clean up duplicate global roles that slipped through before this fix
  DELETE r1 FROM roles r1
  JOIN roles r2 ON r1.slug = r2.slug
  WHERE r1.organisation_id IS NULL
    AND r2.organisation_id IS NULL
    AND r1.id > r2.id;
END//

DELIMITER ;

CALL cz111_setup_roles();

DROP PROCEDURE IF EXISTS cz111_setup_roles;
