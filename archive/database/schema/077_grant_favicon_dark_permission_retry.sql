-- Grant favicon-dark (permission is synced after 076 ran — re-grant for super_admin)
USE courtzon_v2;

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key = 'app-settings.edit.favicon-dark'
WHERE r.slug IN ('super_admin', 'super-admin');

-- Also grant to any role that already has light favicon edit
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p_dark.id
FROM role_permissions rp
JOIN permissions p_light ON p_light.id = rp.permission_id AND p_light.permission_key = 'app-settings.edit.favicon'
JOIN permissions p_dark ON p_dark.permission_key = 'app-settings.edit.favicon-dark';
