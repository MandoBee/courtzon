-- Migration: Add expires_at to bookings and pending_payment status
-- Part of booking_intent removal refactor

-- Add expires_at column to bookings (used for pending_payment TTL)
ALTER TABLE bookings ADD COLUMN expires_at DATETIME NULL AFTER notes;

-- Add pending_payment to booking_status enum
ALTER TABLE bookings MODIFY COLUMN booking_status ENUM(
  'pending', 'pending_payment', 'confirmed', 'cancelled', 'completed',
  'expired', 'checked_in', 'no_show'
) NOT NULL DEFAULT 'pending';
