-- ============================================================================
-- COURTZON-V2 : Final roles cleanup
--  - Set Player as system role (same as Super Admin)
--  - Hard-delete all duplicate/obsolete roles and their permissions
--  - Keep only 8 canonical roles:
--      System (2): super_admin, player
--      Template (6): org-admin, shop-admin, branch-mgr, resource-mgr, coach, accountant
-- ============================================================================

USE courtzon_v2;

-- 1. Set Player as system role (user requirement: SYS and no org)
UPDATE roles SET is_system = 1 WHERE slug = 'player' AND deleted_at IS NULL;

-- 2. Deactivate any user_roles pointing to roles we're about to delete
UPDATE user_roles ur
JOIN roles r ON r.id = ur.role_id
SET ur.is_active = 0
WHERE r.slug IN (
  'org_admin', 'seller', 'player-seller', 'player_seller',
  'org-seller', 'club-manager', 'branch-manager', 'resource-manager',
  'org-coach', 'org-accountant', 'admin', 'system_admin'
) AND ur.is_active = 1;

-- 3. Delete user_role_scopes for those user_roles
DELETE urs FROM user_role_scopes urs
JOIN user_roles ur ON ur.id = urs.user_role_id
JOIN roles r ON r.id = ur.role_id
WHERE r.slug IN (
  'org_admin', 'seller', 'player-seller', 'player_seller',
  'org-seller', 'club-manager', 'branch-manager', 'resource-manager',
  'org-coach', 'org-accountant', 'admin', 'system_admin'
);

-- 4. Delete user_roles for those roles
DELETE ur FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE r.slug IN (
  'org_admin', 'seller', 'player-seller', 'player_seller',
  'org-seller', 'club-manager', 'branch-manager', 'resource-manager',
  'org-coach', 'org-accountant', 'admin', 'system_admin'
);

-- 5. Delete role_permissions for those roles
DELETE rp FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
WHERE r.slug IN (
  'org_admin', 'seller', 'player-seller', 'player_seller',
  'org-seller', 'club-manager', 'branch-manager', 'resource-manager',
  'org-coach', 'org-accountant', 'admin', 'system_admin'
);

-- 6. Hard-delete the duplicate/obsolete roles
DELETE FROM roles WHERE slug IN (
  'org_admin', 'seller', 'player-seller', 'player_seller',
  'org-seller', 'club-manager', 'branch-manager', 'resource-manager',
  'org-coach', 'org-accountant', 'admin', 'system_admin'
);

-- 7. Ensure the 8 canonical roles exist with correct is_system values
INSERT IGNORE INTO roles (slug, name, description, is_system) VALUES
  ('super_admin', 'Super Admin', 'Full system access, can bypass any restriction', TRUE),
  ('player', 'Player', 'Regular user who books resources and accesses PWA', TRUE),
  ('org-admin', 'Org Admin', 'Full permissions to their organisation', FALSE),
  ('shop-admin', 'Shop Admin', 'Full marketplace access for their organisation', FALSE),
  ('branch-mgr', 'Branch Manager', 'Full permissions to their branch(es)', FALSE),
  ('resource-mgr', 'Resource Manager', 'Full access to their resources', FALSE),
  ('coach', 'Coach', 'Coach with session management', FALSE),
  ('accountant', 'Accountant', 'Financial data access', FALSE);
