-- 121_org_manual_journal_permissions.sql
-- Register the organisation-scoped Manual Journal permission keys and grant them
-- to the correct roles in every environment (local + production + fresh).
--
-- Idempotent: INSERT ... ON DUPLICATE KEY UPDATE for permission keys (unique
-- permission_key) and INSERT IGNORE for role grants (unique role_id+permission_id).
-- Resolved by role SLUG so duplicate role rows are covered.

-- ── 1. Register the permission keys ──
INSERT INTO permissions (module_id, permission_key, element_type, element_label, component_path, is_ui_element, description)
SELECT m.id, 'org.accounting.journal.view', 'page', 'Organisation Manual Journal View', 'pages/org/OrgJournalPage.tsx', 1, 'View the organisation manual journal'
FROM permission_modules m WHERE m.slug = 'org'
ON DUPLICATE KEY UPDATE element_type = VALUES(element_type), element_label = VALUES(element_label), component_path = VALUES(component_path), is_ui_element = VALUES(is_ui_element);

INSERT INTO permissions (module_id, permission_key, element_type, element_label, component_path, is_ui_element, description)
SELECT m.id, 'org.accounting.journal.create', 'button', 'Organisation Manual Journal Create', 'pages/org/OrgJournalPage.tsx', 1, 'Create manual journal entries for the organisation'
FROM permission_modules m WHERE m.slug = 'org'
ON DUPLICATE KEY UPDATE element_type = VALUES(element_type), element_label = VALUES(element_label), component_path = VALUES(component_path), is_ui_element = VALUES(is_ui_element);

-- ── 2. Grant to roles ──
-- View: org admins + finance/audit roles
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'org.accounting.journal.view'
WHERE r.slug IN ('super_admin', 'org-admin', 'accountant', 'master-admin', 'operations-manager', 'auditor', 'read-only-admin')
  AND r.deleted_at IS NULL;

-- Create: org admins + finance roles (not auditor / read-only-admin)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'org.accounting.journal.create'
WHERE r.slug IN ('super_admin', 'org-admin', 'accountant', 'master-admin', 'operations-manager')
  AND r.deleted_at IS NULL;
