-- ============================================================================
-- Sprint 8 — League, Season & Ranking Foundation
-- ============================================================================
-- This migration is additive. It creates new tables for seasons, leagues,
-- divisions, team registrations, matches, results, standings, and statistics.
-- No existing tables are modified.
-- ============================================================================

-- ── seasons ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seasons (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(50)  NOT NULL,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  sport_id        INT UNSIGNED DEFAULT NULL,
  start_date      DATE         NOT NULL,
  end_date        DATE         DEFAULT NULL,
  status          ENUM('draft','published','running','completed','archived') NOT NULL DEFAULT 'draft',
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_code (code),
  KEY idx_status (status),
  KEY idx_sport (sport_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── leagues ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leagues (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  season_id         INT UNSIGNED NOT NULL,
  code              VARCHAR(50)  NOT NULL,
  name              VARCHAR(200) NOT NULL,
  description       TEXT,
  sport_id          INT UNSIGNED DEFAULT NULL,
  format            ENUM('round_robin','double_round_robin') NOT NULL DEFAULT 'round_robin',
  max_teams         INT UNSIGNED NOT NULL DEFAULT 0,
  registration_fee  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  price_type        ENUM('FREE','FIXED','MEMBERS_ONLY') NOT NULL DEFAULT 'FIXED',
  currency          CHAR(3)      NOT NULL DEFAULT 'USD',
  status            ENUM('draft','registration_open','registration_closed','running','completed','cancelled','archived') NOT NULL DEFAULT 'draft',
  is_public         TINYINT(1)   NOT NULL DEFAULT 1,
  points_per_win    TINYINT UNSIGNED NOT NULL DEFAULT 3,
  points_per_draw   TINYINT UNSIGNED NOT NULL DEFAULT 1,
  archived_at       TIMESTAMP    NULL DEFAULT NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_code (code),
  KEY idx_season (season_id),
  KEY idx_status (status),
  KEY idx_sport (sport_id),
  CONSTRAINT fk_league_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── league_divisions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS league_divisions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  league_id         INT UNSIGNED NOT NULL,
  name              VARCHAR(200) NOT NULL,
  tier              INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '1=top,2=second,etc',
  capacity          INT UNSIGNED NOT NULL DEFAULT 0,
  advance_count     INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Promotion spots to next tier',
  relegation_count  INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Relegation spots to lower tier',
  status            ENUM('active','inactive','archived') NOT NULL DEFAULT 'active',
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_league (league_id),
  CONSTRAINT fk_div_league FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── league_teams ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS league_teams (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  division_id       INT UNSIGNED NOT NULL,
  team_name         VARCHAR(200) NOT NULL,
  captain_id        INT UNSIGNED DEFAULT NULL,
  player_ids        JSON         DEFAULT NULL COMMENT 'Roster of player user IDs',
  status            ENUM('pending','confirmed','waiting','cancelled','withdrawn') NOT NULL DEFAULT 'pending',
  waiting_order     INT UNSIGNED DEFAULT NULL,
  seed              INT UNSIGNED DEFAULT NULL,
  registered_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uk_div_team (division_id, team_name),
  KEY idx_status (status),
  KEY idx_captain (captain_id),
  CONSTRAINT fk_team_div FOREIGN KEY (division_id) REFERENCES league_divisions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── league_matches ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS league_matches (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  division_id       INT UNSIGNED NOT NULL,
  home_team_id      INT UNSIGNED NOT NULL,
  away_team_id      INT UNSIGNED NOT NULL,
  round             INT UNSIGNED NOT NULL,
  match_date        DATE         DEFAULT NULL,
  start_time        TIME         DEFAULT NULL,
  end_time          TIME         DEFAULT NULL,
  court_id          INT UNSIGNED DEFAULT NULL,
  referee_id        INT UNSIGNED DEFAULT NULL,
  status            ENUM('scheduled','in_progress','completed','cancelled','walkover') NOT NULL DEFAULT 'scheduled',
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY idx_division (division_id),
  KEY idx_round (round),
  KEY idx_status (status),
  KEY idx_date (match_date),
  KEY idx_court (court_id),
  KEY idx_referee (referee_id),
  CONSTRAINT fk_lm_div       FOREIGN KEY (division_id)   REFERENCES league_divisions(id) ON DELETE CASCADE,
  CONSTRAINT fk_lm_home      FOREIGN KEY (home_team_id)  REFERENCES league_teams(id)     ON DELETE CASCADE,
  CONSTRAINT fk_lm_away      FOREIGN KEY (away_team_id)  REFERENCES league_teams(id)     ON DELETE CASCADE,
  CONSTRAINT fk_lm_court     FOREIGN KEY (court_id)      REFERENCES resources(id)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── league_results ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS league_results (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  match_id          INT UNSIGNED NOT NULL,
  home_score        TEXT         DEFAULT NULL COMMENT 'Flexible JSON score for home team',
  away_score        TEXT         DEFAULT NULL COMMENT 'Flexible JSON score for away team',
  winner_team_id    INT UNSIGNED DEFAULT NULL COMMENT 'NULL = draw',
  result_status     ENUM('submitted','confirmed','disputed') NOT NULL DEFAULT 'submitted',
  entered_by        INT UNSIGNED NOT NULL,
  confirmed_at      TIMESTAMP    NULL DEFAULT NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uk_match (match_id),
  KEY idx_winner (winner_team_id),
  CONSTRAINT fk_lr_match  FOREIGN KEY (match_id)       REFERENCES league_matches(id) ON DELETE CASCADE,
  CONSTRAINT fk_lr_winner FOREIGN KEY (winner_team_id) REFERENCES league_teams(id)   ON DELETE SET NULL,
  CONSTRAINT fk_lr_entered FOREIGN KEY (entered_by)    REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── league_standings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS league_standings (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  division_id       INT UNSIGNED NOT NULL,
  team_id           INT UNSIGNED NOT NULL,
  played            INT UNSIGNED NOT NULL DEFAULT 0,
  wins              INT UNSIGNED NOT NULL DEFAULT 0,
  draws             INT UNSIGNED NOT NULL DEFAULT 0,
  losses            INT UNSIGNED NOT NULL DEFAULT 0,
  goals_for         INT UNSIGNED NOT NULL DEFAULT 0,
  goals_against     INT UNSIGNED NOT NULL DEFAULT 0,
  goal_difference   INT          NOT NULL DEFAULT 0,
  points            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  position          INT UNSIGNED DEFAULT NULL,
  form              JSON         DEFAULT NULL COMMENT 'Last 5 results (W/D/L)',
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_div_team (division_id, team_id),
  KEY idx_position (division_id, position),
  CONSTRAINT fk_ls_div  FOREIGN KEY (division_id) REFERENCES league_divisions(id) ON DELETE CASCADE,
  CONSTRAINT fk_ls_team FOREIGN KEY (team_id)     REFERENCES league_teams(id)     ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── player_statistics ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_statistics (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  season_id         INT UNSIGNED NOT NULL,
  player_id         INT UNSIGNED NOT NULL,
  team_id           INT UNSIGNED DEFAULT NULL,
  division_id       INT UNSIGNED DEFAULT NULL,
  appearances       INT UNSIGNED NOT NULL DEFAULT 0,
  goals             INT UNSIGNED NOT NULL DEFAULT 0,
  assists           INT UNSIGNED NOT NULL DEFAULT 0,
  clean_sheets      INT UNSIGNED NOT NULL DEFAULT 0,
  yellow_cards      INT UNSIGNED NOT NULL DEFAULT 0,
  red_cards         INT UNSIGNED NOT NULL DEFAULT 0,
  minutes_played    INT UNSIGNED NOT NULL DEFAULT 0,
  rating            DECIMAL(4,2) DEFAULT NULL,
  stats_json        JSON         DEFAULT NULL COMMENT 'Extensible sport-specific stats',
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_season_player (season_id, player_id, team_id),
  KEY idx_player (player_id),
  KEY idx_team (team_id),
  KEY idx_division (division_id),
  CONSTRAINT fk_ps_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── team_statistics ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_statistics (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  season_id         INT UNSIGNED NOT NULL,
  team_id           INT UNSIGNED NOT NULL,
  division_id       INT UNSIGNED DEFAULT NULL,
  played            INT UNSIGNED NOT NULL DEFAULT 0,
  wins              INT UNSIGNED NOT NULL DEFAULT 0,
  draws             INT UNSIGNED NOT NULL DEFAULT 0,
  losses            INT UNSIGNED NOT NULL DEFAULT 0,
  goals_for         INT UNSIGNED NOT NULL DEFAULT 0,
  goals_against     INT UNSIGNED NOT NULL DEFAULT 0,
  clean_sheets      INT UNSIGNED NOT NULL DEFAULT 0,
  home_record       JSON         DEFAULT NULL COMMENT '{wins,draws,losses,gf,ga}',
  away_record       JSON         DEFAULT NULL COMMENT '{wins,draws,losses,gf,ga}',
  stats_json        JSON         DEFAULT NULL COMMENT 'Extensible sport-specific stats',
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_season_team (season_id, team_id),
  KEY idx_division (division_id),
  CONSTRAINT fk_ts_season FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
  CONSTRAINT fk_ts_team   FOREIGN KEY (team_id)   REFERENCES league_teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
