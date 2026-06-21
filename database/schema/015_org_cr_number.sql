-- Add cr_number column to organisations table
-- CR (Commercial Registration) is a separate field from tax_id/tax_id_type

ALTER TABLE organisations
  ADD COLUMN cr_number VARCHAR(100) DEFAULT NULL AFTER tax_id_type;
