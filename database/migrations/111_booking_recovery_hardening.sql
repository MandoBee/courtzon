-- Migration 111: Booking recovery hardening
-- Adds cumulative recovered-amount tracking so multiple refunds cannot
-- over-recover against the same settled economics.
-- Idempotent. Does NOT alter historical accounting entries.

ALTER TABLE bookings
  ADD COLUMN coach_recovered_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Cumulative coach recovery already posted' AFTER org_settled_amount,
  ADD COLUMN org_recovered_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Cumulative org recovery already posted' AFTER coach_recovered_amount;
