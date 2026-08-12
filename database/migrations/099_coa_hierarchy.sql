-- COA Fixed Hierarchy Foundation
-- Seeds L1-L3 structural accounts and assigns parent_id to existing L4 accounts.
-- Architecture Decision #2 — LOCKED
-- Idempotent: all INSERTs use INSERT IGNORE; all UPDATEs are safe on re-run

-- ── L1: Major Classes ──
INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
VALUES
  ('ASSETS', 'Assets', 'asset', 'debit', NULL, 1, 1, NULL, 'Level 1 — Fixed: All asset accounts'),
  ('LIABILITIES', 'Liabilities', 'liability', 'credit', NULL, 1, 1, NULL, 'Level 1 — Fixed: All liability accounts'),
  ('EQUITY', 'Equity', 'equity', 'credit', NULL, 1, 1, NULL, 'Level 1 — Fixed: All equity accounts'),
  ('REVENUE', 'Revenue', 'revenue', 'credit', NULL, 1, 1, NULL, 'Level 1 — Fixed: All revenue accounts'),
  ('EXPENSES', 'Expenses', 'expense', 'debit', NULL, 1, 1, NULL, 'Level 1 — Fixed: All expense accounts');

-- ── L2: Structural Groups ──
INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
SELECT 'ASSETS-CURRENT', 'Current Assets', 'asset', 'debit', id, 1, 1, NULL, 'Level 2 — Fixed'
  FROM chart_of_accounts WHERE code = 'ASSETS' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
SELECT 'ASSETS-NONCURRENT', 'Non-Current Assets', 'asset', 'debit', id, 1, 1, NULL, 'Level 2 — Fixed placeholder'
  FROM chart_of_accounts WHERE code = 'ASSETS' AND organisation_id IS NULL;

INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
SELECT 'LIABILITIES-CURRENT', 'Current Liabilities', 'liability', 'credit', id, 1, 1, NULL, 'Level 2 — Fixed'
  FROM chart_of_accounts WHERE code = 'LIABILITIES' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
SELECT 'LIABILITIES-NONCURRENT', 'Non-Current Liabilities', 'liability', 'credit', id, 1, 1, NULL, 'Level 2 — Fixed placeholder'
  FROM chart_of_accounts WHERE code = 'LIABILITIES' AND organisation_id IS NULL;

INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
SELECT 'REVENUE-OPERATING', 'Operating Revenue', 'revenue', 'credit', id, 1, 1, NULL, 'Level 2 — Fixed'
  FROM chart_of_accounts WHERE code = 'REVENUE' AND organisation_id IS NULL;

INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
SELECT 'EXPENSES-OPERATING', 'Operating Expenses', 'expense', 'debit', id, 1, 1, NULL, 'Level 2 — Fixed'
  FROM chart_of_accounts WHERE code = 'EXPENSES' AND organisation_id IS NULL;

-- ── L3: Structural Subgroups ──
INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
SELECT 'ASSETS-CASH', 'Cash & Bank', 'asset', 'debit', id, 1, 1, NULL, 'Level 3 — Fixed'
  FROM chart_of_accounts WHERE code = 'ASSETS-CURRENT' AND organisation_id IS NULL;

INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
SELECT 'ASSETS-CLEARING', 'Clearing Accounts', 'asset', 'debit', id, 1, 1, NULL, 'Level 3 — Fixed'
  FROM chart_of_accounts WHERE code = 'ASSETS-CURRENT' AND organisation_id IS NULL;

INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
SELECT 'ASSETS-RECEIVABLES', 'Receivables', 'asset', 'debit', id, 1, 1, NULL, 'Level 3 — Fixed'
  FROM chart_of_accounts WHERE code = 'ASSETS-CURRENT' AND organisation_id IS NULL;

INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
SELECT 'LIABILITIES-WALLET', 'Wallet Liabilities', 'liability', 'credit', id, 1, 1, NULL, 'Level 3 — Fixed'
  FROM chart_of_accounts WHERE code = 'LIABILITIES-CURRENT' AND organisation_id IS NULL;

INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
SELECT 'LIABILITIES-PAYABLES', 'Organization Payables', 'liability', 'credit', id, 1, 1, NULL, 'Level 3 — Fixed'
  FROM chart_of_accounts WHERE code = 'LIABILITIES-CURRENT' AND organisation_id IS NULL;

INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
SELECT 'LIABILITIES-TAX', 'Tax Liabilities', 'liability', 'credit', id, 1, 1, NULL, 'Level 3 — Fixed'
  FROM chart_of_accounts WHERE code = 'LIABILITIES-CURRENT' AND organisation_id IS NULL;

INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
SELECT 'REVENUE-COURT', 'Court Revenue', 'revenue', 'credit', id, 1, 1, NULL, 'Level 3 — Fixed'
  FROM chart_of_accounts WHERE code = 'REVENUE-OPERATING' AND organisation_id IS NULL;

INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
SELECT 'REVENUE-CONTRA', 'Revenue Contra', 'contra_revenue', 'debit', id, 1, 1, NULL, 'Level 3 — Fixed'
  FROM chart_of_accounts WHERE code = 'REVENUE-OPERATING' AND organisation_id IS NULL;

INSERT IGNORE INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
SELECT 'EXPENSES-GENERAL', 'Operating Expenses', 'expense', 'debit', id, 1, 1, NULL, 'Level 3 — Fixed'
  FROM chart_of_accounts WHERE code = 'EXPENSES-OPERATING' AND organisation_id IS NULL;

-- ── Set parent_id on existing Level-4 system accounts ──
-- Assets
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM (SELECT id FROM chart_of_accounts WHERE code = 'ASSETS-CASH' AND organisation_id IS NULL) AS t)
  WHERE code = '1120' AND organisation_id IS NULL AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM (SELECT id FROM chart_of_accounts WHERE code = 'ASSETS-CLEARING' AND organisation_id IS NULL) AS t)
  WHERE code IN ('1100', '1130') AND organisation_id IS NULL AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM (SELECT id FROM chart_of_accounts WHERE code = 'ASSETS-RECEIVABLES' AND organisation_id IS NULL) AS t)
  WHERE code IN ('1140', '1150', '1160') AND organisation_id IS NULL AND parent_id IS NULL;

-- Liabilities
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM (SELECT id FROM chart_of_accounts WHERE code = 'LIABILITIES-WALLET' AND organisation_id IS NULL) AS t)
  WHERE code = '2100' AND organisation_id IS NULL AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM (SELECT id FROM chart_of_accounts WHERE code = 'LIABILITIES-PAYABLES' AND organisation_id IS NULL) AS t)
  WHERE code IN ('2200', '2400') AND organisation_id IS NULL AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM (SELECT id FROM chart_of_accounts WHERE code = 'LIABILITIES-TAX' AND organisation_id IS NULL) AS t)
  WHERE code = '2300' AND organisation_id IS NULL AND parent_id IS NULL;

-- Revenue
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM (SELECT id FROM chart_of_accounts WHERE code = 'REVENUE-COURT' AND organisation_id IS NULL) AS t)
  WHERE code = '4100' AND organisation_id IS NULL AND parent_id IS NULL;

UPDATE chart_of_accounts SET parent_id = (SELECT id FROM (SELECT id FROM chart_of_accounts WHERE code = 'REVENUE-CONTRA' AND organisation_id IS NULL) AS t)
  WHERE code IN ('4200', '4300') AND organisation_id IS NULL AND parent_id IS NULL;

-- Expenses
UPDATE chart_of_accounts SET parent_id = (SELECT id FROM (SELECT id FROM chart_of_accounts WHERE code = 'EXPENSES-GENERAL' AND organisation_id IS NULL) AS t)
  WHERE code IN ('5100', '5200') AND organisation_id IS NULL AND parent_id IS NULL;
