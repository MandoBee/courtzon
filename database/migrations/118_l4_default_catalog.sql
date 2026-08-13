-- 118_l4_default_catalog.sql
-- Expand Level 4 into a comprehensive DEFAULT account catalog for the
-- CourtZon platform + sports-club domain.
--
-- L1/L2/L3 structural accounts are system-owned and unchanged. This migration
-- only ADDS new L4 (postable) accounts as GLOBAL DEFAULTS (organisation_id NULL).
--
-- Design rules:
--   * Existing system-required L4 accounts (1100, 1120, 1130, 1140, 1150, 1160,
--     2100, 2200, 2300, 2400, 3100, 4100, 4200, 4300, 5100, 5200, 5300,
--     INPUT-TAX) are UNTOUCHED — default event mappings still reference them.
--   * New accounts are is_system = 0 (defaults the platform admin may rename or
--     deactivate) and organisation_id = NULL (shared default catalog).
--   * Organisations customise their view of these defaults via the
--     organisation_coa_customizations overlay (migration 119), never by editing
--     the global row.
--   * Generic symbolic names are used (Bank 2, Payment Gateway 1, …) so an
--     organisation can rename its local copy to a real institution name.
--
-- Idempotent: INSERT IGNORE + parent lookup by code.

-- ── ASSETS → Cash & Bank (ASSETS-CASH) ──
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '1121', 'Bank 2', 'asset', 'debit', id, 0, 1, 'Secondary bank account'
  FROM chart_of_accounts WHERE code = 'ASSETS-CASH' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '1122', 'Bank 3', 'asset', 'debit', id, 0, 1, 'Tertiary bank account'
  FROM chart_of_accounts WHERE code = 'ASSETS-CASH' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '1125', 'Cash Register 1', 'asset', 'debit', id, 0, 1, 'Reception / front-desk cash register'
  FROM chart_of_accounts WHERE code = 'ASSETS-CASH' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '1126', 'Cash Register 2', 'asset', 'debit', id, 0, 1, 'Secondary cash register'
  FROM chart_of_accounts WHERE code = 'ASSETS-CASH' AND organisation_id IS NULL;

-- ── ASSETS → Clearing Accounts (ASSETS-CLEARING) ──
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '1110', 'Payment Gateway 1', 'asset', 'debit', id, 0, 1, 'Funds receivable from primary payment gateway'
  FROM chart_of_accounts WHERE code = 'ASSETS-CLEARING' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '1111', 'Payment Gateway 2', 'asset', 'debit', id, 0, 1, 'Funds receivable from secondary payment gateway'
  FROM chart_of_accounts WHERE code = 'ASSETS-CLEARING' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '1135', 'Refund Clearing', 'asset', 'debit', id, 0, 1, 'Pending refunds in transit through the gateway'
  FROM chart_of_accounts WHERE code = 'ASSETS-CLEARING' AND organisation_id IS NULL;

-- ── ASSETS → Receivables (ASSETS-RECEIVABLES) ──
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '1161', 'Marketplace Receivable', 'asset', 'debit', id, 0, 1, 'COD commission receivable from marketplace merchants'
  FROM chart_of_accounts WHERE code = 'ASSETS-RECEIVABLES' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '1170', 'Staff / Employee Receivable', 'asset', 'debit', id, 0, 1, 'Advances and amounts receivable from staff'
  FROM chart_of_accounts WHERE code = 'ASSETS-RECEIVABLES' AND organisation_id IS NULL;

-- ── LIABILITIES → Payables (LIABILITIES-PAYABLES) ──
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '2201', 'Coach Payable', 'liability', 'credit', id, 0, 1, 'Amounts owed to coaches for completed sessions'
  FROM chart_of_accounts WHERE code = 'LIABILITIES-PAYABLES' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '2202', 'Merchant Payable', 'liability', 'credit', id, 0, 1, 'Amounts owed to marketplace merchants'
  FROM chart_of_accounts WHERE code = 'LIABILITIES-PAYABLES' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '2450', 'Settlement Payable', 'liability', 'credit', id, 0, 1, 'Net settlement amounts owed to organisations'
  FROM chart_of_accounts WHERE code = 'LIABILITIES-PAYABLES' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '2600', 'Refund Liability', 'liability', 'credit', id, 0, 1, 'Customer refunds approved but not yet settled'
  FROM chart_of_accounts WHERE code = 'LIABILITIES-PAYABLES' AND organisation_id IS NULL;

-- ── LIABILITIES → Tax (LIABILITIES-TAX) ──
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '2310', 'Withholding Tax Payable', 'liability', 'credit', id, 0, 1, 'Withholding tax collected and owed to the authority'
  FROM chart_of_accounts WHERE code = 'LIABILITIES-TAX' AND organisation_id IS NULL;

-- ── REVENUE → Court Revenue (REVENUE-COURT) ──
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4110', 'Court Booking Revenue', 'revenue', 'credit', id, 0, 1, 'Revenue from court bookings'
  FROM chart_of_accounts WHERE code = 'REVENUE-COURT' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4120', 'Academy Revenue', 'revenue', 'credit', id, 0, 1, 'Revenue from academy programs and courses'
  FROM chart_of_accounts WHERE code = 'REVENUE-COURT' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4130', 'Coaching Revenue', 'revenue', 'credit', id, 0, 1, 'Revenue from coaching sessions'
  FROM chart_of_accounts WHERE code = 'REVENUE-COURT' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4140', 'Tournament / Event Revenue', 'revenue', 'credit', id, 0, 1, 'Revenue from tournaments and events'
  FROM chart_of_accounts WHERE code = 'REVENUE-COURT' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4150', 'Membership Revenue', 'revenue', 'credit', id, 0, 1, 'Revenue from memberships and subscriptions'
  FROM chart_of_accounts WHERE code = 'REVENUE-COURT' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4160', 'Marketplace Revenue', 'revenue', 'credit', id, 0, 1, 'Revenue recognised from marketplace operations'
  FROM chart_of_accounts WHERE code = 'REVENUE-COURT' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4170', 'Platform / Subscription Revenue', 'revenue', 'credit', id, 0, 1, 'Platform subscription and SaaS fees'
  FROM chart_of_accounts WHERE code = 'REVENUE-COURT' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4180', 'Commission Revenue', 'revenue', 'credit', id, 0, 1, 'CourtZon commission and service fees'
  FROM chart_of_accounts WHERE code = 'REVENUE-COURT' AND organisation_id IS NULL;

-- ── CONTRA REVENUE → Revenue Contra (REVENUE-CONTRA) ──
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4310', 'Booking Refunds', 'contra_revenue', 'debit', id, 0, 1, 'Refund reversals of booking revenue'
  FROM chart_of_accounts WHERE code = 'REVENUE-CONTRA' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4320', 'Discounts', 'contra_revenue', 'debit', id, 0, 1, 'Discounts and promotions applied to sales'
  FROM chart_of_accounts WHERE code = 'REVENUE-CONTRA' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4330', 'Credits', 'contra_revenue', 'debit', id, 0, 1, 'Customer credits and allowances'
  FROM chart_of_accounts WHERE code = 'REVENUE-CONTRA' AND organisation_id IS NULL;

-- ── EXPENSES → Operating Expenses (EXPENSES-GENERAL) ──
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '5210', 'Payment Gateway Fees', 'expense', 'debit', id, 0, 1, 'Fees charged by payment gateways'
  FROM chart_of_accounts WHERE code = 'EXPENSES-GENERAL' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '5220', 'Refund / Chargeback Costs', 'expense', 'debit', id, 0, 1, 'Costs arising from refunds and chargebacks'
  FROM chart_of_accounts WHERE code = 'EXPENSES-GENERAL' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '5230', 'Marketing Expense', 'expense', 'debit', id, 0, 1, 'Marketing and advertising costs'
  FROM chart_of_accounts WHERE code = 'EXPENSES-GENERAL' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '5240', 'Rent / Facility Expense', 'expense', 'debit', id, 0, 1, 'Facility rent and occupancy costs'
  FROM chart_of_accounts WHERE code = 'EXPENSES-GENERAL' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '5250', 'Utilities Expense', 'expense', 'debit', id, 0, 1, 'Electricity, water and internet'
  FROM chart_of_accounts WHERE code = 'EXPENSES-GENERAL' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '5260', 'Maintenance Expense', 'expense', 'debit', id, 0, 1, 'Court and facility maintenance'
  FROM chart_of_accounts WHERE code = 'EXPENSES-GENERAL' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '5270', 'Coaching Expense', 'expense', 'debit', id, 0, 1, 'Coach compensation for delivered sessions'
  FROM chart_of_accounts WHERE code = 'EXPENSES-GENERAL' AND organisation_id IS NULL;
