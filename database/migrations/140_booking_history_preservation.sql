-- ============================================================
-- 140_booking_history_preservation.sql
--
-- Group D: Booking History Preservation / Terminal Booking Policy
--
-- Purpose
-- -------
-- Remove the status-blind unique constraints that forced destructive
-- deletion of terminal booking history:
--
--   1. bookings.uq_booking_slot      (resource_id, booking_date, start_time) UNIQUE
--   2. booking_slots.uk_slot         (resource_id, booking_date, slot_start)  UNIQUE
--
-- These legacy constraints only protect IDENTICAL start values and are
-- status-blind, so a cancelled/expired/no_show/completed booking permanently
-- blocks a future booking for the same slot. The application compensated by
-- hard-deleting terminal bookings (destroying history) to bypass the unique
-- key. That workaround is removed in this phase.
--
-- The AUTHORITATIVE concurrency mechanism is the transactional
-- resource-row serialization + overlap check (Group B):
--   1. BEGIN
--   2. SELECT id FROM resources WHERE id = ? FOR UPDATE
--   3. count overlapping blocking bookings (terminal statuses excluded)
--   4. INSERT only if no blocking overlap
--   5. COMMIT
-- Dropping these unique keys does NOT weaken that guarantee; they were never
-- authoritative for overlap protection (they cannot catch partial overlaps
-- and are redundant with the overlap count under the resource lock).
--
-- Changes
-- -------
-- bookings:
--   DROP INDEX uq_booking_slot
--   ADD INDEX idx_bookings_resource_date_start (resource_id, booking_date, start_time)
--     -- non-unique lookup index keeps the availability overlap query efficient
-- booking_slots:
--   DROP INDEX uk_slot
--     -- idx_resource_date_slot (resource_id, booking_date, slot_start) already
--     -- exists as a non-unique index; no replacement needed.
--
-- The baseline and this migration are the only authoritative schema sources.
-- ============================================================

ALTER TABLE `bookings`
  DROP INDEX `uq_booking_slot`,
  ADD INDEX `idx_bookings_resource_date_start` (`resource_id`, `booking_date`, `start_time`);

ALTER TABLE `booking_slots`
  DROP INDEX `uk_slot`;

-- DOWN:
-- ALTER TABLE `bookings`
--   DROP INDEX `idx_bookings_resource_date_start`,
--   ADD UNIQUE INDEX `uq_booking_slot` (`resource_id`, `booking_date`, `start_time`);
-- ALTER TABLE `booking_slots`
--   ADD UNIQUE INDEX `uk_slot` (`resource_id`, `booking_date`, `slot_start`);