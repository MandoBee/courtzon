-- Hide "Recent Activity" on player home — grant to all roles except player
USE courtzon_v2;

INSERT IGNORE INTO permission_modules (slug, sort_order) VALUES ('home', 18);

INSERT INTO permissions (module_id, permission_key, element_type, element_label, component_path, is_ui_element, description)
SELECT m.id, 'home.recent-activity', 'section', 'Home Recent Activity', 'pages/home/DashboardPage.tsx', TRUE,
       'Controls visibility of "Home Recent Activity" (section)'
FROM permission_modules m
WHERE m.slug = 'home'
ON DUPLICATE KEY UPDATE
  element_type = VALUES(element_type),
  element_label = VALUES(element_label),
  component_path = VALUES(component_path),
  is_ui_element = TRUE;

DELETE rp FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.slug = 'player' AND p.permission_key = 'home.recent-activity';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key = 'home.recent-activity'
WHERE r.slug != 'player' AND r.deleted_at IS NULL;
