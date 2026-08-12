-- Migration 110: Post-settlement refund recovery tracking
-- Adds settled-amount tracking to bookings so refunds can distinguish
-- settled vs unsettled coach/organization economics and create recovery.
-- Idempotent. Does NOT alter historical accounting records.

ALTER TABLE bookings
  ADD COLUMN coach_settled_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Coach economics already paid via settlement' AFTER refunded_amount,
  ADD COLUMN org_settled_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Org economics already paid via settlement' AFTER coach_settled_amount;
