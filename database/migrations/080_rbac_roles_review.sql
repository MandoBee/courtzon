-- 080_rbac_roles_review.sql
-- Idempotent RBAC reconciliation for the built-in staff roles (July 2026 audit).
--
-- Changes:
--   1) Removes the obsolete `home.recent-activity` grant from all built-in
--      staff roles (org-admin, shop-admin, resource-mgr, coach, accountant).
--      That permission backs a consumer-only home section (RecentActivity.tsx)
--      and is explicitly excluded from every non-player role template.
--   2) Grants `settlements.request` to org-admin. Org Finance uses it for the
--      "Request Settlement" button (OrgFinancePage.tsx), but the global
--      org-admin role was missing it while org-scoped clones already had it.
--   3) Grants `coaches.approve` + `coaches.assign` to org-admin. These are an
--      intentional business workflow (Org Admin approves/assigns coaches
--      within their organisation) kept across all org-admin roles.
--   4) Grants the finance `sidebar.*` keys to accountant so the AdminLayout
--      sidebar renders only its finance section (least privilege).
--
-- All statements are idempotent (safe to re-run).

-- 1) Remove obsolete consumer-only grant
DELETE rp FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.slug IN ('org-admin', 'shop-admin', 'resource-mgr', 'coach', 'accountant')
  AND p.permission_key = 'home.recent-activity'
  AND r.deleted_at IS NULL;

-- 2) + 3) org-admin: finance settlement request + coach approval/assignment
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key IN (
  'settlements.request',
  'coaches.approve',
  'coaches.assign'
)
WHERE r.slug = 'org-admin'
  AND r.deleted_at IS NULL;

-- 4) accountant: finance-only sidebar keys (AdminLayout navigation)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key IN (
  'sidebar.dashboard',
  'sidebar.reports',
  'sidebar.settlements',
  'sidebar.admin-bookings',
  'sidebar.finance-dashboard',
  'sidebar.finance-ledger',
  'sidebar.finance-reports',
  'sidebar.finance-transactions',
  'sidebar.withdrawal-requests',
  'sidebar.coupons',
  'sidebar.marketplace-orders'
)
WHERE r.slug = 'accountant'
  AND r.deleted_at IS NULL;
