-- Migration 008: Add updated_at to booking_intents
-- Enables tracking of status transition timestamps for observability and reporting.
-- Consistent with other tables (payment_transactions, bookings, orders) which
-- all have auto-updating updated_at columns.

ALTER TABLE booking_intents
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() AFTER created_at;
