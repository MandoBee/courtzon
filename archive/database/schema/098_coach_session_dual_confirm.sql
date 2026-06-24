-- Migration 098: Add pending statuses to coach_sessions for dual-confirmation flow
USE `courtzon_v2`;

ALTER TABLE coach_sessions
  MODIFY COLUMN status ENUM('pending_court','pending_acceptance','scheduled','confirmed','in_progress','completed','cancelled','no_show') NOT NULL DEFAULT 'pending_court';

-- Add booking_id to coach_sessions to link to the court booking
ALTER TABLE coach_sessions
  ADD COLUMN booking_id BIGINT UNSIGNED DEFAULT NULL AFTER resource_id,
  ADD INDEX idx_cs_booking (booking_id),
  ADD CONSTRAINT fk_cs_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;
