-- ============================================================================
-- Migration 030: Session & Device Security Enhancements
-- ============================================================================

-- Add device fingerprint tracking to user_sessions for suspicious login detection
ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS ip_country VARCHAR(100) DEFAULT NULL AFTER ip_address,
  ADD COLUMN IF NOT EXISTS suspicious BOOLEAN DEFAULT FALSE AFTER device_fingerprint;

-- Index for suspicious session lookup
CREATE INDEX IF NOT EXISTS idx_sessions_suspicious ON user_sessions(suspicious, expires_at);

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

-- Audit log: add index for admin searches
-- (already has idx_actor, idx_entity, idx_action, idx_created from 000)

-- Expire old login attempts (run as scheduled event)
-- Already handled by ev_cleanup_expired_sessions style event
