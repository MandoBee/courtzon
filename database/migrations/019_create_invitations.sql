-- Migration 019: Create invitations table (system-to-player invitation lifecycle)

CREATE TABLE IF NOT EXISTS invitations (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id          BIGINT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NOT NULL,
  status            ENUM('sent','read','declined','expired') NOT NULL DEFAULT 'sent',
  sent_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at           TIMESTAMP NULL DEFAULT NULL,
  responded_at      TIMESTAMP NULL DEFAULT NULL,
  expires_at        TIMESTAMP NULL DEFAULT NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uk_invitation (match_id, user_id),
  KEY idx_user (user_id),
  KEY idx_expires (status, expires_at),

  CONSTRAINT fk_inv_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
  CONSTRAINT fk_inv_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
