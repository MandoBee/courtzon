-- ============================================================================
-- COURTZON V3 : TOURNAMENT PARTICIPANT & SEEDING FOUNDATION (Group 5)
--
-- Approved G5 continuation: establish the authoritative participant, seed and
-- draw-state foundation WITHOUT redesigning the existing user-id-based match
-- model. Existing tournament_registrations / tournament_matches / standings /
-- results remain untouched and readable.
--
-- Concepts introduced (separated, never conflated):
--   GLOBAL RATING   -> lives in the match-result rating module (player_ratings
--                      overall_percent). NEVER mutated from tournament seeding.
--   TOURNAMENT SEED -> tournament_scoped authoritative seed, source rating|manual.
--                      Preserved across Auto Re-Draws; never recalculated by a draw.
--   DRAW POSITION   -> where the participant is placed in a specific draw attempt;
--                      may change on re-draw / manual adjustment without touching seed.
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- Design notes:
--   * tournament_participants is the single authoritative participant identity
--     (individual today; pair/team allowed by the participant_type enum and the
--     member_user_ids JSON roster — future groups add members/replacement without
--     redesigning the draw).
--   * tournament_seeds: UNIQUE(tournament_id, seed_number) enforces one seed per
--     number; UNIQUE(participant_id) enforces one authoritative seed per
--     participant (a change is an audited UPDATE, never a silent duplicate).
--     rating_snapshot freezes the value when source=rating (historical stability).
--   * tournament_draws + tournament_draw_entries: one row per generation attempt
--     (auditable history). Multiple Auto Re-Draws append attempts; seeds are never
--     rewritten. UNIQUE(draw_id, participant_id) + UNIQUE(draw_id, position).
--   * CASCADE: participants/seeds/draws are logical children of the tournament;
--     draw entries are children of the draw; seeds children of participants.
--     assigned_by/moved_by/generated_by are loose SET NULL references (audit-only).
--   * Additive ONLY. No rewrite of historical tournament data.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `tournament_participants` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL,
  `registration_id` int unsigned DEFAULT NULL COMMENT 'Individual participants map 1:1 to a registration; NULL for future pair/team sources',
  `participant_type` enum('individual','pair','team') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'individual',
  `status` enum('active','withdrawn','waiting') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `member_user_ids` json DEFAULT NULL COMMENT 'Member roster (individual = [user_id]); future pairs/teams hold multiple',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_participant_registration` (`tournament_id`,`registration_id`),
  KEY `idx_participant_tournament` (`tournament_id`),
  CONSTRAINT `fk_part_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_part_registration` FOREIGN KEY (`registration_id`) REFERENCES `tournament_registrations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `tournament_participants_chk_1` CHECK (json_valid(`member_user_ids`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tournament_seeds` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL,
  `participant_id` int unsigned NOT NULL,
  `seed_number` int unsigned NOT NULL,
  `source` enum('rating','manual') COLLATE utf8mb4_unicode_ci NOT NULL,
  `assigned_by` int unsigned DEFAULT NULL COMMENT 'Admin who assigned the seed (required for manual)',
  `assigned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `rating_snapshot` decimal(10,4) DEFAULT NULL COMMENT 'Frozen overall percent when source=rating; NULL for manual',
  `rating_matches_played` int unsigned DEFAULT NULL COMMENT 'Frozen matches_count when source=rating',
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_seed_tournament_number` (`tournament_id`,`seed_number`),
  UNIQUE KEY `uk_seed_participant` (`participant_id`),
  KEY `idx_seed_tournament` (`tournament_id`),
  CONSTRAINT `fk_seed_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_seed_participant` FOREIGN KEY (`participant_id`) REFERENCES `tournament_participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_seed_assigner` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tournament_draws` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL,
  `attempt_number` int unsigned NOT NULL COMMENT '1-based generation attempt; re-draws append',
  `draw_seed` bigint unsigned NOT NULL COMMENT 'Randomization seed used for THIS attempt (deterministic re-gen)',
  `generated_by` int unsigned DEFAULT NULL,
  `generated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` enum('draft','approved','locked') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `validation_status` enum('valid','seeding_violation','manually_modified') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'valid',
  `is_current` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_draw_attempt` (`tournament_id`,`attempt_number`),
  KEY `idx_draw_tournament` (`tournament_id`),
  CONSTRAINT `fk_draw_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_draw_generator` FOREIGN KEY (`generated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tournament_draw_entries` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `draw_id` int unsigned NOT NULL,
  `participant_id` int unsigned NOT NULL,
  `position` int unsigned NOT NULL COMMENT '0-based bracket/draw position within this attempt',
  `placement_source` enum('auto','manual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'auto',
  `overridden` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Explicit admin override of a seeding-rule violation (seed unchanged)',
  `moved_by` int unsigned DEFAULT NULL,
  `moved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_draw_participant` (`draw_id`,`participant_id`),
  UNIQUE KEY `uk_draw_position` (`draw_id`,`position`),
  KEY `idx_drawentry_draw` (`draw_id`),
  CONSTRAINT `fk_drawentry_draw` FOREIGN KEY (`draw_id`) REFERENCES `tournament_draws` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_drawentry_participant` FOREIGN KEY (`participant_id`) REFERENCES `tournament_participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_drawentry_mover` FOREIGN KEY (`moved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;