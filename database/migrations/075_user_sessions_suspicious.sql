ALTER TABLE user_sessions
  ADD COLUMN suspicious tinyint(1) NOT NULL DEFAULT 0 AFTER is_revoked,
  ADD KEY idx_suspicious_sessions (`suspicious`, `is_revoked`, `expires_at`);
