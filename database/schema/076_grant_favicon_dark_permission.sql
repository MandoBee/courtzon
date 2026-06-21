-- Grant dark-mode favicon field permission to super_admin
USE courtzon_v2;

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key = 'app-settings.edit.favicon-dark'
WHERE r.slug IN ('super_admin', 'super-admin');
