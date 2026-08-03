-- 081_referee_role.sql
-- Promote Referee to a first-class platform RBAC role (August 2026).
--
-- The Referee is an official CourtZon role (officiates matches, records
-- results, manages officiating availability). Previously referees were served
-- by the Coach roles inheriting `referee.*` permissions; this migration gives
-- Referee its own protected global role and a dedicated least-privilege
-- permission set (officiating scope only — no org/user/finance/marketplace
-- management).
--
-- Changes:
--   1) Insert the global `referee` role (id 11, is_system=1 so it is
--      protected and always available; mirrors independent/resident coach).
--   2) Grant exactly the officiating permission set (referee.* keys only).
--   3) Revoke `referee.*` from the Coach roles so Referee no longer inherits
--      its behaviour from Coach (independent first-class role).
--
-- All statements are idempotent (safe to re-run).
-- Live DB (Docker courtzon_v3) had 0 rows in `referees` — no data migration
-- needed; referee identity continues to resolve via the existing profile
-- endpoint. `tournament_matches.referee_id` FK remains untouched.

-- 1) Global Referee role
INSERT IGNORE INTO `roles`
  (`id`, `organisation_id`, `name`, `slug`, `description`, `is_system`, `is_active`, `deleted_at`, `created_at`, `updated_at`)
VALUES
  (11, NULL, 'Referee', 'referee', 'Official match referee - manages officiating assignments, schedules, and results', 1, 1, NULL, NOW(), NOW());

-- 2) Referee permission grants (officiating scope only)
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_key IN (
  'referee.dashboard.view',
  'referee.assignments.view',
  'referee.assignments.manage',
  'referee.availability.view',
  'referee.availability.manage',
  'referee.profile.view',
  'referee.profile.update',
  'referee.statistics.view'
)
WHERE r.slug = 'referee'
  AND r.deleted_at IS NULL;

-- 3) Decouple Referee from Coach roles (referee.* no longer inherited)
DELETE rp FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.slug IN ('coach', 'independent_coach', 'resident_coach')
  AND p.permission_key LIKE 'referee.%'
  AND r.deleted_at IS NULL;
