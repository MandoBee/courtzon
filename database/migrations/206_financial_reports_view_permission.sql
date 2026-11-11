-- 206_financial_reports_view_permission.sql
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- D4 — dedicated read gate for the GLOBAL Financial Reports surface.
--
-- Protected routes (frontend route map + page-level gate all use this one key):
--   * /admin/finance          → FinanceDashboardPage
--   * /admin/finance/ledger   → LedgerViewerPage
--   * /admin/finance/reports  → ReportCenterPage
--
-- The backend read endpoints behind those pages
-- (/admin/financial/revenue, /admin/financial/ledger,
--  /admin/financial/wallet-summary) are guarded by
-- `requireFinancialReportsAccess()`, which decides on scope + role + same-role
-- permission and fails closed.
--
-- Approved policy: ONLY the GLOBAL `super_admin` and GLOBAL `finance-manager`
-- receive `financial.reports.view`.
--   • organisation-scoped clones (e.g. an org finance-manager) must NOT receive
--     global financial report access → guarded by `organisation_id IS NULL`;
--   • master-admin, accountant, org-admin, operations-manager,
--     marketplace-manager, auditor, read-only-admin, content-manager and every
--     other role stay denied.
--
-- Deliberately NOT part of this migration: `financial.export`,
-- `accounting.export`, `settlements.export`, `notifications.webhooks.export`
-- and `translations.export`. Those keys are already declared in
-- frontend/src/permissions/registry.ts and granted per role by
-- backend/scripts/role-permission-templates.mjs + sync-role-permissions.mjs;
-- duplicating them here would create a second, divergent grant authority.
--
-- Idempotent: INSERT ... ON DUPLICATE KEY UPDATE for the permission key
-- (unique permission_key), INSERT IGNORE for role grants (unique
-- role_id + permission_id). No schema change, no deletes, no other keys.

-- ── 1. Register the permission key ──
INSERT INTO permissions (module_id, permission_key, element_type, element_label, component_path, is_ui_element, description)
SELECT m.id, 'financial.reports.view', 'page', 'Financial Reports View', 'pages/admin/finance/ReportCenterPage.tsx', 1, 'View the global finance report center, finance dashboard and ledger viewer (revenue, wallet, ledger and settlement reports)'
FROM permission_modules m WHERE m.slug = 'financial'
ON DUPLICATE KEY UPDATE element_type = VALUES(element_type), element_label = VALUES(element_label), component_path = VALUES(component_path), is_ui_element = VALUES(is_ui_element), description = VALUES(description);

-- ── 2. Grant to the approved GLOBAL roles only (resolved by slug) ──
-- `organisation_id IS NULL` is the tenant boundary: an organisation-scoped
-- finance-manager clone resolves to the same slug but must stay denied.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.permission_key = 'financial.reports.view'
WHERE r.slug IN ('super_admin', 'finance-manager')
  AND r.organisation_id IS NULL
  AND r.deleted_at IS NULL;
