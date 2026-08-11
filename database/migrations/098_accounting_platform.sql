-- Accounting Platform Foundation
-- Adds: multi-org scope, event→account mapping, idempotency, concepts model
-- Architecture Decision #2 — LOCKED

-- ── 1. accounting_event_mapping_lines ──
CREATE TABLE IF NOT EXISTS accounting_event_mapping_lines (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type        VARCHAR(50) NOT NULL,
  organisation_id   INT UNSIGNED DEFAULT NULL COMMENT 'NULL = global default',
  concept           VARCHAR(50) NOT NULL COMMENT 'Accounting concept (e.g. revenue, tax_liability)',
  account_id        INT UNSIGNED NOT NULL,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uk_event_org_concept (event_type, organisation_id, concept),
  KEY idx_org (organisation_id),
  KEY idx_account (account_id),
  CONSTRAINT fk_ael_account FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id),
  CONSTRAINT fk_ael_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. chart_of_accounts — add org scope and account nature ──
ALTER TABLE chart_of_accounts
  ADD COLUMN organisation_id INT UNSIGNED DEFAULT NULL COMMENT 'NULL = platform-global account' AFTER id,
  ADD COLUMN normal_side ENUM('debit','credit') DEFAULT NULL COMMENT 'Natural balance direction' AFTER type,
  ADD COLUMN is_system TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'System accounts cannot be deleted' AFTER is_active,
  ADD KEY idx_coa_org (organisation_id),
  ADD CONSTRAINT fk_coa_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE;

-- Drop old UNIQUE on code alone; replace with org-scoped uniqueness
ALTER TABLE chart_of_accounts DROP INDEX uk_code;
ALTER TABLE chart_of_accounts ADD UNIQUE KEY uk_org_code (organisation_id, code);

-- ── 3. ledger_entries — add event identity, org scope, COA FK, idempotency ──
ALTER TABLE ledger_entries
  ADD COLUMN event_type VARCHAR(50) DEFAULT NULL COMMENT 'Accounting event type (e.g. card_payment)' AFTER source_id,
  ADD COLUMN organisation_id INT UNSIGNED DEFAULT NULL COMMENT 'NULL = platform event' AFTER event_type,
  ADD COLUMN chart_account_id INT UNSIGNED DEFAULT NULL COMMENT 'FK to chart_of_accounts' AFTER organisation_id,
  ADD KEY idx_event (event_type),
  ADD KEY idx_org (organisation_id),
  ADD KEY idx_chart_account (chart_account_id),
  ADD CONSTRAINT fk_le_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_le_chart_account FOREIGN KEY (chart_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

-- Idempotency UNIQUE: one event cannot produce duplicate lines for the same account+side
ALTER TABLE ledger_entries ADD UNIQUE KEY uk_dedup (source_type, source_id, event_type, chart_account_id, side);

-- ── 4. accounting_periods — org scope ──
ALTER TABLE accounting_periods
  ADD COLUMN organisation_id INT UNSIGNED DEFAULT NULL COMMENT 'NULL = platform-global periods' AFTER id,
  ADD KEY idx_ap_org (organisation_id),
  ADD CONSTRAINT fk_ap_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE;

ALTER TABLE accounting_periods DROP INDEX uk_fy_period;
ALTER TABLE accounting_periods ADD UNIQUE KEY uk_org_fy_period (organisation_id, fiscal_year, period_number);

-- ── 5. general_ledger — org scope ──
ALTER TABLE general_ledger
  ADD COLUMN organisation_id INT UNSIGNED DEFAULT NULL AFTER id,
  ADD KEY idx_gl_org (organisation_id),
  ADD CONSTRAINT fk_gl_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE SET NULL;
