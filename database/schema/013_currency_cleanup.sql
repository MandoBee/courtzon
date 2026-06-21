-- ============================================================================
-- COURTZON-V2 : Merge currencies into countries
-- Adds currency details to countries table, links via FK
-- ============================================================================

-- Add currency detail columns to countries
SET @db = (SELECT DATABASE());
SET @sql = IF(
  NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'countries' AND COLUMN_NAME = 'currency_symbol'),
  'ALTER TABLE countries ADD COLUMN currency_symbol VARCHAR(10) DEFAULT NULL COMMENT ''Currency symbol (e.g. $, €)'' AFTER default_currency',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'countries' AND COLUMN_NAME = 'currency_decimal_places'),
  'ALTER TABLE countries ADD COLUMN currency_decimal_places TINYINT UNSIGNED DEFAULT 2 COMMENT ''Decimal places for the currency'' AFTER currency_symbol',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  NOT EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'countries' AND COLUMN_NAME = 'currency_name'),
  'ALTER TABLE countries ADD COLUMN currency_name VARCHAR(50) DEFAULT NULL COMMENT ''Full currency name'' AFTER currency_decimal_places',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Populate from currencies table where possible
UPDATE countries c
INNER JOIN currencies cur ON cur.code = c.default_currency
SET c.currency_symbol = cur.symbol,
    c.currency_name = cur.name,
    c.currency_decimal_places = cur.decimal_places
WHERE c.default_currency IS NOT NULL;

-- Make default_currency nullable for FK SET NULL
ALTER TABLE countries MODIFY COLUMN default_currency CHAR(3) NULL DEFAULT NULL;

-- Add FK from countries.default_currency to currencies.code
SET @sql2 = IF(
  NOT EXISTS(SELECT 1 FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'countries' AND CONSTRAINT_NAME = 'fk_country_currency'),
  'ALTER TABLE countries ADD CONSTRAINT fk_country_currency FOREIGN KEY (default_currency) REFERENCES currencies(code) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- Add FK from branches.currency_id to currencies.id
SET @sql3 = IF(
  NOT EXISTS(SELECT 1 FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'branches' AND CONSTRAINT_NAME = 'fk_branch_currency'),
  'ALTER TABLE branches ADD CONSTRAINT fk_branch_currency FOREIGN KEY (currency_id) REFERENCES currencies(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;
