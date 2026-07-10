-- Migration 022: Create match_sessions table (post-match data, created when match starts)

CREATE TABLE IF NOT EXISTS match_sessions (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id                BIGINT UNSIGNED NOT NULL UNIQUE,
  status                  ENUM('in_progress','completed','voided') NOT NULL DEFAULT 'in_progress',
  started_at              TIMESTAMP NULL DEFAULT NULL,
  ended_at                TIMESTAMP NULL DEFAULT NULL,
  duration_minutes        INT DEFAULT NULL,
  winner_id               INT UNSIGNED DEFAULT NULL,
  participants_confirmed  JSON DEFAULT NULL COMMENT 'Array of user_ids who checked in',
  no_show_user_ids        JSON DEFAULT NULL COMMENT 'Array of user_ids who did not show',
  scores                  JSON DEFAULT NULL COMMENT 'Sport-specific score data',
  format                  JSON DEFAULT NULL COMMENT 'Rules, game format settings',
  metadata                JSON DEFAULT NULL COMMENT 'Extensible for future needs',
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_status (status),
  KEY idx_winner (winner_id),

  CONSTRAINT fk_session_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
  CONSTRAINT fk_session_winner FOREIGN KEY (winner_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
