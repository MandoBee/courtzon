-- ============================================================================
-- COURTZON-V2 : RENAME club_id/court_id TO organisation_id/resource_id
-- Aligns booking, settlement, and amenity tables with the canonical
-- Organisation -> Branch -> Resource hierarchy.
-- Idempotent: safe to run multiple times.
-- ============================================================================

USE courtzon_v2;

-- -----------------------------------------------------------
-- Helper: drop old index if it still exists
-- -----------------------------------------------------------
SET @s = '';

-- -----------------------------------------------------------
-- 1. bookings: club_id -> organisation_id, court_id -> resource_id
-- -----------------------------------------------------------
SELECT COUNT(*) INTO @has_old_idx FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'bookings' AND index_name = 'idx_club';
SET @s = IF(@has_old_idx > 0,
  'ALTER TABLE bookings DROP INDEX idx_club, DROP INDEX idx_court',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_old_col FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'bookings' AND column_name = 'club_id';
SET @s = IF(@has_old_col > 0,
  'ALTER TABLE bookings CHANGE COLUMN club_id organisation_id BIGINT UNSIGNED NOT NULL, CHANGE COLUMN court_id resource_id BIGINT UNSIGNED NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_new_idx FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'bookings' AND index_name = 'idx_organisation';
SET @s = IF(@has_new_idx = 0,
  'ALTER TABLE bookings ADD INDEX idx_organisation (organisation_id), ADD INDEX idx_resource (resource_id)',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------
-- 2. cancellation_policies: club_id -> organisation_id
-- -----------------------------------------------------------
SELECT COUNT(*) INTO @has_old_idx FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'cancellation_policies' AND index_name = 'idx_club';
SET @s = IF(@has_old_idx > 0,
  'ALTER TABLE cancellation_policies DROP INDEX idx_club',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_old_col FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'cancellation_policies' AND column_name = 'club_id';
SET @s = IF(@has_old_col > 0,
  'ALTER TABLE cancellation_policies CHANGE COLUMN club_id organisation_id BIGINT UNSIGNED NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_new_idx FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'cancellation_policies' AND index_name = 'idx_organisation';
SET @s = IF(@has_new_idx = 0,
  'ALTER TABLE cancellation_policies ADD INDEX idx_organisation (organisation_id)',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------
-- 3. settlements: club_id -> organisation_id
-- -----------------------------------------------------------
SELECT COUNT(*) INTO @has_old_idx FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'settlements' AND index_name = 'idx_club';
SET @s = IF(@has_old_idx > 0,
  'ALTER TABLE settlements DROP INDEX idx_club',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_old_col FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'settlements' AND column_name = 'club_id';
SET @s = IF(@has_old_col > 0,
  'ALTER TABLE settlements CHANGE COLUMN club_id organisation_id BIGINT UNSIGNED NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_new_idx FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'settlements' AND index_name = 'idx_organisation';
SET @s = IF(@has_new_idx = 0,
  'ALTER TABLE settlements ADD INDEX idx_organisation (organisation_id)',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------
-- 4. court_amenity_assignments: court_id -> resource_id
-- -----------------------------------------------------------
SELECT COUNT(*) INTO @has_old_idx FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'court_amenity_assignments' AND index_name = 'idx_court';
SET @s = IF(@has_old_idx > 0,
  'ALTER TABLE court_amenity_assignments DROP INDEX idx_court, DROP INDEX uk_court_amenity',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_old_col FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE() AND table_name = 'court_amenity_assignments' AND column_name = 'court_id';
SET @s = IF(@has_old_col > 0,
  'ALTER TABLE court_amenity_assignments CHANGE COLUMN court_id resource_id BIGINT UNSIGNED NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @has_new_idx FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE() AND table_name = 'court_amenity_assignments' AND index_name = 'idx_resource';
SET @s = IF(@has_new_idx = 0,
  'ALTER TABLE court_amenity_assignments ADD INDEX idx_resource (resource_id), ADD UNIQUE KEY uk_resource_amenity (resource_id, amenity_id)',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
