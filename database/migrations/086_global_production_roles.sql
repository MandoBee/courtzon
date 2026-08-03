-- 086_global_production_roles.sql
-- Convert production roles from System to Global (August 2026).
--
-- System roles (is_system=1) are protected from deletion and their permission
-- sets auto-sync via templates. Global roles (is_system=0) are editable and
-- assignable by Super Admin while still participating in template sync.
--
-- After this migration only Super Admin (id=1) and Player (id=2) remain
-- System roles — all production roles are Global.
--
-- Affected: Referee (11), Independent Coach (9), Resident Coach (10).
-- Coach (7), Org Admin (3), Shop Admin (6), Resource Manager (5), and
-- Accountant (8) were already Global — unchanged.
--
-- All statements are idempotent (safe to re-run).

UPDATE roles SET is_system = 0
WHERE id IN (9, 10, 11) AND is_system = 1 AND deleted_at IS NULL;
