-- ============================================================================
-- COURTZON-V2 : Consolidate roles to 8 global template roles
--  - Remove player-seller (all players already have player role; free selling gated by code)
--  - Rename club-admin → org-admin, branch-manager → branch-mgr, resource-manager → resource-mgr
--  - Delete obsolete roles: club-manager, org-coach, org-accountant, seller, org-seller, admin, system_admin
--  - Soft-delete all org-cloned roles (*-org-*)
--  - Set is_system = 0 on all roles except super_admin
--  - Fix unique key: old (organisation_id, slug) allows NULL dupes because MySQL treats NULLs as distinct
--  - Ensure all 8 roles exist
-- ============================================================================

USE courtzon_v2;

-- 0. Fix the unique key: MySQL treats NULLs as distinct values in unique indexes,
--    so (NULL, 'slug') and (NULL, 'slug') are NOT considered duplicates.
--    Drop the old key and recreate it with the same columns — future rows with
--    NULL organisation_id will properly enforce uniqueness.
--    First clean up any duplicate global slugs (keep lowest id per slug).
DELETE r1 FROM roles r1
JOIN roles r2 ON r1.slug = r2.slug AND r1.organisation_id IS NULL AND r2.organisation_id IS NULL
WHERE r1.id > r2.id;

ALTER TABLE roles DROP INDEX uk_role_slug;
ALTER TABLE roles ADD UNIQUE KEY uk_role_slug (slug);

-- 1. Unset is_system on all non-super_admin global roles
UPDATE roles SET is_system = 0 WHERE slug NOT IN ('super_admin', 'super-admin') AND deleted_at IS NULL;

-- 2. Rename club-admin → org-admin
UPDATE roles SET slug = 'org-admin', name = 'Org Admin' WHERE slug = 'club-admin' AND deleted_at IS NULL;

-- 3. Rename branch-manager → branch-mgr
UPDATE roles SET slug = 'branch-mgr', name = 'Branch Manager' WHERE slug = 'branch-manager' AND deleted_at IS NULL;

-- 4. Rename resource-manager → resource-mgr
UPDATE roles SET slug = 'resource-mgr', name = 'Resource Manager' WHERE slug = 'resource-manager' AND deleted_at IS NULL;

-- 5. Soft-delete player-seller role
UPDATE roles SET deleted_at = NOW() WHERE slug IN ('player-seller', 'player_seller') AND deleted_at IS NULL;

-- 6. Soft-delete obsolete roles
UPDATE roles SET deleted_at = NOW() WHERE slug IN (
  'club-manager', 'org-coach', 'org-accountant', 'seller', 'org-seller', 'admin', 'system_admin'
) AND deleted_at IS NULL;

-- 7. Soft-delete all org-cloned roles (*-org-*)
UPDATE roles SET deleted_at = NOW() WHERE slug LIKE '%-org-%' AND deleted_at IS NULL;

-- 8. Deactivate any user_roles pointing to soft-deleted roles
UPDATE user_roles ur
JOIN roles r ON r.id = ur.role_id
SET ur.is_active = FALSE
WHERE r.deleted_at IS NOT NULL AND ur.is_active = TRUE;

-- 9. Ensure all 8 target roles exist
INSERT IGNORE INTO roles (slug, name, description, is_system) VALUES
  ('super_admin', 'Super Admin', 'Full system access, can bypass any restriction', TRUE),
  ('org-admin', 'Org Admin', 'Full permissions to their organisation', FALSE),
  ('branch-mgr', 'Branch Manager', 'Full permissions to their branch(es)', FALSE),
  ('resource-mgr', 'Resource Manager', 'Full access to their resources', FALSE),
  ('shop-admin', 'Shop Admin', 'Full marketplace access for their organisation', FALSE),
  ('player', 'Player', 'Regular user who books resources and accesses PWA', FALSE),
  ('coach', 'Coach', 'Coach with session management', FALSE),
  ('accountant', 'Accountant', 'Financial data access', FALSE);
