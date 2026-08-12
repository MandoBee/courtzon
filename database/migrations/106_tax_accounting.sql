-- Migration 106: Full Tax Accounting Architecture
-- 1. Tax rates: organization scope + categories + uniqueness
-- 2. invoice_items: traceability + pricing mode + tax treatment
-- 3. Input tax COA hierarchy + default account
-- 4. Duplicate mapping cleanup + uniqueness

-- ── Part 1: tax_rates organisation scope ──
ALTER TABLE tax_rates
  ADD COLUMN organisation_id INT UNSIGNED DEFAULT NULL AFTER id,
  ADD COLUMN tax_category ENUM('sales','vat','gst','withholding','other') DEFAULT 'vat' AFTER type,
  ADD COLUMN is_global TINYINT(1) NOT NULL DEFAULT 1 AFTER is_active,
  ADD KEY idx_tr_org (organisation_id),
  ADD CONSTRAINT fk_tr_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE;

-- Scope column for NULL uniqueness (same pattern as COA migration 103)
ALTER TABLE tax_rates
  ADD COLUMN org_scope VARCHAR(40) DEFAULT '' AFTER tax_category;
UPDATE tax_rates SET org_scope = CONCAT(COALESCE(organisation_id, 0), ':', name);
CREATE UNIQUE INDEX uk_tr_org_scope ON tax_rates (org_scope);

DROP TRIGGER IF EXISTS trg_tr_scope_insert;
CREATE TRIGGER trg_tr_scope_insert BEFORE INSERT ON tax_rates
FOR EACH ROW SET NEW.org_scope = CONCAT(COALESCE(NEW.organisation_id, 0), ':', NEW.name);

DROP TRIGGER IF EXISTS trg_tr_scope_update;
CREATE TRIGGER trg_tr_scope_update BEFORE UPDATE ON tax_rates
FOR EACH ROW SET NEW.org_scope = CONCAT(COALESCE(NEW.organisation_id, 0), ':', NEW.name);

-- ── Part 2: invoice_items traceability + pricing ──
ALTER TABLE invoice_items
  ADD COLUMN tax_rate_id INT UNSIGNED DEFAULT NULL AFTER tax_amount,
  ADD COLUMN price_type ENUM('net','gross') NOT NULL DEFAULT 'net' AFTER quantity,
  ADD COLUMN tax_treatment ENUM('taxable','zero_rated','exempt') NOT NULL DEFAULT 'taxable' AFTER price_type,
  ADD COLUMN net_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER tax_treatment,
  ADD KEY idx_ii_tax_rate (tax_rate_id),
  ADD CONSTRAINT fk_ii_tax_rate FOREIGN KEY (tax_rate_id) REFERENCES tax_rates(id) ON DELETE SET NULL;

-- Backfill existing rows: net_amount = unit_price * quantity (tax-exclusive)
UPDATE invoice_items SET net_amount = unit_price * quantity WHERE net_amount = 0;

-- ── Part 3: Input Tax COA hierarchy ──
INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, 'INPUT-TAX', 'Input Tax', 'asset', 'debit', id, 1, 1, 'Level 4 — Recoverable input tax on purchases'
FROM chart_of_accounts WHERE code = 'ASSETS-RECEIVABLES' AND organisation_id IS NULL AND is_active = 1
AND NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = 'INPUT-TAX' AND organisation_id IS NULL);

-- ── Part 4: Accounting event mapping dedup ──
-- Remove exact duplicate rows (same event_type, organisation_id, concept, account_id, is_active)
DELETE ael1 FROM accounting_event_mapping_lines ael1
INNER JOIN accounting_event_mapping_lines ael2
WHERE ael1.id > ael2.id
  AND ael1.event_type = ael2.event_type
  AND COALESCE(ael1.organisation_id, 0) = COALESCE(ael2.organisation_id, 0)
  AND ael1.concept = ael2.concept
  AND ael1.account_id = ael2.account_id;

-- Add scope column and unique index
ALTER TABLE accounting_event_mapping_lines
  ADD COLUMN event_org_concept_scope VARCHAR(120) DEFAULT '' AFTER concept;
UPDATE accounting_event_mapping_lines SET event_org_concept_scope = CONCAT(event_type, ':', COALESCE(organisation_id, 0), ':', concept);
CREATE UNIQUE INDEX uk_ael_scope ON accounting_event_mapping_lines (event_org_concept_scope);

DROP TRIGGER IF EXISTS trg_ael_scope_insert;
CREATE TRIGGER trg_ael_scope_insert BEFORE INSERT ON accounting_event_mapping_lines
FOR EACH ROW SET NEW.event_org_concept_scope = CONCAT(NEW.event_type, ':', COALESCE(NEW.organisation_id, 0), ':', NEW.concept);

DROP TRIGGER IF EXISTS trg_ael_scope_update;
CREATE TRIGGER trg_ael_scope_update BEFORE UPDATE ON accounting_event_mapping_lines
FOR EACH ROW SET NEW.event_org_concept_scope = CONCAT(NEW.event_type, ':', COALESCE(NEW.organisation_id, 0), ':', NEW.concept);
