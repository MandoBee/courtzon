-- Migration 030: Add refresh_token_expires_at to user_sessions
-- Supports configurable session management (Remember Me, session-only tokens)
-- Idempotent: safe to re-run

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_sessions'
    AND COLUMN_NAME = 'refresh_token_expires_at'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE `user_sessions` ADD COLUMN `refresh_token_expires_at` TIMESTAMP NULL DEFAULT NULL AFTER `expires_at`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @index_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_sessions'
    AND INDEX_NAME = 'idx_user_sessions_refresh_expires'
);

SET @sql = IF(@index_exists = 0,
  'CREATE INDEX `idx_user_sessions_refresh_expires` ON `user_sessions` (`user_id`, `refresh_token_expires_at`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
