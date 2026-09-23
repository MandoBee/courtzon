-- ============================================================================
-- COURTZON V3 : TOURNAMENT MATCH GENERATION + SCHEDULE + COURT RESERVATION (G8)
--
-- Group 8 — match generation from a LOCKED draw + scheduling + shared court
-- reservation.
--
-- COURTZON_MIGRATION_ENV: PRODUCTION_SAFE
--
-- Design notes:
--   * tournament_matches gains participant1_id / participant2_id — the
--     AUTHORITATIVE competitive-unit references (tournament_participants). The
--     historical player1_id / player2_id (users) remain untouched (backward
--     compatible; still populated with the primary member for result/UI
--     compatibility). For doubles/team tournaments the draw operates on the
--     PARTICIPANT — this is where that identity is persisted per bracket slot.
--   * bookings.booking_type is EXTENDED with 'tournament' so a tournament match
--     can reserve a court through the SHARED bookings table (booking_slots +
--     checkSlotAvailability + Redis locks + resources FOR UPDATE). The G8
--     reservation path is deliberately NON-FINANCIAL (total 0, no payment, no
--     accounting) and the booking auto-complete worker skips tournament rows.
--     This is an ADDITIVE extension of the existing shared booking capability —
--     NOT a parallel tournament_court_reservations table.
--   * Additive only. No historical match/booking/registration data is rewritten.
-- ============================================================================

ALTER TABLE `tournament_matches`
  ADD COLUMN `participant1_id` int unsigned DEFAULT NULL COMMENT 'Authoritative participant (tournament_participants) on side 1 of the bracket slot',
  ADD COLUMN `participant2_id` int unsigned DEFAULT NULL COMMENT 'Authoritative participant (tournament_participants) on side 2 of the bracket slot',
  ADD KEY `idx_tm_participant1` (`participant1_id`),
  ADD KEY `idx_tm_participant2` (`participant2_id`),
  ADD CONSTRAINT `fk_tm_participant1` FOREIGN KEY (`participant1_id`) REFERENCES `tournament_participants` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_tm_participant2` FOREIGN KEY (`participant2_id`) REFERENCES `tournament_participants` (`id`) ON DELETE SET NULL;

ALTER TABLE `bookings`
  MODIFY COLUMN `booking_type` enum('public_match','private_match','academy','clinic','coach_session','tournament') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'tournament = non-financial court reservation for a tournament match';