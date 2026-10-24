-- Standard Chart of Accounts
-- parent_id is resolved by account code after insertion. The baseline table is
-- declared AUTO_INCREMENT=6303, so hard-coded numeric ids are not stable.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

START TRANSACTION;
INSERT INTO chart_of_accounts (code, name, type, description) VALUES
('1000', 'Assets', 'asset', 'Total Assets'),
('1100', 'Current Assets', 'asset', 'Current Assets'),
('1101', 'Cash', 'asset', 'Cash on hand and in banks'),
('1102', 'Accounts Receivable', 'asset', 'Customer receivables'),
('1103', 'Inventory', 'asset', 'Product inventory'),
('1200', 'Fixed Assets', 'asset', 'Fixed Assets'),
('2000', 'Liabilities', 'liability', 'Total Liabilities'),
('2100', 'Current Liabilities', 'liability', 'Current Liabilities'),
('2101', 'Accounts Payable', 'liability', 'Supplier payables'),
('2102', 'Tax Payable', 'liability', 'Sales tax / VAT payable'),
('2200', 'Long-term Liabilities', 'liability', 'Long-term Liabilities'),
('3000', 'Equity', 'equity', 'Shareholder Equity'),
('3001', 'Retained Earnings', 'equity', 'Retained earnings'),
('4000', 'Revenue', 'revenue', 'Operating Revenue'),
('4100', 'Sales Revenue', 'revenue', 'Product sales revenue'),
('4101', 'Booking Revenue', 'revenue', 'Court booking revenue'),
('4102', 'Membership Revenue', 'revenue', 'Membership fees'),
('4103', 'Academy Revenue', 'revenue', 'Academy program revenue'),
('5000', 'Cost of Goods Sold', 'expense', 'COGS'),
('6000', 'Operating Expenses', 'expense', 'Operating Expenses'),
('6100', 'Salaries', 'expense', 'Employee salaries'),
('6200', 'Rent', 'expense', 'Rent expense'),
('6300', 'Utilities', 'expense', 'Utility expenses');

-- 4100 is a revenue account. Seed 005 uses INSERT IGNORE and therefore cannot
-- repair the row created above, so set its natural side here for genuinely
-- fresh or restored databases. Only NULL is filled: a manually maintained
-- value is never overwritten, and organisation-owned accounts are untouched.
UPDATE chart_of_accounts
SET normal_side = 'credit'
WHERE organisation_id IS NULL
  AND code = '4100'
  AND type = 'revenue'
  AND normal_side IS NULL;

-- Resolve parents by code (platform-global accounts only; roots stay NULL).
-- 3001 must sit under 3000 (Equity); 4100-4103 must sit under 4000 (Revenue).
UPDATE chart_of_accounts c
JOIN (
  SELECT '1100' AS code, '1000' AS parent_code
  UNION ALL SELECT '1101', '1100'
  UNION ALL SELECT '1102', '1100'
  UNION ALL SELECT '1103', '1100'
  UNION ALL SELECT '1200', '1000'
  UNION ALL SELECT '2100', '2000'
  UNION ALL SELECT '2101', '2100'
  UNION ALL SELECT '2102', '2100'
  UNION ALL SELECT '2200', '2000'
  UNION ALL SELECT '3001', '3000'
  UNION ALL SELECT '4100', '4000'
  UNION ALL SELECT '4101', '4000'
  UNION ALL SELECT '4102', '4000'
  UNION ALL SELECT '4103', '4000'
  UNION ALL SELECT '6100', '6000'
  UNION ALL SELECT '6200', '6000'
  UNION ALL SELECT '6300', '6000'
) m ON m.code = c.code
JOIN chart_of_accounts p ON p.code = m.parent_code AND p.organisation_id IS NULL
SET c.parent_id = p.id
WHERE c.organisation_id IS NULL;

COMMIT;
