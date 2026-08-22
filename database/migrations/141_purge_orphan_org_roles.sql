-- 141: Purge org-scoped RBAC rows whose organisation no longer exists.
--
-- Root cause (production incident, Aug 2026): out-of-app cleanup sessions ran
-- DELETE on `organisations` with FOREIGN_KEY_CHECKS=0 (dump/restore pattern,
-- see backups/pre-cleanup_*.sql), which removed organisations 14-18 while their
-- cloned shop-admin roles (ids 1095-1099) survived. All five had zero
-- user_roles assignments. The application deletion path is soft-delete only
-- and never produces this state; this migration repairs external drift only.
--
-- Safety:
--   * Statement 1 matches ONLY scoped roles whose organisation row is missing.
--     With fk_role_org (ON DELETE CASCADE) present this can only ever match
--     FK-checks-off drift, never legitimate data.
--   * Dependent rows (user_roles, role_permissions, user_role_scopes) are
--     removed automatically by their existing CASCADE foreign keys.
--   * role_theme_overrides intentionally has no FK on role_id (theme token
--     table), so statement 2 removes its orphans explicitly.
--   * Idempotent: both statements are no-ops once the drift is repaired.

DELETE r
FROM roles r
LEFT JOIN organisations o ON o.id = r.organisation_id
WHERE r.organisation_id IS NOT NULL
  AND o.id IS NULL;

DELETE rto
FROM role_theme_overrides rto
LEFT JOIN roles r ON r.id = rto.role_id
WHERE r.id IS NULL;
