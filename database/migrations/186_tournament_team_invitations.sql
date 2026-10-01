-- ============================================================================
-- COURTZON V3 : TOURNAMENT TEAM INVITATIONS (G11.17)
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- PURPOSE
--   Add the dedicated pending-invitation store for the PLAYER team
--   invitation lifecycle (team owner/captain invites an eligible player;
--   the invitee accepts or rejects). All pending invitations live EXCLUSIVELY
--   here — `tournament_participant_members.status` is NOT extended, and the
--   existing active-membership semantics (`uk_active_user_tournament`,
--   `findActiveMemberByUser`, roster counts, G11.15 fail-closed team-prize
--   eligibility) are preserved unchanged.
--
--   UNIQUE(participant_id, invitee_user_id) guarantees at most ONE invitation
--   (pending or resolved) from a team to a player — duplicate and re-sent
--   invitations are impossible by construction.
--
-- SAFETY
--   * Additive only: one new table, no column/enum/constraint changed anywhere.
--   * FK conventions mirror the tournament tables: `tournament_id` and
--     `participant_id` CASCADE (a deleted tournament/participant removes its
--     transient invitations); `user` FKs CASCADE (consistent with
--     `tournament_participant_members`). The invitation row is intentionally a
--     transient request, NOT an immutable financial/audit record.
--   * No financial/accounting/wallet/settlement/prize data is touched.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `tournament_team_invitations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL,
  `participant_id` int unsigned NOT NULL,
  `inviter_user_id` int unsigned NOT NULL,
  `invitee_user_id` int unsigned NOT NULL,
  `status` enum('pending','accepted','rejected','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `expires_at` timestamp NULL DEFAULT NULL COMMENT 'Invitation expiry; a pending invitation past this instant is treated as expired (lazy + explicit)',
  `accepted_at` timestamp NULL DEFAULT NULL,
  `rejected_at` timestamp NULL DEFAULT NULL,
  `expired_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tti_participant_invitee` (`participant_id`,`invitee_user_id`),
  KEY `idx_tti_tournament` (`tournament_id`),
  KEY `idx_tti_participant` (`participant_id`),
  KEY `idx_tti_invitee_status` (`invitee_user_id`,`status`),
  KEY `idx_tti_status_expires` (`status`,`expires_at`),
  CONSTRAINT `fk_tti_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tti_participant` FOREIGN KEY (`participant_id`) REFERENCES `tournament_participants` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tti_inviter` FOREIGN KEY (`inviter_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tti_invitee` FOREIGN KEY (`invitee_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;