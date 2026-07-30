-- ============================================================================
-- Sprint 7 — Tournament & Competition Foundation
-- ============================================================================
-- This migration is additive. It extends existing tournament tables and
-- adds new tables for group stages, standings, and team match support.
-- ============================================================================

-- ── Extend tournaments (idempotent) ──────────────────────────────────────
DROP PROCEDURE IF EXISTS AddColIfMissing;
DELIMITER //
CREATE PROCEDURE AddColIfMissing()
BEGIN
  IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tournaments' AND COLUMN_NAME = 'code') THEN
    ALTER TABLE tournaments
      ADD COLUMN code                VARCHAR(50)  DEFAULT NULL AFTER name,
      ADD COLUMN format              VARCHAR(50)  DEFAULT NULL AFTER bracket_type_id,
      ADD COLUMN category            VARCHAR(100) DEFAULT NULL AFTER format,
      ADD COLUMN season              VARCHAR(100) DEFAULT NULL AFTER category,
      ADD COLUMN max_teams           INT UNSIGNED DEFAULT NULL AFTER max_participants,
      ADD COLUMN registration_fee    DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER entry_fee,
      ADD COLUMN price_type          ENUM('FREE','FIXED','MEMBERS_ONLY') NOT NULL DEFAULT 'FIXED' AFTER currency_code,
      ADD COLUMN is_public           TINYINT(1) NOT NULL DEFAULT 1 AFTER status,
      ADD COLUMN archived_at         TIMESTAMP NULL DEFAULT NULL AFTER updated_at,
      ADD COLUMN registration_open_at  TIMESTAMP NULL DEFAULT NULL AFTER is_public,
      ADD COLUMN registration_close_at TIMESTAMP NULL DEFAULT NULL AFTER registration_open_at,
      ADD UNIQUE KEY uk_code (code),
      ADD KEY idx_format (format),
      ADD KEY idx_category (category),
      ADD KEY idx_is_public (is_public);
  END IF;
  IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tournament_registrations' AND COLUMN_NAME = 'waiting_order') THEN
    ALTER TABLE tournament_registrations
      ADD COLUMN waiting_order   INT UNSIGNED DEFAULT NULL AFTER seed_rank,
      ADD COLUMN team_id         INT UNSIGNED DEFAULT NULL AFTER player_id,
      ADD COLUMN cancelled_at    TIMESTAMP NULL DEFAULT NULL AFTER registered_at,
      ADD KEY idx_team (team_id),
      ADD KEY idx_waiting_order (waiting_order);
  END IF;
  IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tournament_matches' AND COLUMN_NAME = 'group_id') THEN
    ALTER TABLE tournament_matches
      ADD COLUMN group_id        INT UNSIGNED DEFAULT NULL AFTER tournament_id,
      ADD COLUMN bracket_position INT UNSIGNED DEFAULT NULL AFTER match_number,
      ADD COLUMN referee_id      INT UNSIGNED DEFAULT NULL AFTER resource_id,
      ADD COLUMN round_name      VARCHAR(100) DEFAULT NULL AFTER round,
      ADD KEY idx_group (group_id),
      ADD KEY idx_referee (referee_id),
      ADD KEY idx_bracket (bracket_position);
  END IF;
END//
DELIMITER ;
CALL AddColIfMissing();
DROP PROCEDURE IF EXISTS AddColIfMissing;

-- ── tournament_groups ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_groups (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tournament_id   INT UNSIGNED NOT NULL,
  name            VARCHAR(200) NOT NULL,
  size            INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Number of players/teams in group',
  advance_count   INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'How many advance from this group',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_tournament (tournament_id),
  CONSTRAINT fk_tgroup_tourn FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── tournament_group_members ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament_group_members (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_id        INT UNSIGNED NOT NULL,
  registration_id INT UNSIGNED NOT NULL,
  seed            INT UNSIGNED DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uk_group_reg (group_id, registration_id),
  KEY idx_registration (registration_id),
  CONSTRAINT fk_tgm_group  FOREIGN KEY (group_id)        REFERENCES tournament_groups(id)       ON DELETE CASCADE,
  CONSTRAINT fk_tgm_reg    FOREIGN KEY (registration_id) REFERENCES tournament_registrations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── tournament_match_players ──────────────────────────────────────────────
-- For team matches: links multiple players to each side of a match.
CREATE TABLE IF NOT EXISTS tournament_match_players (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  match_id        INT UNSIGNED NOT NULL,
  player_id       INT UNSIGNED NOT NULL,
  side            ENUM('home','away') NOT NULL DEFAULT 'home',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_match (match_id),
  KEY idx_player (player_id),
  CONSTRAINT fk_tmp_match  FOREIGN KEY (match_id)  REFERENCES tournament_matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_tmp_player FOREIGN KEY (player_id) REFERENCES users(id)              ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── tournament_match_results ──────────────────────────────────────────────
-- Separates scheduling (tournament_matches) from results.
-- Stores scores in a flexible JSON structure for sport-agnostic scoring.
CREATE TABLE IF NOT EXISTS tournament_match_results (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  match_id        INT UNSIGNED NOT NULL,
  winner_id       INT UNSIGNED DEFAULT NULL COMMENT 'NULL = draw',
  home_score      TEXT DEFAULT NULL COMMENT 'Flexible JSON score for home side',
  away_score      TEXT DEFAULT NULL COMMENT 'Flexible JSON score for away side',
  score_details   JSON DEFAULT NULL COMMENT 'Full score breakdown (sets, games, etc)',
  result_status   ENUM('submitted','confirmed','disputed') NOT NULL DEFAULT 'submitted',
  entered_by      INT UNSIGNED NOT NULL,
  confirmed_at    TIMESTAMP NULL DEFAULT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uk_match (match_id),
  KEY idx_winner (winner_id),
  CONSTRAINT fk_tmr_match   FOREIGN KEY (match_id)  REFERENCES tournament_matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_tmr_winner  FOREIGN KEY (winner_id) REFERENCES users(id)              ON DELETE SET NULL,
  CONSTRAINT fk_tmr_entered FOREIGN KEY (entered_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── tournament_standings ──────────────────────────────────────────────────
-- Persisted standings, recalculated after every confirmed result.
CREATE TABLE IF NOT EXISTS tournament_standings (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tournament_id     INT UNSIGNED NOT NULL,
  group_id          INT UNSIGNED DEFAULT NULL,
  registration_id   INT UNSIGNED NOT NULL,
  wins              INT UNSIGNED NOT NULL DEFAULT 0,
  losses            INT UNSIGNED NOT NULL DEFAULT 0,
  draws             INT UNSIGNED NOT NULL DEFAULT 0,
  points            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  games_won         INT UNSIGNED NOT NULL DEFAULT 0,
  games_lost        INT UNSIGNED NOT NULL DEFAULT 0,
  sets_won          INT UNSIGNED NOT NULL DEFAULT 0,
  sets_lost         INT UNSIGNED NOT NULL DEFAULT 0,
  rank_position     INT UNSIGNED DEFAULT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_tourn_reg_group (tournament_id, registration_id, group_id),
  KEY idx_group (group_id),
  KEY idx_rank (tournament_id, rank_position),
  CONSTRAINT fk_ts_tourn FOREIGN KEY (tournament_id)   REFERENCES tournaments(id)            ON DELETE CASCADE,
  CONSTRAINT fk_ts_group FOREIGN KEY (group_id)         REFERENCES tournament_groups(id)      ON DELETE CASCADE,
  CONSTRAINT fk_ts_reg   FOREIGN KEY (registration_id)  REFERENCES tournament_registrations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
