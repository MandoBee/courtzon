-- ============================================================================
-- COURTZON-V2 : Add name and description to organisation_types
-- ============================================================================

-- Safe DDL: only add columns if they don't already exist (idempotent)
SET @db = (SELECT DATABASE());
SET @sql = IF(
  NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'organisation_types' AND COLUMN_NAME = 'name'),
  'ALTER TABLE organisation_types ADD COLUMN name VARCHAR(100) DEFAULT NULL COMMENT ''Display name'' AFTER slug',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'organisation_types' AND COLUMN_NAME = 'description'),
  'ALTER TABLE organisation_types ADD COLUMN description TEXT DEFAULT NULL AFTER name',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Seed name and description (idempotent: only update NULL rows)
UPDATE organisation_types SET name = 'Sports Club' WHERE slug = 'sports-club' AND name IS NULL;
UPDATE organisation_types SET name = 'Sports Academy' WHERE slug = 'sports-academy' AND name IS NULL;
UPDATE organisation_types SET name = 'Fitness Center' WHERE slug = 'fitness-center' AND name IS NULL;
UPDATE organisation_types SET name = 'Padel Club' WHERE slug = 'padel-club' AND name IS NULL;
UPDATE organisation_types SET name = 'Club' WHERE slug = 'club' AND name IS NULL;
UPDATE organisation_types SET name = 'Gym' WHERE slug = 'gym' AND name IS NULL;
UPDATE organisation_types SET name = 'Clinic' WHERE slug = 'clinic' AND name IS NULL;
UPDATE organisation_types SET name = 'Spa' WHERE slug = 'spa' AND name IS NULL;
UPDATE organisation_types SET name = 'Wellness Center' WHERE slug = 'wellness_center' AND name IS NULL;
