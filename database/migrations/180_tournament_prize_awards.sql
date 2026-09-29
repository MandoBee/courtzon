-- ============================================================================
-- COURTZON V3 : TOURNAMENT PRIZE AWARDS (G11.5 Phase 1)
-- Prize payout bookkeeping: award binding → wallet credit → accounting →
-- entitlement netting. See docs/report deliverables for the full topology.
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
-- (Machine-readable classification for backend/scripts/migration-guard.sh —
--  eligible in every environment.)
--
-- Design notes (locked decisions Q1b/Q2b/Q3b/Q5/Q8b/Q8c/Q10b/Q12b):
--   * `tournament_prize_awards` is FINANCIAL HISTORY — deliberately NO
--     ON DELETE CASCADE to tournaments/prizes/registrations/users. Immutable
--     transaction records must survive entity deletion (Database Relationship
--     & Historical Data Policy §2). RESTRICT (default) additionally blocks
--     deleting a tournament/prize that carries awarded history.
--   * amount/currency are SNAPSHOTTED from tournament_prizes at award time;
--     winner resolution = tournament_standings.rank_position →
--     tournament_registrations.player_id (Q2b).
--   * funding_source: 'platform' (platform/community tournament) |
--     'organization' (org-owned tournament) — Q5. collection_method
--     ('card'|'cash') selects the org-book accounting leg (Cr org 1161 vs
--     Cr org MKT-CZ-PAY) per the locked topology.
--   * status lifecycle: awarded → credited → refunded. The wallet credit is
--     ATOMIC with award creation; refund is a FULL-ONLY clawback valid only
--     while funds remain inside the winner's wallet custody (post-payout
--     recovery is OUT OF SCOPE — no debt/recovery system, Q10b).
--   * Wallet ENUM: append 'prize' to wallet_transactions.transaction_type.
--     A prize credit is a distinct economic event; reusing 'refund' or
--     'settlement' would corrupt wallet reporting/BI categories. Append-only
--     value addition — fully backward compatible.
-- ============================================================================

-- 1. tournament_prize_awards — the authoritative award ledger.
CREATE TABLE IF NOT EXISTS `tournament_prize_awards` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `public_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tournament_id` int unsigned NOT NULL,
  `prize_id` int unsigned NOT NULL,
  `placement` int unsigned DEFAULT NULL,
  `registration_id` int unsigned NOT NULL,
  `winner_user_id` int unsigned NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `currency_code` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EGP',
  `funding_source` enum('platform','organization') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'platform',
  `collection_method` enum('card','cash') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'card',
  `status` enum('awarded','credited','refunded') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'awarded',
  `bind_source` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'standings',
  `created_by` int unsigned DEFAULT NULL,
  `awarded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `credited_at` timestamp NULL DEFAULT NULL,
  `refunded_at` timestamp NULL DEFAULT NULL,
  `refunded_by` int unsigned DEFAULT NULL,
  `refund_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tpa_tourn_place_winner` (`tournament_id`,`placement`,`winner_user_id`),
  KEY `idx_tpa_tournament` (`tournament_id`),
  KEY `idx_tpa_winner` (`winner_user_id`),
  KEY `idx_tpa_status` (`status`),
  CONSTRAINT `fk_tpa_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`),
  CONSTRAINT `fk_tpa_prize` FOREIGN KEY (`prize_id`) REFERENCES `tournament_prizes` (`id`),
  CONSTRAINT `fk_tpa_registration` FOREIGN KEY (`registration_id`) REFERENCES `tournament_registrations` (`id`),
  CONSTRAINT `fk_tpa_winner` FOREIGN KEY (`winner_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Wallet transactions — append the 'prize' economic event type.
--    Append-only enum extension; all existing rows and queries are unaffected.
ALTER TABLE `wallet_transactions`
  MODIFY COLUMN `transaction_type`
    enum('deposit','withdrawal','payment','refund','commission','settlement','due','penalty','prize')
    COLLATE utf8mb4_unicode_ci NOT NULL;