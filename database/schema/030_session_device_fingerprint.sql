-- ============================================================================
-- Migration 030: Session & Device Security Enhancements (MySQL 8 compatible)
-- ============================================================================

-- Add device fingerprint tracking to user_sessions for suspicious login detection
-- MySQL 8 does not support ADD COLUMN IF NOT EXISTS, so use information_schema guards

-- Column: ip_country
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_sessions' AND COLUMN_NAME = 'ip_country');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE user_sessions ADD COLUMN ip_country VARCHAR(100) DEFAULT NULL AFTER ip_address', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Column: suspicious
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_sessions' AND COLUMN_NAME = 'suspicious');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE user_sessions ADD COLUMN suspicious BOOLEAN DEFAULT FALSE AFTER device_fingerprint', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index for suspicious session lookup
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_sessions' AND INDEX_NAME = 'idx_sessions_suspicious');
SET @sql = IF(@idx_exists = 0, 'CREATE INDEX idx_sessions_suspicious ON user_sessions(suspicious, expires_at)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add login attempt tracking table (for non-Redis fallback)
CREATE TABLE IF NOT EXISTS login_attempts (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  identifier      VARCHAR(255) NOT NULL COMMENT 'IP address or phone number',
  success         BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address      VARCHAR(45) DEFAULT NULL,
  user_agent      TEXT DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attempts_identifier (identifier, created_at),
  INDEX idx_attempts_created (created_at)
) ENGINE=InnoDB;
