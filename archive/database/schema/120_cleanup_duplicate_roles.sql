-- ============================================================================
-- COURTZON-V2 : Clean up duplicate roles & restore unique key (MySQL 8 compatible)
-- Uses a stored procedure to avoid PREPARE/EXECUTE issues in multipleStatements mode.
-- ============================================================================

USE courtzon_v2;

DROP PROCEDURE IF EXISTS cz120_cleanup_roles;

DELIMITER //

CREATE PROCEDURE cz120_cleanup_roles()
BEGIN
  DECLARE v INT;

  -- 1. Delete duplicate global roles (organisation_id IS NULL), keeping lowest id
  DELETE r1 FROM roles r1
  JOIN roles r2 ON r1.slug = r2.slug
  WHERE r1.organisation_id IS NULL
    AND r2.organisation_id IS NULL
    AND r1.id > r2.id;

  -- 2. Also delete org-specific duplicates if any snuck through
  DELETE r1 FROM roles r1
  JOIN roles r2
    ON r1.slug = r2.slug
    AND IFNULL(r1.organisation_id, 0) = IFNULL(r2.organisation_id, 0)
  WHERE r1.id > r2.id;

  -- 3. Ensure org_id_normalized column exists (may have been missed if 111 was skipped)
  --   Plain column (NOT generated) to avoid FK validation on IFNULL(organisation_id, 0).
  --   MySQL 8 rejects generated columns that produce 0 (no matching organisations.id).
  SELECT COUNT(*) INTO v FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND COLUMN_NAME = 'org_id_normalized';
  IF v = 0 THEN
    ALTER TABLE roles ADD COLUMN org_id_normalized INT UNSIGNED NOT NULL DEFAULT 0;
    UPDATE roles SET org_id_normalized = COALESCE(organisation_id, 0);
  END IF;

  -- 4. Drop any existing unique keys on roles table
  SELECT COUNT(*) INTO v FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND INDEX_NAME = 'uk_role_slug';
  IF v > 0 THEN
    ALTER TABLE roles DROP INDEX uk_role_slug;
  END IF;

  SELECT COUNT(*) INTO v FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND INDEX_NAME = 'uk_role_org_slug';
  IF v > 0 THEN
    ALTER TABLE roles DROP INDEX uk_role_org_slug;
  END IF;

  -- 5. Re-create unique key on the generated column
  SELECT COUNT(*) INTO v FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND INDEX_NAME = 'uk_role_org_slug';
  IF v = 0 THEN
    ALTER TABLE roles ADD UNIQUE INDEX uk_role_org_slug (org_id_normalized, slug);
  END IF;

  -- 6. Reset auto_increment to avoid huge ID gaps
  SELECT COALESCE(MAX(id), 0) + 1 INTO v FROM roles;
  SET @stmt = CONCAT('ALTER TABLE roles AUTO_INCREMENT = ', v);
  PREPARE s FROM @stmt;
  EXECUTE s;
  DEALLOCATE PREPARE s;
END//

DELIMITER ;

CALL cz120_cleanup_roles();

DROP PROCEDURE IF EXISTS cz120_cleanup_roles;
