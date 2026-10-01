-- ============================================================================
-- COURTZON V3 : TOURNAMENT OUTCOME INTEGRITY (G11.14)
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- PURPOSE
--   Additive, zero-rewrite schema change that makes knockout tournament
--   placements DERIVABLE from persisted match data (fail-closed) and keeps the
--   real database in sync with the domain model:
--
--     1. Extend `tournament_participants.status` with 'disqualified'. The
--        participant-draw service legitimately writes it
--        (`ParticipantDrawService.disqualifyParticipant`); previously the ENUM
--        truncated the write to an empty string in STRICT mode and the operand
--        aborted before audit/event/reminder-removal.
--
--     2. Extend `tournament_matches.status` with 'forfeit' and 'no_show'. Both
--        values are declared by the domain `MatchStatus` type and referenced by
--        completion/eligibility checks; the DB ENUM previously rejected them.
--
--     3. Add bracket-outcome columns to `tournament_matches`:
--          winner_participant_id  — authoritative winning tournament_participants id
--                                   (written together with `winner_id` going forward)
--          loser_participant_id   — the ACTUAL losing participant when a match has a
--                                   determinable loser (never invented for a
--                                   bye/placeholder/withdrawn-slot resolution)
--          final_position         — terminal slot outcome: 1 = champion,
--                                  2 = runner-up (NULL for non-final slots)
--          bracket_depth          — distance from the terminal slot (0 = final),
--                                  populated from the actual bracket graph
--          is_final               — 1 when this slot is the unique terminal slot
--
--     4. Create `tournament_placements` — the authoritative knockout placement
--        table resolved WITHOUT operator assertion. UNIQUE(tournament_id,
--        placement) guarantees at most one participant per placement.
--
-- SAFETY
--   * Additive only: no column dropped, no ENUM value removed, no data
--     rewritten, no existing index/constraint altered.
--   * Verified read-only on 2026-10-01 (both environments):
--       - local Docker (127.0.0.1:3307)  — tournament_matches: 0 rows,
--         tournament_participants: 2 rows, all status='active'
--       - Hostinger production (187.127.72.93:3307) — tournament_matches: 0 rows,
--         tournament_participants: 2 rows, all status='active'
--     so the ENUM extensions cannot alter any stored value.
--   * Legacy columns (`winner_id`, `player1/2_id`, `participant1/2_id`) are
--     preserved unchanged for backward compatibility.
-- ============================================================================

-- 1. Extended status enums (additive — every existing value is retained).
ALTER TABLE `tournament_participants`
  MODIFY COLUMN `status` enum('active','withdrawn','waiting','withdrawn_after_start','disqualified')
  COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active';

ALTER TABLE `tournament_matches`
  MODIFY COLUMN `status` enum('scheduled','in_progress','completed','walkover','cancelled','forfeit','no_show')
  COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'scheduled';

-- 2. Bracket-outcome columns on tournament_matches (additive).
ALTER TABLE `tournament_matches`
  ADD COLUMN `winner_participant_id` int unsigned DEFAULT NULL
    COMMENT 'Authoritative winning tournament_participants id (written together with winner_id going forward)',
  ADD COLUMN `loser_participant_id` int unsigned DEFAULT NULL
    COMMENT 'Actual losing tournament_participants id when a match has a determinable loser (never a bye/placeholder/withdrawn resolution)',
  ADD COLUMN `final_position` tinyint unsigned DEFAULT NULL
    COMMENT 'Terminal slot outcome: 1 = champion, 2 = runner-up (NULL for non-final slots)',
  ADD COLUMN `bracket_depth` int unsigned DEFAULT NULL
    COMMENT 'Round distance from the terminal slot: 0 = final, 1 = penultimate round... (from the bracket graph)',
  ADD COLUMN `is_final` tinyint(1) NOT NULL DEFAULT 0
    COMMENT '1 when this bracket slot is the unique terminal (final) slot';

ALTER TABLE `tournament_matches`
  ADD KEY `idx_tm_winner_participant` (`winner_participant_id`),
  ADD KEY `idx_tm_loser_participant` (`loser_participant_id`),
  ADD KEY `idx_tm_is_final` (`tournament_id`,`is_final`,`progression_state`),
  ADD CONSTRAINT `fk_tm_winner_participant` FOREIGN KEY (`winner_participant_id`) REFERENCES `tournament_participants` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_tm_loser_participant` FOREIGN KEY (`loser_participant_id`) REFERENCES `tournament_participants` (`id`) ON DELETE SET NULL;

-- 3. tournament_placements — authoritative knockout placements (G11.14/15).
CREATE TABLE IF NOT EXISTS `tournament_placements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL,
  `placement` int unsigned NOT NULL COMMENT '1 = champion, 2 = runner-up, 3 = third (only when uniquely derivable)',
  `participant_id` int unsigned DEFAULT NULL COMMENT 'Authoritative placed tournament participant',
  `user_id` int unsigned DEFAULT NULL COMMENT 'Primary-member user id mirror of the placed participant',
  `source` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'bracket' COMMENT 'Resolution source: bracket = knock-out graph',
  `resolved_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tp_tournament_placement` (`tournament_id`,`placement`),
  KEY `idx_tp_tournament` (`tournament_id`),
  KEY `idx_tp_participant` (`participant_id`),
  KEY `idx_tp_user` (`user_id`),
  CONSTRAINT `fk_tp_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tp_participant` FOREIGN KEY (`participant_id`) REFERENCES `tournament_participants` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;