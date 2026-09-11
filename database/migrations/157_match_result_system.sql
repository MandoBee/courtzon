-- ============================================================================
-- COURTZON V3 : MATCH RESULT SYSTEM
-- Sport / Format / Rule engine + Match Result records + Rating evidence.
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- (Machine-readable classification for backend/scripts/migration-guard.sh —
--  this migration is eligible in every environment.)
--
-- Scope: public matches only. Academy compatibility is preserved by keeping
-- rating evidence generic (source + reference id) and match result records
-- type-scoped (match_type ENUM future-proofed for tournament/league).
--
-- Design notes (AGENTS.md Database Relationship & Historical Data Policy):
--   * match_result_records.match_id -> matches RESTRICT : result + history
--     must survive a match cancellation attempt. Results are never deleted.
--   * rating_evidence.user_id -> users CASCADE : rating evidence belongs to
--     the player's profile and must be cleaned up with the user.
--   * player_ratings / player_rating_history -> users CASCADE.
--   * match_result_participants.result_id -> match_result_records CASCADE:
--     participant rows are part of the result aggregate.
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- Sport formats (configurable by CourtZon Admin). One sport may expose many
-- formats/variants (Part A.5).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `sport_formats`;
CREATE TABLE `sport_formats` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `sport_id` int unsigned NOT NULL,
  `slug` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `format_type` enum('singles','doubles','team') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'singles',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sport_slug` (`sport_id`,`slug`),
  KEY `idx_sf_active` (`is_active`),
  CONSTRAINT `fk_sf_sport` FOREIGN KEY (`sport_id`) REFERENCES `sports` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sf_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Versioned rule sets per format (Part A.2, A.3, A.4). Historical results
-- carry their own rules_snapshot, so later rule changes never reinterpret
-- past matches (Part H.124).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `sport_rule_sets`;
CREATE TABLE `sport_rule_sets` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `format_id` bigint unsigned NOT NULL,
  `version` int unsigned NOT NULL DEFAULT '1',
  `name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rules` json NOT NULL COMMENT 'Scoring structure, winner determination, tie-break rules, terminations',
  `standings_rules` json DEFAULT NULL COMMENT 'Standings/tie-break criteria (per Sport + Format, Part A.8)',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `created_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_format_version` (`format_id`,`version`),
  KEY `idx_srs_active` (`is_active`),
  CONSTRAINT `fk_srs_format` FOREIGN KEY (`format_id`) REFERENCES `sport_formats` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_srs_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Match result record — the authoritative result aggregate (Part E.120).
-- One active record per match (UNIQUE match_id). Withdrawn/replaced attempts
-- are not persisted as separate historical rows (Part E.112) — only the single
-- active row is reused until approval locks it.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `match_result_records`;
CREATE TABLE `match_result_records` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `match_id` bigint unsigned NOT NULL,
  `sport_id` int unsigned NOT NULL,
  `format_id` bigint unsigned NOT NULL,
  `rule_set_id` bigint unsigned NOT NULL,
  `rules_snapshot` json NOT NULL COMMENT 'Historical Rules Snapshot (mandatory, Part E.121)',
  `match_type` enum('public','tournament','league') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'public',
  `played_at` datetime NOT NULL COMMENT 'Actual match occurrence/end time — starts the 3-day submission window (Part E.100-103)',
  `branch_id` int unsigned DEFAULT NULL,
  `resource_id` int unsigned DEFAULT NULL,
  `tournament_id` bigint unsigned DEFAULT NULL,
  `academy_id` bigint unsigned DEFAULT NULL,
  `timezone` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `participant_payload` json NOT NULL COMMENT 'Ordered participants/teams snapshot at match time',
  `raw_result` json NOT NULL COMMENT 'Full raw result details per Sport+Format+Rules Version (Part E.92, E.123)',
  `final_result` json DEFAULT NULL COMMENT 'Calculated final result (winner/draw, per-side outcomes, summary)',
  `outcome` enum('completed','retired','walkover','forfeit','abandoned','no_result','disputed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'completed',
  `submission_status` enum('pending_confirmation','approved','disputed','withdrawn','no_result') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending_confirmation',
  `submitted_by` int unsigned DEFAULT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `accepted_by` int unsigned DEFAULT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `auto_approved` tinyint(1) NOT NULL DEFAULT '0',
  `disputed_by` int unsigned DEFAULT NULL,
  `disputed_at` datetime DEFAULT NULL,
  `dispute_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resolved_by` int unsigned DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `resolution_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `submission_deadline_at` datetime DEFAULT NULL COMMENT 'played_at + 3 days (Part E.100)',
  `auto_approval_deadline_at` datetime DEFAULT NULL COMMENT 'submitted_at + 3 days (Part E.107)',
  `evidence_counted` tinyint(1) NOT NULL DEFAULT '0',
  `rating_applied_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_match` (`match_id`),
  KEY `idx_status_deadline` (`submission_status`,`auto_approval_deadline_at`),
  KEY `idx_outcome` (`outcome`),
  KEY `idx_played` (`played_at`),
  KEY `idx_branch` (`branch_id`),
  CONSTRAINT `fk_mrr_match` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_mrr_sport` FOREIGN KEY (`sport_id`) REFERENCES `sports` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_mrr_format` FOREIGN KEY (`format_id`) REFERENCES `sport_formats` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_mrr_rule` FOREIGN KEY (`rule_set_id`) REFERENCES `sport_rule_sets` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_mrr_sub` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mrr_acc` FOREIGN KEY (`accepted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mrr_disp` FOREIGN KEY (`disputed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mrr_res` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mrr_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mrr_resource` FOREIGN KEY (`resource_id`) REFERENCES `resources` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Per-participant outcome / evidence / rating snapshot (Part E.120 Rating).
-- Doubles/team members on the same team share the same Match Evidence value
-- (Part E.118). Historical Rating Snapshot mandatory (Part E.122).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `match_result_participants`;
CREATE TABLE `match_result_participants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `result_id` bigint unsigned NOT NULL,
  `match_id` bigint unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `team_index` int NOT NULL DEFAULT '0',
  `side` enum('home','away') COLLATE utf8mb4_unicode_ci NOT NULL,
  `outcome` enum('win','draw','loss') COLLATE utf8mb4_unicode_ci NOT NULL,
  `match_evidence` decimal(5,2) DEFAULT NULL COMMENT 'Win=100, Draw=50, Loss=0 (Part E.114)',
  `evidence_counted` tinyint(1) NOT NULL DEFAULT '0',
  `rating_snapshot_percent` decimal(5,2) DEFAULT NULL COMMENT 'Historical Rating Snapshot at match time (Part E.122)',
  `rating_before` decimal(5,2) DEFAULT NULL,
  `rating_after` decimal(5,2) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_result_user` (`result_id`,`user_id`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_mrp_result` FOREIGN KEY (`result_id`) REFERENCES `match_result_records` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mrp_match` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_mrp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Rating evidence (Part B). Generic across evidence types so future Academy
-- (coach evaluation) and Tournament evidence integrate without schema change.
-- Evidence never completely disappears — weight decays toward zero (Part B.28).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `rating_evidence`;
CREATE TABLE `rating_evidence` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `sport_id` int unsigned NOT NULL,
  `evidence_type` enum('self_declared','coach_evaluation','match_evidence','tournament_evidence') COLLATE utf8mb4_unicode_ci NOT NULL,
  `value_percent` decimal(5,2) NOT NULL COMMENT '0..100',
  `source` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'match_result | tournament_phase | self_declared | coach_evaluation',
  `source_ref_id` bigint unsigned DEFAULT NULL,
  `occurred_at` datetime NOT NULL COMMENT 'Decay anchor (Part B.26 half-life = 3 months)',
  `meta` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_source_ref` (`source`,`source_ref_id`,`user_id`),
  KEY `idx_user_sport` (`user_id`,`sport_id`),
  KEY `idx_sport` (`sport_id`),
  CONSTRAINT `fk_re_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_re_sport` FOREIGN KEY (`sport_id`) REFERENCES `sports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Current Overall Rating (Part B). Bounded 20%..100%. Dynamically recomputed
-- whenever trusted evidence arrives (Part B.18-19).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `player_ratings`;
CREATE TABLE `player_ratings` (
  `user_id` int unsigned NOT NULL,
  `sport_id` int unsigned NOT NULL,
  `overall_percent` decimal(5,2) NOT NULL DEFAULT '60.00',
  `matches_count` int unsigned NOT NULL DEFAULT '0',
  `match_wins` int unsigned NOT NULL DEFAULT '0',
  `match_draws` int unsigned NOT NULL DEFAULT '0',
  `match_losses` int unsigned NOT NULL DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`sport_id`),
  KEY `idx_sport_rating` (`sport_id`,`overall_percent` DESC),
  CONSTRAINT `fk_pr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pr_sport` FOREIGN KEY (`sport_id`) REFERENCES `sports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Rating recalculation history (Part E.96 / H) — the timeline used to keep
-- old/new rating on approved corrections without deleting evidence.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `player_rating_history`;
CREATE TABLE `player_rating_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `sport_id` int unsigned NOT NULL,
  `rating_before` decimal(5,2) DEFAULT NULL,
  `rating_after` decimal(5,2) NOT NULL,
  `changed_by` int unsigned DEFAULT NULL,
  `source_ref` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'match_result:<id>',
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`,`sport_id`),
  KEY `idx_changed_by` (`changed_by`),
  CONSTRAINT `fk_prh_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_prh_sport` FOREIGN KEY (`sport_id`) REFERENCES `sports` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_prh_actor` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Default Sport Formats + Rule Sets (Part A — DEFAULT SPORT RULES).
-- Seeded for the built-in active sports (Padel 22, Tennis 21, Football 19).
-- Rule changes are versioned — new matches pick the active/latest version and
-- old results keep their rules_snapshot.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO `sport_formats`
  (`id`, `sport_id`, `slug`, `name`, `format_type`, `description`, `is_default`, `is_active`)
VALUES
  (1, 22, 'standard', 'Padel Standard', 'doubles',
   'Best of 3 sets, set first to 6 games by one-game margin, tiebreak at 6-6, golden point at deuce.',
   1, 1),
  (2, 21, 'standard', 'Tennis Standard', 'singles',
   'Best of 3 sets, set first to 6 games by 2, tiebreak at 6-6 first to 7 by 2.',
   1, 1),
  (3, 19, 'standard', 'Football 11v11', 'team',
   '90 minutes (45+45), goals, draw allowed; tournaments may enable extra time and penalty shootout.',
   1, 1);

INSERT IGNORE INTO `sport_rule_sets`
  (`id`, `format_id`, `version`, `name`, `rules`, `standings_rules`, `is_active`, `is_default`)
VALUES
  (1, 1, 1, 'Padel Standard v1',
   JSON_OBJECT(
     'score_structure', 'sets', 'best_of', 3, 'sets_to_win', 2,
     'first_to', 6, 'margin', 1, 'tiebreak_at', 6, 'tiebreak_first_to', 7,
     'tiebreak_win_by', 2, 'deuce_rule', 'golden_point', 'draw_allowed', false,
     'terminations', JSON_ARRAY('retired', 'walkover', 'forfeit', 'abandoned')
   ),
   JSON_OBJECT(
     'points', JSON_OBJECT('win', 3, 'draw', 1, 'loss', 0),
     'tiebreakers', JSON_ARRAY(
       JSON_OBJECT('field', 'points', 'direction', 'desc'),
       JSON_OBJECT('field', 'games_difference', 'direction', 'desc'),
       JSON_OBJECT('field', 'games_won', 'direction', 'desc')
     )
   ),
   1, 1),
  (2, 2, 1, 'Tennis Standard v1',
   JSON_OBJECT(
     'score_structure', 'sets', 'best_of', 3, 'sets_to_win', 2,
     'first_to', 6, 'margin', 2, 'tiebreak_at', 6, 'tiebreak_first_to', 7,
     'tiebreak_win_by', 2, 'deuce_rule', 'standard', 'draw_allowed', false,
     'terminations', JSON_ARRAY('retired', 'walkover', 'forfeit', 'abandoned')
   ),
   JSON_OBJECT(
     'points', JSON_OBJECT('win', 3, 'draw', 1, 'loss', 0),
     'tiebreakers', JSON_ARRAY(
       JSON_OBJECT('field', 'points', 'direction', 'desc'),
       JSON_OBJECT('field', 'sets_difference', 'direction', 'desc'),
       JSON_OBJECT('field', 'games_difference', 'direction', 'desc'),
       JSON_OBJECT('field', 'head_to_head', 'direction', 'desc')
     )
   ),
   1, 1),
  (3, 3, 1, 'Football 11v11 v1',
   JSON_OBJECT(
     'score_structure', 'goals', 'match_duration_minutes', 90, 'halves', JSON_ARRAY(45, 45),
     'extra_time', false, 'penalty_shootout', false, 'draw_allowed', true,
     'terminations', JSON_ARRAY('retired', 'walkover', 'forfeit', 'abandoned')
   ),
   JSON_OBJECT(
     'points', JSON_OBJECT('win', 3, 'draw', 1, 'loss', 0),
     'tiebreakers', JSON_ARRAY(
       JSON_OBJECT('field', 'points', 'direction', 'desc'),
       JSON_OBJECT('field', 'goal_difference', 'direction', 'desc'),
       JSON_OBJECT('field', 'goals_for', 'direction', 'desc'),
       JSON_OBJECT('field', 'head_to_head', 'direction', 'desc')
     )
   ),
   1, 1);