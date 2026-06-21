-- ============================================================================
-- COURTZON-V2 : Clean up duplicate roles & restore unique key
--
-- Root cause: migration 105 switched uk_role_slug from (organisation_id,slug)
-- to just (slug), breaking cloneRoleForOrg(). Migration 109's INSERT IGNORE
-- then created duplicate global roles because there was no unique constraint.
-- Migration 111 tried to fix this but its ADD UNIQUE INDEX failed (errno 1062
-- from existing duplicates), causing the entire file to be SKIPped.
-- These duplicates compound on every migration run.
--
-- This migration:
--  1. Deletes duplicate global roles (keeps lowest id per slug)
--  2. Drops any stale unique keys
--  3. Adds the correct unique key on (org_id_normalized, slug)
-- ============================================================================

USE courtzon_v2;

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

-- 3. Drop any existing unique keys on roles table
ALTER TABLE roles DROP INDEX IF EXISTS uk_role_slug;
ALTER TABLE roles DROP INDEX IF EXISTS uk_role_org_slug;

-- 4. Re-create the unique key on the generated column (from migration 111)
--    This allows one global row per slug (org_id_normalized=0) AND one
--    org-specific row per (org_id, slug) combination.
ALTER TABLE roles ADD UNIQUE INDEX uk_role_org_slug (org_id_normalized, slug);

-- 5. Reset auto_increment to avoid huge ID gaps
SET @max_id = (SELECT MAX(id) FROM roles);
SET @next_id = IF(@max_id IS NULL, 1, @max_id + 1);
SET @stmt = CONCAT('ALTER TABLE roles AUTO_INCREMENT = ', @next_id);
PREPARE stmt FROM @stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
