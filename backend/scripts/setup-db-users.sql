-- ============================================================================
-- CourtZon Database User Setup (Run as MySQL root)
-- Creates least-privilege users for production
-- ============================================================================

-- App User (CRUD for application operations)
CREATE USER IF NOT EXISTS 'app_user'@'%' IDENTIFIED BY 'CHANGE_ME_APP_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON courtzon_v2.* TO 'app_user'@'%';

-- Read-only User (for reporting, dashboards, analytics)
CREATE USER IF NOT EXISTS 'readonly_user'@'%' IDENTIFIED BY 'CHANGE_ME_READONLY_PASSWORD';
GRANT SELECT ON courtzon_v2.* TO 'readonly_user'@'%';

-- Migration User (DDL operations for schema changes)
CREATE USER IF NOT EXISTS 'migration_user'@'%' IDENTIFIED BY 'CHANGE_ME_MIGRATION_PASSWORD';
GRANT ALL PRIVILEGES ON courtzon_v2.* TO 'migration_user'@'%';

-- Apply changes
FLUSH PRIVILEGES;

-- ============================================================================
-- Usage:
--   mysql -u root -p < setup-db-users.sql
--   Then update your .env / Docker secrets with the new credentials
-- ============================================================================
