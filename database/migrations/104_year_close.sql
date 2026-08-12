-- Migration 104: Year-End Closing + Retained Earnings
-- Part 1: Equity COA hierarchy (idempotent)
-- Part 2: year_closings + year_close_cycles tables

-- ── Part 1: Equity COA Hierarchy ──
-- L2: EQUITY-STANDARD
INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, 'EQUITY-STANDARD', 'Standard Equity', 'equity', 'credit', id, 1, 1, 'Level 2 — Fixed: Standard equity accounts'
FROM chart_of_accounts WHERE code = 'EQUITY' AND organisation_id IS NULL AND is_active = 1
AND NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = 'EQUITY-STANDARD' AND organisation_id IS NULL);

-- L3: EQUITY-RETAINED
INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, 'EQUITY-RETAINED', 'Retained Earnings Group', 'equity', 'credit', id, 1, 1, 'Level 3 — Fixed: Retained earnings accounts'
FROM chart_of_accounts WHERE code = 'EQUITY-STANDARD' AND organisation_id IS NULL AND is_active = 1
AND NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = 'EQUITY-RETAINED' AND organisation_id IS NULL);

-- L4: 3100 Retained Earnings
INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '3100', 'Retained Earnings', 'equity', 'credit', id, 1, 1, 'Level 4 — Posting: Accumulated retained earnings'
FROM chart_of_accounts WHERE code = 'EQUITY-RETAINED' AND organisation_id IS NULL AND is_active = 1
AND NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE code = '3100' AND organisation_id IS NULL);

-- ── Part 2: year_closings table ──
CREATE TABLE IF NOT EXISTS year_closings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisation_id INT UNSIGNED DEFAULT NULL COMMENT 'NULL = platform',
  fiscal_year INT UNSIGNED NOT NULL,
  org_year_scope VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'Composite: NULL org→0 + year for uniqueness',
  net_income DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  retained_earnings_account_id INT UNSIGNED NOT NULL,
  status ENUM('pending','completed','failed','reopened') NOT NULL DEFAULT 'pending',
  close_count INT UNSIGNED NOT NULL DEFAULT 1,
  reopened_at TIMESTAMP NULL DEFAULT NULL,
  reopened_by INT UNSIGNED DEFAULT NULL,
  reopen_reason VARCHAR(500) DEFAULT NULL,
  reversal_entry_count INT UNSIGNED DEFAULT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_year_close_scope (org_year_scope),
  KEY idx_org (organisation_id),
  CONSTRAINT fk_yc_org FOREIGN KEY (organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
  CONSTRAINT fk_yc_account FOREIGN KEY (retained_earnings_account_id) REFERENCES chart_of_accounts(id),
  CONSTRAINT fk_yc_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trigger: auto-populate org_year_scope (NULL org → 0)
DROP TRIGGER IF EXISTS trg_yc_scope_insert;
CREATE TRIGGER trg_yc_scope_insert BEFORE INSERT ON year_closings
FOR EACH ROW SET NEW.org_year_scope = CONCAT(COALESCE(NEW.organisation_id, 0), ':', NEW.fiscal_year);

DROP TRIGGER IF EXISTS trg_yc_scope_update;
CREATE TRIGGER trg_yc_scope_update BEFORE UPDATE ON year_closings
FOR EACH ROW SET NEW.org_year_scope = CONCAT(COALESCE(NEW.organisation_id, 0), ':', NEW.fiscal_year);

-- ── Part 3: year_close_cycles table ──
CREATE TABLE IF NOT EXISTS year_close_cycles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  year_closings_id INT UNSIGNED NOT NULL,
  cycle_number INT UNSIGNED NOT NULL,
  net_income DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  entry_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('pending','completed','reversed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ycc_cycle (year_closings_id, cycle_number),
  KEY idx_ycc_parent (year_closings_id),
  CONSTRAINT fk_ycc_parent FOREIGN KEY (year_closings_id) REFERENCES year_closings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
