-- Add description column to permissions table
ALTER TABLE permissions
  ADD COLUMN description VARCHAR(500) DEFAULT NULL COMMENT 'What this permission allows'
  AFTER permission_key;
