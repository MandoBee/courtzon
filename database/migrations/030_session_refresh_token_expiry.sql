-- Migration 030: Add refresh_token_expires_at to user_sessions
-- Supports configurable session management (Remember Me, session-only tokens)

ALTER TABLE `user_sessions`
  ADD COLUMN `refresh_token_expires_at` TIMESTAMP NULL DEFAULT NULL AFTER `expires_at`;

CREATE INDEX `idx_user_sessions_refresh_expires` ON `user_sessions` (`user_id`, `refresh_token_expires_at`);
