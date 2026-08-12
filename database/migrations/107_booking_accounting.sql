-- Migration 107: Booking Accounting Integration
-- Adds booking tax snapshot + economic split fields to bookings table.
-- Idempotent. Does NOT alter existing accounting/ledger tables.

-- Booking tax snapshot (mirrors invoice/marketplace tax architecture)
ALTER TABLE bookings
  ADD COLUMN tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'Snapshot tax rate %' AFTER total_amount,
  ADD COLUMN tax_rate_id INT UNSIGNED DEFAULT NULL COMMENT 'FK to tax_rates (traceability)' AFTER tax_rate,
  ADD COLUMN tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Snapshot tax amount' AFTER tax_rate_id,
  ADD COLUMN tax_treatment ENUM('taxable','zero_rated','exempt') NOT NULL DEFAULT 'taxable' AFTER tax_amount,
  ADD COLUMN price_type ENUM('net','gross') NOT NULL DEFAULT 'net' AFTER tax_treatment,
  ADD COLUMN coach_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Coach share (authoritative, from coach session/agreement)' AFTER club_amount,
  ADD KEY idx_bookings_tax_rate (tax_rate_id),
  ADD CONSTRAINT fk_bookings_tax_rate FOREIGN KEY (tax_rate_id) REFERENCES tax_rates(id) ON DELETE SET NULL;
