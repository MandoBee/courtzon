-- ==============================================================================
-- CourtZon-V3 — Database Users Setup
-- Creates least-privilege MySQL users for the application stack.
-- Run this script as MySQL root user.
-- ==============================================================================
-- Usage:
--   mysql -u root -p < database/scripts/setup-db-users.sql
--
-- Then set passwords for each user:
--   ALTER USER 'courtzon_app'@'%' IDENTIFIED BY 'your-strong-password';
--   ALTER USER 'courtzon_migrator'@'%' IDENTIFIED BY 'your-strong-password';
--   ALTER USER 'courtzon_backup'@'%' IDENTIFIED BY 'your-strong-password';
--   ALTER USER 'courtzon_readonly'@'%' IDENTIFIED BY 'your-strong-password';
-- ==============================================================================

-- ── Application User (full DML + DDL on the app database) ──────────────────

CREATE USER IF NOT EXISTS 'courtzon_app'@'%'
  IDENTIFIED BY 'change-me-app-password'
  REQUIRE SSL;

GRANT ALTER, CREATE, CREATE VIEW, DELETE, DROP, EXECUTE, INDEX, INSERT,
      REFERENCES, SELECT, SHOW VIEW, TRIGGER, UPDATE
  ON `courtzon_v3`.*
  TO 'courtzon_app'@'%';

-- ── Migration User (schema changes only) ───────────────────────────────────

CREATE USER IF NOT EXISTS 'courtzon_migrator'@'%'
  IDENTIFIED BY 'change-me-migrator-password'
  REQUIRE SSL;

GRANT ALTER, ALTER ROUTINE, CREATE, CREATE ROUTINE, CREATE VIEW, DELETE,
      DROP, EXECUTE, INDEX, INSERT, REFERENCES, SELECT, SHOW VIEW, TRIGGER, UPDATE
  ON `courtzon_v3`.*
  TO 'courtzon_migrator'@'%';

-- ── Backup User (read + lock tables for mysqldump) ─────────────────────────

CREATE USER IF NOT EXISTS 'courtzon_backup'@'%'
  IDENTIFIED BY 'change-me-backup-password'
  REQUIRE SSL;

GRANT SELECT, LOCK TABLES, SHOW VIEW, TRIGGER
  ON `courtzon_v3`.*
  TO 'courtzon_backup'@'%';

-- ── Read-Only User (monitoring / reporting / analytics) ────────────────────

CREATE USER IF NOT EXISTS 'courtzon_readonly'@'%'
  IDENTIFIED BY 'change-me-readonly-password'
  REQUIRE SSL;

GRANT SELECT, SHOW VIEW
  ON `courtzon_v3`.*
  TO 'courtzon_readonly'@'%';

-- ⚠️  After creation, set real passwords:
--
--     ALTER USER 'courtzon_app'@'%'       IDENTIFIED BY '<strong-password>';
--     ALTER USER 'courtzon_migrator'@'%'  IDENTIFIED BY '<strong-password>';
--     ALTER USER 'courtzon_backup'@'%'    IDENTIFIED BY '<strong-password>';
--     ALTER USER 'courtzon_readonly'@'%'  IDENTIFIED BY '<strong-password>';
--
--     FLUSH PRIVILEGES;
--
-- Verify with:
--     SHOW GRANTS FOR 'courtzon_app'@'%';
--     SHOW GRANTS FOR 'courtzon_migrator'@'%';
--     SHOW GRANTS FOR 'courtzon_backup'@'%';
--     SHOW GRANTS FOR 'courtzon_readonly'@'%';
