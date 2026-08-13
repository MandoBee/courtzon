-- 120_org_accounting_permissions.sql
-- Ensure the organisation-scoped accounting permissions exist and are granted
-- to the correct roles in EVERY environment (local + production + fresh).
--
-- Root cause addressed: these keys are normally inserted by the UI-registry sync
-- script and granted by the role-permission sync script, which are run manually
-- against local Docker only. Production deploys do not run them, so the org
-- Accounting menu never appeared on production despite correct code + routes.
--
-- Idempotent: INSERT ... ON DUPLICATE KEY UPDATE for permission keys (unique
-- permission_key) and INSERT IGNORE for role grants (unique role_id+permission_id).
-- Grants are resolved by role SLUG so the duplicate org-admin roles are both covered.

-- ── 1. Register the permission keys ──
INSERT INTO permissions (module_id, permission_key, element_type, element_label, component_path, is_ui_element, description)
SELECT m.id, 'org.accounting.view', 'page', 'Organisation Accounting View', 'pages/org/OrgAccountingDashboardPage.tsx', 1, 'View organisation accounting dashboard, chart of accounts and reports'
FROM permission_modules m WHERE m.slug = 'org'
ON DUPLICATE KEY UPDATE element_type = VALUES(element_type), element_label = VALUES(element_label), component_path = VALUES(component_path), is_ui_element = VALUES(is_ui_element);

INSERT INTO permissions (module_id, permission_key, element_type, element_label, component_path, is_ui_element, description)
SELECT m.id, 'org.accounting.manage', 'button', 'Organisation Accounting Manage (COA customisation)', 'pages/org/OrgChartOfAccountsPage.tsx', 1, 'Hide, show or rename default accounts for the organisation'
FROM permission_modules m WHERE m.slug = 'org'
ON DUPLICATE KEY UPDATE element_type = VALUES(element_type), element_label = VALUES(element_label), component_path = VALUES(component_path), is_ui_element = VALUES(is_ui_element);

INSERT INTO permissions (module_id, permission_key, element_type, element_label, component_path, is_ui_element, description)
SELECT m.id, 'org.sidebar.accounting', 'tab', 'Org Sidebar: Accounting', 'components/layout/OrgSidebar.tsx', 1, 'Organisation sidebar Accounting section'
FROM permission_modules m WHERE m.slug = 'org'
ON DUPLICATE KEY UPDATE element_type = VALUES(element_type), element_label = VALUES(element_label), component_path = VALUES(component_path), is_ui_element = VALUES(is_ui_element);

-- ── 2. Grant to roles (matches role-permission-templates.mjs) ──
-- View: org admins + finance/audit roles
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'org.accounting.view'
WHERE r.slug IN ('super_admin', 'org-admin', 'accountant', 'master-admin', 'operations-manager', 'auditor', 'read-only-admin')
  AND r.deleted_at IS NULL;

-- Manage: org admins + finance roles (not auditor / read-only-admin)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'org.accounting.manage'
WHERE r.slug IN ('super_admin', 'org-admin', 'accountant', 'master-admin', 'operations-manager')
  AND r.deleted_at IS NULL;

-- Sidebar section
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'org.sidebar.accounting'
WHERE r.slug IN ('super_admin', 'org-admin', 'accountant', 'master-admin', 'operations-manager')
  AND r.deleted_at IS NULL;
