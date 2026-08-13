-- 122_operations_auditor_settlement_permissions.sql
-- Reconcile settlement / Finance-navigation permissions for the operations-manager,
-- auditor and read-only-admin roles (matches role-permission-templates.mjs).
-- Idempotent: INSERT IGNORE (unique role_id+permission_id), resolved by role slug.

-- operations-manager: view + request settlements (and settle eligible bookings / collect recoveries)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'settlements.view'
WHERE r.slug = 'operations-manager' AND r.deleted_at IS NULL;

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'settlements.request'
WHERE r.slug = 'operations-manager' AND r.deleted_at IS NULL;

-- auditor + read-only-admin: read-only Finance navigation visibility
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'org.sidebar.finance'
WHERE r.slug IN ('auditor', 'read-only-admin') AND r.deleted_at IS NULL;

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'org.sidebar.accounting'
WHERE r.slug IN ('auditor', 'read-only-admin') AND r.deleted_at IS NULL;
