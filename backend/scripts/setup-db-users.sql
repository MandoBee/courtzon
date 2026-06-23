-- ============================================================================
-- CourtZon Database User Setup (Run as MySQL root)
-- Creates least-privilege users for production
-- ============================================================================
-- Usage:
--   mysql -u root -p < setup-db-users.sql
--   Then update your .env with the new credentials
-- ============================================================================

-- App User (CRUD for application operations — matches .env.production DB_USER)
CREATE USER IF NOT EXISTS 'courtzon_app'@'%' IDENTIFIED BY 'CHANGE_ME_APP_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON courtzon_v2.* TO 'courtzon_app'@'%';

-- Read-only User (for reporting, dashboards, analytics)
CREATE USER IF NOT EXISTS 'courtzon_readonly'@'%' IDENTIFIED BY 'CHANGE_ME_READONLY_PASSWORD';
GRANT SELECT ON courtzon_v2.* TO 'courtzon_readonly'@'%';

-- Migration User (DDL operations for schema changes — used by migrate.js only)
CREATE USER IF NOT EXISTS 'courtzon_migration'@'%' IDENTIFIED BY 'CHANGE_ME_MIGRATION_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, LOCK TABLES ON courtzon_v2.* TO 'courtzon_migration'@'%';

-- Backup User (can run mysqldump with --single-transaction)
CREATE USER IF NOT EXISTS 'courtzon_backup'@'%' IDENTIFIED BY 'CHANGE_ME_BACKUP_PASSWORD';
GRANT SELECT, LOCK TABLES, RELOAD, REPLICATION CLIENT, SHOW VIEW, EVENT, TRIGGER ON *.* TO 'courtzon_backup'@'%';

-- Apply changes
FLUSH PRIVILEGES;

-- ============================================================================
-- Verification queries (run after to confirm):
--   SELECT user, host FROM mysql.user WHERE user LIKE 'courtzon_%';
--   SHOW GRANTS FOR 'courtzon_app'@'%';
-- ============================================================================
