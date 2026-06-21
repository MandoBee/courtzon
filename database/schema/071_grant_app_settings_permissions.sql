-- Grant app-settings permissions to super_admin (replaces legacy settings.view/edit)
USE courtzon_v2;

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key IN (
  'app-settings.view',
  'app-settings.edit',
  'app-settings.edit.site-name',
  'app-settings.edit.support-email',
  'app-settings.edit.favicon',
  'app-settings.edit.site-logo',
  'app-settings.edit.pwa-images',
  'app-settings.edit.domain-name',
  'app-settings.edit.site-tagline',
  'app-settings.edit.meta-description',
  'app-settings.edit.maintenance-mode',
  'sidebar.app-settings'
)
WHERE r.slug IN ('super_admin', 'super-admin');
