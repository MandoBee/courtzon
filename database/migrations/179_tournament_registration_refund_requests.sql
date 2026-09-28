-- ============================================================================
-- G11.3 — Tournament FULL REFUND — registration refund REQUEST workflow table.
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- Solely persists the player-request → organisation-approval workflow that
-- precedes the EXECUTION of a tournament registration full refund (G11.3).
-- Mirrors the approved `tournament_replacement_requests` shape:
--   * one row per refund request against a registration,
--   * status lifecycle: pending → approved → executed, or pending → rejected,
--   * generated open_flag = IF(status IN ('pending','approved'),'O',NULL) with
--     UNIQUE(registration_id, open_flag): ONE open request per registration
--     (a concurrent duplicate request is impossible at the DB level),
--   * FKs preserve the tournament/registration history (no destructive
--     deletes; requested_by/reviewed_by users are SET NULL, never CASCADE),
--   * additive only. No rewrite of historical registration/payment/draw data.
--
-- Refund EXECUTION state itself (payment_status='refunded', registration
-- status 'withdrawn', participant 'withdrawn', draw lock, settlement detach,
-- ledger reversals) reuses EXISTING columns/tables — no other schema change.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `tournament_registration_refund_requests` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `tournament_id` int unsigned NOT NULL,
  `registration_id` int unsigned NOT NULL,
  `requested_by` int unsigned NOT NULL COMMENT 'Player submitting the refund request (must own the registration)',
  `requested_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_by` int unsigned DEFAULT NULL COMMENT 'Organisation official who approved/rejected',
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `executed_at` timestamp NULL DEFAULT NULL COMMENT 'When the approved refund was actually executed',
  `status` enum('pending','approved','rejected','executed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Player-stated refund reason',
  `rejection_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `open_flag` char(1) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (IF(`status` IN ('pending','approved'), 'O', NULL)) STORED COMMENT 'Non-NULL while open (pending/approved) -> one open request per registration',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_open_request_registration` (`registration_id`,`open_flag`),
  KEY `idx_rfr_tournament_status` (`tournament_id`,`status`),
  CONSTRAINT `fk_rfr_tournament` FOREIGN KEY (`tournament_id`) REFERENCES `tournaments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rfr_registration` FOREIGN KEY (`registration_id`) REFERENCES `tournament_registrations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rfr_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_rfr_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;