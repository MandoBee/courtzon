-- Migration 021: Create match_participants table (confirmed participants for any match type)

CREATE TABLE IF NOT EXISTS match_participants (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id          BIGINT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NOT NULL,
  role              ENUM('host','joiner') NOT NULL DEFAULT 'joiner',
  joined_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_participant (match_id, user_id),
  KEY idx_user (user_id),

  CONSTRAINT fk_part_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
  CONSTRAINT fk_part_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
