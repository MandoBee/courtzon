-- Ensure Super Admin always has every permission (including keys added after baseline seed).
-- Other roles: run `node backend/scripts/sync-role-permissions.mjs` after sync-ui-registry.

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug IN ('super_admin', 'super-admin')
  AND r.deleted_at IS NULL;
