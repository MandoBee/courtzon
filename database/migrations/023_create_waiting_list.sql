-- Migration 023: Create waiting_list table (ordered queue for full matches)

CREATE TABLE IF NOT EXISTS waiting_list (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  match_id          BIGINT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NOT NULL,
  position          INT NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_wl_entry (match_id, user_id),
  UNIQUE KEY uk_wl_position (match_id, position),
  KEY idx_match_position (match_id, position),

  CONSTRAINT fk_wl_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
  CONSTRAINT fk_wl_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
