-- ============================================================================
-- Migration 008: Password Reset Tokens
-- ============================================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  token             VARCHAR(255) NOT NULL,
  expires_at        TIMESTAMP NOT NULL,
  used_at           TIMESTAMP NULL DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_token (token),
  INDEX idx_user (user_id),
  CONSTRAINT fk_reset_token_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
