-- Migration 020: Create join_requests table (player-to-system join request lifecycle)

CREATE TABLE IF NOT EXISTS join_requests (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id          BIGINT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NOT NULL,
  status            ENUM('submitted','withdrawn','approved','rejected','auto_rejected') NOT NULL DEFAULT 'submitted',
  submitted_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at      TIMESTAMP NULL DEFAULT NULL,
  responder_id      INT UNSIGNED DEFAULT NULL COMMENT 'User who approved/rejected (NULL = system)',
  rejection_reason  VARCHAR(500) DEFAULT NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uk_join_request (match_id, user_id),
  KEY idx_user (user_id),
  KEY idx_status_match (status, match_id),

  CONSTRAINT fk_jr_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
  CONSTRAINT fk_jr_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_jr_responder FOREIGN KEY (responder_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
