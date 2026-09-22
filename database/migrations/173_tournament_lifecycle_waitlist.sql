-- ============================================================================
-- COURTZON V3 : TOURNAMENT PARTICIPANT LIFECYCLE — WAITLIST + WITHDRAWAL (G6)
--
-- Extends the G5 participant/seeding/draw foundation with the real participant
-- lifecycle: pre-start withdrawal, post-start withdrawal state, a REAL FIFO
-- waitlist, and pre-start replacement.
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- Design notes:
--   * tournament_participants (the authoritative G5 model) gains:
--       - status 'withdrawn_after_start' (post-start withdrawal is a DISTINCT
--         lifecycle state — normal waitlist replacement is blocked after start);
--       - waiting_order (FIFO, unique per tournament, monotonic, never renumbered).
--   * tournament_registrations.status gains 'waiting' so the legacy waitlist
--     helpers (getNextWaitingOrder) become real; payment_status stays 'unpaid'
--     for a waiting participant (NO entitlement until promoted + paid).
--   * tournaments gains waitlist_enabled (default 0 = EXISTING behavior: a full
--     tournament still throws TOURNAMENT_CAPACITY_FULL). Admins opt in.
--   * Additive only. Historical registrations/matches/results untouched.
-- ============================================================================

ALTER TABLE `tournament_participants`
  MODIFY COLUMN `status` enum('active','withdrawn','waiting','withdrawn_after_start') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  ADD COLUMN `waiting_order` int unsigned DEFAULT NULL COMMENT 'FIFO waitlist position (unique per tournament, monotonic, stable); NULL when not waiting',
  ADD KEY `idx_participant_waiting` (`tournament_id`,`status`,`waiting_order`);

ALTER TABLE `tournament_registrations`
  MODIFY COLUMN `status` enum('registered','confirmed','withdrawn','disqualified','waiting') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'registered';

ALTER TABLE `tournaments`
  ADD COLUMN `waitlist_enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'When full and enabled, new registrations enter a FIFO waitlist instead of erroring';