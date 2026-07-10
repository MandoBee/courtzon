-- Migration 018: Create public_match_details table (Public-Match-specific attributes)

CREATE TABLE IF NOT EXISTS public_match_details (
  match_id          BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  creator_id        INT UNSIGNED NOT NULL,
  visibility        ENUM('public','invite_only') NOT NULL DEFAULT 'public',
  auto_accept       TINYINT(1) NOT NULL DEFAULT 0,
  max_players       INT NOT NULL DEFAULT 2,
  min_age           INT DEFAULT NULL,
  max_age           INT DEFAULT NULL,
  target_gender     ENUM('male','female','any') NOT NULL DEFAULT 'any',
  target_level_id   INT UNSIGNED DEFAULT NULL,
  deadline          DATETIME DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_pmd_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
  CONSTRAINT fk_pmd_creator FOREIGN KEY (creator_id) REFERENCES users (id),
  CONSTRAINT fk_pmd_level FOREIGN KEY (target_level_id) REFERENCES player_levels (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
