-- Migration 057: Widen processed_commands.command_id from VARCHAR(26) to VARCHAR(128)
-- The column was designed for ULID (26 chars) but production command IDs use
-- `{commandType}-{timestamp}-{random}` format (up to ~45 chars).
-- Example: process-payment-1784932693137-4hdbi7 = 36 chars

ALTER TABLE processed_commands
  MODIFY COLUMN command_id VARCHAR(128) NOT NULL COMMENT 'Command identifier — supports ULID (26) and descriptive formats (up to 45+)';
