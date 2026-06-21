-- ============================================================================
-- COURTZON-V2 : Fix roles unique key for org role cloning (MariaDB compatible)
-- Migration 105 changed uk_role_slug from (organisation_id, slug) to just (slug)
-- which broke cloneRoleForOrg(). Restore the composite key.
-- MariaDB treats NULLs as distinct in unique indexes, so we use a virtual
-- generated column to normalize NULL organisation_id to 0.
-- ============================================================================

USE courtzon_v2;

-- 1. Drop existing key(s)
ALTER TABLE roles DROP INDEX IF EXISTS uk_role_slug;
ALTER TABLE roles DROP INDEX IF EXISTS uk_role_org_slug;

-- 2. Add a generated column to normalize NULLs
ALTER TABLE roles ADD COLUMN org_id_normalized INT UNSIGNED GENERATED ALWAYS AS (IFNULL(organisation_id, 0)) STORED;

-- 3. Create unique index on the normalized column + slug
--    This prevents duplicate global roles while allowing org-scoped copies
ALTER TABLE roles ADD UNIQUE INDEX uk_role_org_slug (org_id_normalized, slug);

-- 4. Clean up any duplicate global roles that slipped through before this fix
DELETE r1 FROM roles r1
JOIN roles r2 ON r1.slug = r2.slug
WHERE r1.organisation_id IS NULL
  AND r2.organisation_id IS NULL
  AND r1.id > r2.id;
