-- Fix sidebar_layout parent_key uniqueness (MariaDB treats NULL as distinct)
-- Top-level container uses empty string instead of NULL

-- Step 1: Remove duplicates
DELETE t1 FROM sidebar_layout t1
INNER JOIN sidebar_layout t2
WHERE t1.id > t2.id
  AND t1.user_id = t2.user_id
  AND (t1.parent_key = t2.parent_key OR (t1.parent_key IS NULL AND t2.parent_key IS NULL));

-- Step 2: Update NULL to empty string
UPDATE sidebar_layout SET parent_key = '' WHERE parent_key IS NULL;

-- Step 3: Change column to NOT NULL with default
ALTER TABLE sidebar_layout MODIFY COLUMN parent_key VARCHAR(100) NOT NULL DEFAULT '';
