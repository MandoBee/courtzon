-- Phase 2: Booking Concurrency
-- Prevent double bookings at the database level.

ALTER TABLE bookings
  ADD UNIQUE INDEX uq_booking_slot (resource_id, booking_date, start_time);
