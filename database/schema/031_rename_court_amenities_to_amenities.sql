-- ============================================================================
-- COURTZON-V2 : Rename court_amenities -> amenities,
--               court_amenity_assignments -> branch_amenity_assignments,
--               resource_id -> branch_id
-- Safe on fresh seed: checks for old tables before rename, skips if gone.
-- ============================================================================

USE courtzon_v2;

-- NOTE: Do NOT DROP old tables here — RENAME handles both fresh seed and upgrade paths.

-- Rename if old tables still exist (first run after upgrade)
SELECT COUNT(*) INTO @old FROM information_schema.TABLES
  WHERE table_schema = 'courtzon_v2' AND table_name = 'court_amenities';
SET @s = IF(@old > 0, 'RENAME TABLE court_amenities TO amenities', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @old FROM information_schema.TABLES
  WHERE table_schema = 'courtzon_v2' AND table_name = 'court_amenity_assignments';
SET @s = IF(@old > 0, 'RENAME TABLE court_amenity_assignments TO branch_amenity_assignments', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Change resource_id to branch_id (only if the table actually exists)
SELECT COUNT(*) INTO @tbl FROM information_schema.TABLES
  WHERE table_schema = 'courtzon_v2' AND table_name = 'branch_amenity_assignments';
SELECT COUNT(*) INTO @has_col FROM information_schema.COLUMNS
  WHERE table_schema = 'courtzon_v2' AND table_name = 'branch_amenity_assignments' AND column_name = 'resource_id';
SET @s = IF(@tbl > 0 AND @has_col > 0,
  'ALTER TABLE branch_amenity_assignments CHANGE COLUMN resource_id branch_id BIGINT UNSIGNED NOT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop old indexes from pre-011 state (only if the table exists)
SET @s = IF(@tbl > 0,
  'SELECT COUNT(*) INTO @old_idx FROM information_schema.STATISTICS WHERE table_schema = ''courtzon_v2'' AND table_name = ''branch_amenity_assignments'' AND index_name = ''idx_resource''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = IF(@tbl > 0 AND @old_idx > 0, 'ALTER TABLE branch_amenity_assignments DROP INDEX idx_resource', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(@tbl > 0,
  'SELECT COUNT(*) INTO @old_idx FROM information_schema.STATISTICS WHERE table_schema = ''courtzon_v2'' AND table_name = ''branch_amenity_assignments'' AND index_name = ''uk_resource_amenity''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = IF(@tbl > 0 AND @old_idx > 0, 'ALTER TABLE branch_amenity_assignments DROP INDEX uk_resource_amenity', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(@tbl > 0,
  'SELECT COUNT(*) INTO @old_idx FROM information_schema.STATISTICS WHERE table_schema = ''courtzon_v2'' AND table_name = ''branch_amenity_assignments'' AND index_name = ''idx_court''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = IF(@tbl > 0 AND @old_idx > 0, 'ALTER TABLE branch_amenity_assignments DROP INDEX idx_court', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(@tbl > 0,
  'SELECT COUNT(*) INTO @old_idx FROM information_schema.STATISTICS WHERE table_schema = ''courtzon_v2'' AND table_name = ''branch_amenity_assignments'' AND index_name = ''uk_court_amenity''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = IF(@tbl > 0 AND @old_idx > 0, 'ALTER TABLE branch_amenity_assignments DROP INDEX uk_court_amenity', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ensure new indexes exist (only if the table exists)
SET @s = IF(@tbl > 0,
  'SELECT COUNT(*) INTO @new_idx FROM information_schema.STATISTICS WHERE table_schema = ''courtzon_v2'' AND table_name = ''branch_amenity_assignments'' AND index_name = ''idx_branch''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = IF(@tbl > 0 AND @new_idx = 0, 'ALTER TABLE branch_amenity_assignments ADD INDEX idx_branch (branch_id)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(@tbl > 0,
  'SELECT COUNT(*) INTO @new_idx FROM information_schema.STATISTICS WHERE table_schema = ''courtzon_v2'' AND table_name = ''branch_amenity_assignments'' AND index_name = ''uk_branch_amenity''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = IF(@tbl > 0 AND @new_idx = 0, 'ALTER TABLE branch_amenity_assignments ADD UNIQUE KEY uk_branch_amenity (branch_id, amenity_id)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
