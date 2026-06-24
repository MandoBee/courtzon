-- ============================================================================
-- COURTZON-V2 : Add opening/closing time to resources (branches already has them)
-- ============================================================================

USE courtzon_v2;

ALTER TABLE resources
  ADD COLUMN opening_time TIME DEFAULT NULL AFTER max_bookings_per_slot,
  ADD COLUMN closing_time TIME DEFAULT NULL AFTER opening_time;
