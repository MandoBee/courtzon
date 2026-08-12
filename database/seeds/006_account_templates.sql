-- CourtZon Default Account Templates
-- Seeds 3 system templates: Sports Club, Sports Club + Academy, Sports Club + Marketplace

-- ── 1. Standard Sports Club ──
INSERT IGNORE INTO account_templates (id, template_key, name, description, scope, is_active) VALUES
(1, 'sports_club', 'Standard Sports Club', 'Core accounts for sports club operations: courts, basic revenue and expenses', 'system', 1);

INSERT IGNORE INTO account_template_lines (template_id, l3_parent_code, code, name, account_type, normal_side, is_postable, display_order, description) VALUES
(1, 'REVENUE-COURT', 'COURT-REV', 'Court Booking Revenue', 'revenue', 'credit', 1, 10, 'Revenue from court bookings'),
(1, 'REVENUE-COURT', 'COURT-REV-CONTRA', 'Court Booking Refunds', 'contra_revenue', 'debit', 1, 20, 'Refund reversals for court bookings'),
(1, 'EXPENSES-GENERAL', 'RENT-EXP', 'Rent Expense', 'expense', 'debit', 1, 30, 'Facility rental expense'),
(1, 'EXPENSES-GENERAL', 'UTIL-EXP', 'Utilities Expense', 'expense', 'debit', 1, 40, 'Electricity, water, internet'),
(1, 'EXPENSES-GENERAL', 'MAINT-EXP', 'Maintenance Expense', 'expense', 'debit', 1, 50, 'Court/facility maintenance'),
(1, 'ASSETS-CASH', 'COURT-CASH', 'Operating Cash', 'asset', 'debit', 1, 60, 'Cash on hand for operations'),
(1, 'LIABILITIES-PAYABLES', 'COURT-PAY', 'Org Payables', 'liability', 'credit', 1, 70, 'Amounts owed for operations');

-- ── 2. Sports Club + Academy ──
INSERT IGNORE INTO account_templates (id, template_key, name, description, scope, is_active) VALUES
(2, 'sports_club_academy', 'Sports Club + Academy', 'Accounts for sports club with academy/coaching operations', 'system', 1);

INSERT IGNORE INTO account_template_lines (template_id, l3_parent_code, code, name, account_type, normal_side, is_postable, display_order, description) VALUES
(2, 'REVENUE-COURT', 'COURT-REV', 'Court Booking Revenue', 'revenue', 'credit', 1, 10, 'Revenue from court bookings'),
(2, 'REVENUE-COURT', 'COURT-REV-CONTRA', 'Court Booking Refunds', 'contra_revenue', 'debit', 1, 20, 'Refund reversals for court bookings'),
(2, 'REVENUE-COURT', 'ACAD-REV', 'Academy & Coaching Revenue', 'revenue', 'credit', 1, 30, 'Revenue from academy sessions and coaching'),
(2, 'EXPENSES-GENERAL', 'RENT-EXP', 'Rent Expense', 'expense', 'debit', 1, 40, 'Facility rental expense'),
(2, 'EXPENSES-GENERAL', 'UTIL-EXP', 'Utilities Expense', 'expense', 'debit', 1, 50, 'Electricity, water, internet'),
(2, 'EXPENSES-GENERAL', 'MAINT-EXP', 'Maintenance Expense', 'expense', 'debit', 1, 60, 'Court/facility maintenance'),
(2, 'EXPENSES-GENERAL', 'COACH-EXP', 'Coaching Expense', 'expense', 'debit', 1, 70, 'Coach compensation and coaching costs'),
(2, 'EXPENSES-GENERAL', 'SALARY-EXP', 'Salary Expense', 'expense', 'debit', 1, 75, 'Staff salary expense'),
(2, 'LIABILITIES-PAYABLES', 'SALARY-PAY', 'Salary Payable', 'liability', 'credit', 1, 80, 'Accrued salary amounts owed'),
(2, 'ASSETS-CASH', 'COURT-CASH', 'Operating Cash', 'asset', 'debit', 1, 90, 'Cash on hand for operations');

-- ── 3. Sports Club + Marketplace ──
INSERT IGNORE INTO account_templates (id, template_key, name, description, scope, is_active) VALUES
(3, 'sports_club_marketplace', 'Sports Club + Marketplace', 'Accounts for sports club with marketplace/inventory operations', 'system', 1);

INSERT IGNORE INTO account_template_lines (template_id, l3_parent_code, code, name, account_type, normal_side, is_postable, display_order, description) VALUES
(3, 'REVENUE-COURT', 'COURT-REV', 'Court Booking Revenue', 'revenue', 'credit', 1, 10, 'Revenue from court bookings'),
(3, 'REVENUE-COURT', 'COURT-REV-CONTRA', 'Court Booking Refunds', 'contra_revenue', 'debit', 1, 20, 'Refund reversals for court bookings'),
(3, 'REVENUE-COURT', 'MKT-REV', 'Marketplace Revenue', 'revenue', 'credit', 1, 30, 'Revenue from marketplace product sales'),
(3, 'REVENUE-COURT', 'MKT-REV-CONTRA', 'Cost of Revenue', 'contra_revenue', 'debit', 1, 40, 'Marketplace cost of revenue'),
(3, 'EXPENSES-GENERAL', 'RENT-EXP', 'Rent Expense', 'expense', 'debit', 1, 50, 'Facility rental expense'),
(3, 'EXPENSES-GENERAL', 'UTIL-EXP', 'Utilities Expense', 'expense', 'debit', 1, 60, 'Electricity, water, internet'),
(3, 'EXPENSES-GENERAL', 'MAINT-EXP', 'Maintenance Expense', 'expense', 'debit', 1, 70, 'Court/facility maintenance'),
(3, 'ASSETS-CASH', 'COURT-CASH', 'Operating Cash', 'asset', 'debit', 1, 80, 'Cash on hand for operations'),
(3, 'LIABILITIES-PAYABLES', 'COURT-PAY', 'Org Payables', 'liability', 'credit', 1, 90, 'Amounts owed for operations');
