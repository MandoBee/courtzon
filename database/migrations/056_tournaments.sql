-- Tournament & League Management Platform

CREATE TABLE IF NOT EXISTS `tournaments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `format` enum('knockout','double_elimination','round_robin','swiss','group_stage_knockout','league','custom') NOT NULL,
  `sport_id` int unsigned NOT NULL,
  `organisation_id` int unsigned DEFAULT NULL,
  `branch_id` int unsigned DEFAULT NULL,
  `start_date` datetime NOT NULL,
  `end_date` datetime NOT NULL,
  `registration_deadline` datetime NOT NULL,
  `max_participants` int NOT NULL,
  `current_participants` int NOT NULL DEFAULT 0,
  `registration_type` enum('individual','team','academy','invitation','public') NOT NULL DEFAULT 'public',
  `status` enum('draft','open','in_progress','completed','cancelled') NOT NULL DEFAULT 'draft',
  `match_duration_minutes` int NOT NULL DEFAULT 60,
  `description` text,
  `rules` text,
  `prize_description` text,
  `aggregate_version` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tournament_status` (`status`),
  KEY `idx_tournament_sport` (`sport_id`),
  KEY `idx_tournament_date` (`start_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `tournament_participants` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL,
  `user_id` int unsigned DEFAULT NULL,
  `team_name` varchar(255) DEFAULT NULL,
  `seed` int NOT NULL DEFAULT 0,
  `status` enum('registered','approved','rejected','checked_in') NOT NULL DEFAULT 'registered',
  `registered_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tp_tournament` (`tournament_id`),
  KEY `idx_tp_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `tournament_matches` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL,
  `round` int NOT NULL,
  `group_id` int DEFAULT NULL,
  `bracket_position` int DEFAULT NULL,
  `player1_id` int unsigned DEFAULT NULL,
  `player2_id` int unsigned DEFAULT NULL,
  `winner_id` int unsigned DEFAULT NULL,
  `score` varchar(50) DEFAULT NULL,
  `status` enum('scheduled','in_progress','completed','walkover','forfeit','no_show') NOT NULL DEFAULT 'scheduled',
  `court_id` int unsigned DEFAULT NULL,
  `referee_id` int unsigned DEFAULT NULL,
  `scheduled_at` datetime DEFAULT NULL,
  `started_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `aggregate_version` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tm_tournament` (`tournament_id`),
  KEY `idx_tm_round` (`tournament_id`, `round`),
  KEY `idx_tm_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `elo_ratings` (
  `user_id` int unsigned NOT NULL,
  `sport_id` int unsigned NOT NULL,
  `rating` int NOT NULL DEFAULT 1200,
  `matches_played` int NOT NULL DEFAULT 0,
  `k_factor` int NOT NULL DEFAULT 32,
  `last_match_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `sport_id`),
  KEY `idx_elo_rating` (`sport_id`, `rating` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
