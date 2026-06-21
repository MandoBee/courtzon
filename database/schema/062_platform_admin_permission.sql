-- platform.admin permission: permission-based guard for admin API routes (replaces role-only adminGuard)

INSERT INTO permission_modules (slug, sort_order)
SELECT 'platform', 0 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM permission_modules WHERE slug = 'platform');

INSERT INTO permissions (module_id, permission_key, element_type, element_label, is_ui_element, description)
SELECT pm.id, 'platform.admin', 'action', 'Platform Admin Access', FALSE,
       'Grants access to platform admin API routes (replaces hardcoded admin role checks)'
FROM permission_modules pm
WHERE pm.slug = 'platform'
  AND NOT EXISTS (SELECT 1 FROM permissions WHERE permission_key = 'platform.admin');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.slug IN ('admin', 'super_admin')
  AND p.permission_key = 'platform.admin'
  AND r.deleted_at IS NULL;
