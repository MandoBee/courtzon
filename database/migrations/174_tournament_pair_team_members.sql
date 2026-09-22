-- ============================================================================
-- COURTZON V3 : TOURNAMENT PAIR / TEAM MEMBERS + REPLACEMENT REQUESTS (G7)
--
-- Group 7 — Doubles / Team management foundation on the G5 participant model.
--
-- The G5 participant is already the entity placed in the Draw (individual today;
-- pair/team allowed by participant_type + member_user_ids). This migration makes
-- membership a NORMALIZED, QUERYABLE + DB-ENFORCED relationship and adds the
-- durable player-replacement-request workflow.
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- Design notes:
--   * tournament_participants gains `name` (the pair/team display name; existing
--     individual participants keep the derived user-name display).
--   * tournament_participant_members is the AUTHORITATIVE membership relation:
--       - FK participant_id -> tournament_participants (CASCADE),
--       - FK user_id -> users (RESTRICT — never destroys a user),
--       - member_order (role/order within the participant),
--       - status active|left|replaced, joined_at, left_at, replaced_by_member_id.
--       - UNIQUE(participant_id, user_id) — one row per member per participant.
--       - active_tournament_id (app-managed = tournament_id while status
--         'active', NULL otherwise) with UNIQUE(user_id, active_tournament_id):
--         a player can NEVER be an ACTIVE member of two participants in the SAME
--         tournament at the DB level (historical left/replaced rows keep NULL and
--         are exempt). The service always sets it together with status, so the
--         invariant is DB-enforced AND domain-enforced. (A STORED generated
--         column was rejected by MySQL 8.0 — a generated column derived from the
--         FK column cannot be combined with the FK constraint.)
--     The G5 member_user_ids JSON remains as a compatible CACHE representation
--     (kept in sync by the service) so the existing draw/seeding SQL that reads
--     $[0] keeps working — it is NOT the authoritative relationship anymore.
--   * tournament_replacement_requests is the durable request history (never a
--     silent member-row UPDATE): tournament, participant, outgoing member,
--     proposed replacement, requested_by/at, reviewed_by/at, status
--     pending|approved|rejected|cancelled, reason, rejection_reason, and a
--     JSON draw-impact snapshot. Generated open_flag = IF(status='pending','P',
--     NULL) with UNIQUE(participant_id, open_flag): one open request per
--     participant (no concurrent duplicate approvals).
--   * sport_formats gains roster_size (NULL = players_per_side): for TEAM
--     formats the roster may exceed the active side size (football 11v11 squad,
--     substitution teams). Doubles stays players_per_side (2). This is the
--     minimum configuration distinguishing active side size from roster size —
--     existing rows keep NULL semantics (roster == players_per_side).
--   * Backfill: every existing individual participant gets its member row so
--     the members table is authoritative for ALL participants immediately.
--   * Additive only. No rewrite of historical match/result/registration data.
-- ============================================================================

ALTER TABLE `tournament_participants`
  ADD COLUMN `name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Participant display name (pair/team); individuals keep the derived user name',
  ADD KEY `idx_participant_type` (`participant_type`);

CREATE TABLE IF NOT EXISTS `tournament_participant_members` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL COMMENT 'Denormalized tournament scope (enables the active-user-per-tournament uniqueness below)',
  `participant_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `member_order` int unsigned NOT NULL DEFAULT '0' COMMENT 'Role/order within the participant (0 = primary/first member)',
  `status` enum('active','left','replaced') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `joined_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `left_at` timestamp NULL DEFAULT NULL COMMENT 'Set when the member leaves or is replaced',
  `replaced_by_member_id` int unsigned DEFAULT NULL COMMENT 'Member row that replaced this one (replacement history)',
  `active_tournament_id` int unsigned DEFAULT NULL COMMENT 'App-managed tournament scope while status=active (NULL for historical rows); UNIQUE(user_id, active_tournament_id) enforces one active participant per user per tournament',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_member_participant_user` (`participant_id`,`user_id`),
  UNIQUE KEY `uk_active_user_tournament` (`user_id`,`active_tournament_id`),
  KEY `idx_member_tournament` (`tournament_id`,`status`),
  KEY `idx_member_participant` (`participant_id`),
  CONSTRAINT `fk_member_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_member_participant` FOREIGN KEY (`participant_id`) REFERENCES `tournament_participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_member_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_member_replaced` FOREIGN KEY (`replaced_by_member_id`) REFERENCES `tournament_participant_members` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tournament_replacement_requests` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL,
  `participant_id` int unsigned NOT NULL,
  `outgoing_member_user_id` int unsigned NOT NULL,
  `replacement_user_id` int unsigned NOT NULL,
  `requested_by` int unsigned DEFAULT NULL,
  `requested_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_by` int unsigned DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `status` enum('pending','approved','rejected','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rejection_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `draw_impact` json DEFAULT NULL COMMENT 'Draw/seed impact snapshot computed at request time',
  `open_flag` char(1) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (IF(`status` = 'pending', 'P', NULL)) STORED COMMENT 'Non-NULL while pending -> one open request per participant',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_open_request_participant` (`participant_id`,`open_flag`),
  KEY `idx_rr_tournament_status` (`tournament_id`,`status`),
  CONSTRAINT `fk_rr_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rr_participant` FOREIGN KEY (`participant_id`) REFERENCES `tournament_participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rr_outgoing` FOREIGN KEY (`outgoing_member_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_rr_replacement` FOREIGN KEY (`replacement_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_rr_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rr_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Team roster size (NULL = players_per_side). Doubles/individual unchanged.
ALTER TABLE `sport_formats`
  ADD COLUMN `roster_size` int unsigned DEFAULT NULL COMMENT 'Max roster members for a TEAM participant; NULL = players_per_side';

-- Make membership authoritative for existing participants immediately: every
-- individual participant already has exactly one member (member_user_ids[0]).
-- INSERT IGNORE keeps the backfill idempotent/safe on any edge-case duplicates.
INSERT IGNORE INTO `tournament_participant_members` (`tournament_id`, `participant_id`, `user_id`, `member_order`, `active_tournament_id`)
SELECT p.`tournament_id`, p.`id`,
       CAST(JSON_UNQUOTE(JSON_EXTRACT(p.`member_user_ids`, '$[0]')) AS UNSIGNED),
       0,
       p.`tournament_id`
FROM `tournament_participants` p
WHERE p.`member_user_ids` IS NOT NULL
  AND JSON_LENGTH(p.`member_user_ids`) >= 1
  AND CAST(JSON_UNQUOTE(JSON_EXTRACT(p.`member_user_ids`, '$[0]')) AS UNSIGNED) IS NOT NULL;