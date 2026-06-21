-- ============================================================================
-- COURTZON-V2 : Add sort_order to currencies
-- ============================================================================

SET @db = (SELECT DATABASE());
SET @sql = IF(
  NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'currencies' AND COLUMN_NAME = 'sort_order'),
  'ALTER TABLE currencies ADD COLUMN sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER decimal_places',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
