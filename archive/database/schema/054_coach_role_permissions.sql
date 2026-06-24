-- 054: Assign coach permissions to player and admin roles

-- Assign coaches.apply to player role (role_id=2)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE permission_key = 'coaches.apply';

-- Assign coaches.manage_profile to player role (role_id=2)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE permission_key = 'coaches.manage_profile';

-- Assign coaches.approve to admin role (role_id=3)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE permission_key = 'coaches.approve';

-- Assign coaches.assign to admin role (role_id=3)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE permission_key = 'coaches.assign';
