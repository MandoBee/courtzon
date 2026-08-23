-- Default Chart of Accounts + Accounting Event Mappings
-- Seed for Simple Mode (organisation_id = NULL for global defaults)
-- Architecture Decision #2 — LOCKED

-- ── Default Chart of Accounts (platform-global) ──

INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, is_system, is_active, description) VALUES
(NULL, '1100', 'Payment Clearing', 'asset', 'debit', 1, 1, 'Funds in transit through payment gateway'),
(NULL, '1120', 'Cash / Bank', 'asset', 'debit', 1, 1, 'Platform bank accounts'),
(NULL, '1130', 'Withdrawal Clearing', 'asset', 'debit', 1, 1, 'Funds held for pending payouts'),
(NULL, '1140', 'Accounts Receivable', 'asset', 'debit', 1, 1, 'Trade receivables from customers/orgs'),
(NULL, '1150', 'Branch Receivable', 'asset', 'debit', 1, 1, 'Amounts receivable from branches (COD collections)'),
(NULL, '1160', 'Receivable from Org', 'asset', 'debit', 1, 1, 'Net amounts org owes CourtZon'),
(NULL, '2100', 'Customer Wallet Liability', 'liability', 'credit', 1, 1, 'Platform owes this to wallet holders'),
(NULL, '2200', 'Org Payable', 'liability', 'credit', 1, 1, 'CourtZon owes this to organizations (settlements)'),
(NULL, '2300', 'Tax Liability', 'liability', 'credit', 1, 1, 'Tax collected, owed to tax authority'),
(NULL, '4100', 'Court Revenue', 'revenue', 'credit', 1, 1, 'Booking, marketplace, and service revenue'),
(NULL, '4200', 'Cost of Revenue', 'contra_revenue', 'debit', 1, 1, 'Revenue share owed to organizations'),
(NULL, '4300', 'Revenue Contra', 'contra_revenue', 'debit', 1, 1, 'Refund reversals of recognized revenue'),
(NULL, '5100', 'Bad Debt', 'expense', 'debit', 1, 1, 'Written-off failed/declined payments'),
(NULL, '5300', 'Salary Expense', 'expense', 'debit', 1, 1, 'Employee salaries and wages');

-- ── Default Accounting Event Mappings (Simple Mode: org_id = NULL) ──

-- 1. wallet_topup
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'wallet_topup', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1100';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'wallet_topup', NULL, 'wallet_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2100';

-- 2. card_payment
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'card_payment', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1100';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'card_payment', NULL, 'revenue', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100';

-- 3. wallet_payment
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'wallet_payment', NULL, 'wallet_liability_spend', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2100';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'wallet_payment', NULL, 'revenue', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100';

-- 4. card_refund
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'card_refund', NULL, 'revenue_contra', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4300';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'card_refund', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1100';

-- 5. wallet_refund
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'wallet_refund', NULL, 'revenue_contra', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4300';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'wallet_refund', NULL, 'wallet_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2100';

-- 6. cod_payment
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'cod_payment', NULL, 'cash_receivable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1150';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'cod_payment', NULL, 'revenue', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100';

-- 7. marketplace_delivery (COD — commission receivable from merchant)
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_delivery', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1160';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_delivery', NULL, 'platform_commission', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_delivery', NULL, 'tax_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2300';

-- 8. marketplace_reversal (COD — commission receivable reversed)
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_reversal', NULL, 'platform_commission', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_reversal', NULL, 'tax_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2300';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_reversal', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1160';

-- 9. withdrawal_request
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'withdrawal_request', NULL, 'wallet_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2100';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'withdrawal_request', NULL, 'withdrawal_clearing', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1130';

-- 10. withdrawal_completion
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'withdrawal_completion', NULL, 'withdrawal_clearing', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1130';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'withdrawal_completion', NULL, 'cash_bank', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1120';

-- 11. settlement_paid (courtzon_to_org direction)
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid', NULL, 'org_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid', NULL, 'cash_bank', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1120';
-- settlement_paid org_to_courtzon direction (alternate concepts)
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_otc', NULL, 'cash_bank', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1120';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_otc', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1160';

-- 11b. settlement offset (explicit net-down: clear full payable + full receivable against net cash)
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_offset', NULL, 'org_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_offset', NULL, 'cash_bank', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1120';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_offset', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1160';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_otc_offset', NULL, 'cash_bank', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1120';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_otc_offset', NULL, 'org_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_otc_offset', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1160';

-- 12. payment_failure
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'payment_failure', NULL, 'bad_debt', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '5100';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'payment_failure', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1100';

-- 13. invoice_issue (2-line default: tax embedded in Revenue)
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'invoice_issue', NULL, 'receivable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1140'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'invoice_issue' AND organisation_id IS NULL AND concept = 'receivable' AND is_active = 1);
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'invoice_issue', NULL, 'revenue', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'invoice_issue' AND organisation_id IS NULL AND concept = 'revenue' AND is_active = 1);
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'invoice_issue', NULL, 'tax_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'invoice_issue' AND organisation_id IS NULL AND concept = 'tax_liability' AND is_active = 1);

-- 14. invoice_payment
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'invoice_payment', NULL, 'cash_bank', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'invoice_payment' AND organisation_id IS NULL AND concept = 'cash_bank' AND is_active = 1);
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'invoice_payment', NULL, 'receivable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1140'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'invoice_payment' AND organisation_id IS NULL AND concept = 'receivable' AND is_active = 1);

-- 15. invoice_cancel (with tax_liability reversal for Advanced Mode)
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'invoice_cancel', NULL, 'revenue', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'invoice_cancel' AND organisation_id IS NULL AND concept = 'revenue' AND is_active = 1);
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'invoice_cancel', NULL, 'receivable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1140'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'invoice_cancel' AND organisation_id IS NULL AND concept = 'receivable' AND is_active = 1);
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'invoice_cancel', NULL, 'tax_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'invoice_cancel' AND organisation_id IS NULL AND concept = 'tax_liability' AND is_active = 1);

-- 16. input_tax for purchase invoices
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'purchase_invoice_issue', NULL, 'input_tax', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = 'INPUT-TAX'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'purchase_invoice_issue' AND organisation_id IS NULL AND concept = 'input_tax' AND is_active = 1);
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'purchase_invoice_cancel', NULL, 'input_tax', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = 'INPUT-TAX'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'purchase_invoice_cancel' AND organisation_id IS NULL AND concept = 'input_tax' AND is_active = 1);

-- 15. payroll_post
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'payroll_post', NULL, 'salary_expense', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '5300';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'payroll_post', NULL, 'salary_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200';

-- 16. year_close (prevent duplicates with NULL organisation_id via dual-key check)
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'year_close', NULL, 'retained_earnings', id, 1
FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '3100'
AND NOT EXISTS (
  SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'year_close' AND organisation_id IS NULL AND concept = 'retained_earnings'
);

-- 17. booking accounting concepts (card / wallet / cod / coach / refund)
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_card_payment', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_card_payment' AND organisation_id IS NULL AND concept = 'payment_clearing');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_card_payment', NULL, 'org_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_card_payment' AND organisation_id IS NULL AND concept = 'org_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_card_payment', NULL, 'platform_commission', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_card_payment' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_card_payment', NULL, 'tax_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_card_payment' AND organisation_id IS NULL AND concept = 'tax_liability');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_payment', NULL, 'wallet_liability_spend', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_wallet_payment' AND organisation_id IS NULL AND concept = 'wallet_liability_spend');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_payment', NULL, 'org_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_wallet_payment' AND organisation_id IS NULL AND concept = 'org_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_payment', NULL, 'platform_commission', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_wallet_payment' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_payment', NULL, 'tax_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_wallet_payment' AND organisation_id IS NULL AND concept = 'tax_liability');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_payment', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_cod_payment' AND organisation_id IS NULL AND concept = 'receivable_from_org');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_payment', NULL, 'platform_commission', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_cod_payment' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_payment', NULL, 'tax_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_cod_payment' AND organisation_id IS NULL AND concept = 'tax_liability');

-- booking_cod_reversal (reverse COD economics: commission + tax vs receivable)
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_reversal', NULL, 'platform_commission', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_cod_reversal' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_reversal', NULL, 'tax_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_cod_reversal' AND organisation_id IS NULL AND concept = 'tax_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_reversal', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_cod_reversal' AND organisation_id IS NULL AND concept = 'receivable_from_org');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_payout', NULL, 'coach_expense', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '5200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_coach_payout' AND organisation_id IS NULL AND concept = 'coach_expense');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_payout', NULL, 'coach_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_coach_payout' AND organisation_id IS NULL AND concept = 'coach_payable');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_reversal', NULL, 'coach_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_coach_reversal' AND organisation_id IS NULL AND concept = 'coach_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_reversal', NULL, 'coach_expense', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '5200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_coach_reversal' AND organisation_id IS NULL AND concept = 'coach_expense');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_refund', NULL, 'org_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_refund' AND organisation_id IS NULL AND concept = 'org_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_refund', NULL, 'platform_commission', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_refund' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_refund', NULL, 'tax_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_refund' AND organisation_id IS NULL AND concept = 'tax_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_refund', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_refund' AND organisation_id IS NULL AND concept = 'payment_clearing');

-- 18. post-settlement recovery (coach + org) — receivable accounts
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_recovery', NULL, 'coach_recovery_receivable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_coach_recovery' AND organisation_id IS NULL AND concept = 'coach_recovery_receivable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_recovery', NULL, 'coach_expense', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '5200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_coach_recovery' AND organisation_id IS NULL AND concept = 'coach_expense');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_org_recovery', NULL, 'org_recovery_receivable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_org_recovery' AND organisation_id IS NULL AND concept = 'org_recovery_receivable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_org_recovery', NULL, 'org_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_org_recovery' AND organisation_id IS NULL AND concept = 'org_payable');

-- 19. booking settlement (coach + org): clear payable against cash
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_settlement', NULL, 'coach_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_coach_settlement' AND organisation_id IS NULL AND concept = 'coach_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_settlement', NULL, 'cash_bank', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_coach_settlement' AND organisation_id IS NULL AND concept = 'cash_bank');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_org_settlement', NULL, 'org_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_org_settlement' AND organisation_id IS NULL AND concept = 'org_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_org_settlement', NULL, 'cash_bank', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_org_settlement' AND organisation_id IS NULL AND concept = 'cash_bank');

-- 20. recovery collection: cash against recovery receivable
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_recovery_collection', NULL, 'cash_bank', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_recovery_collection' AND organisation_id IS NULL AND concept = 'cash_bank');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_recovery_collection', NULL, 'recovery_receivable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1140'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_recovery_collection' AND organisation_id IS NULL AND concept = 'recovery_receivable');

-- 21. settlement with recovery offset (coach + org)
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_settlement_offset', NULL, 'coach_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_coach_settlement_offset' AND organisation_id IS NULL AND concept = 'coach_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_settlement_offset', NULL, 'cash_bank', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_coach_settlement_offset' AND organisation_id IS NULL AND concept = 'cash_bank');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_settlement_offset', NULL, 'coach_recovery_receivable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_coach_settlement_offset' AND organisation_id IS NULL AND concept = 'coach_recovery_receivable');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_org_settlement_offset', NULL, 'org_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_org_settlement_offset' AND organisation_id IS NULL AND concept = 'org_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_org_settlement_offset', NULL, 'cash_bank', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_org_settlement_offset' AND organisation_id IS NULL AND concept = 'cash_bank');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_org_settlement_offset', NULL, 'org_recovery_receivable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_org_settlement_offset' AND organisation_id IS NULL AND concept = 'org_recovery_receivable');

-- 22. Marketplace custody (merchant payable vs CourtZon commission vs tax)
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_card_payment', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_card_payment' AND organisation_id IS NULL AND concept = 'payment_clearing');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_card_payment', NULL, 'merchant_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_card_payment' AND organisation_id IS NULL AND concept = 'merchant_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_card_payment', NULL, 'platform_commission', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_card_payment' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_card_payment', NULL, 'tax_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_card_payment' AND organisation_id IS NULL AND concept = 'tax_liability');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_payment', NULL, 'wallet_liability_spend', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_wallet_payment' AND organisation_id IS NULL AND concept = 'wallet_liability_spend');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_payment', NULL, 'merchant_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_wallet_payment' AND organisation_id IS NULL AND concept = 'merchant_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_payment', NULL, 'platform_commission', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_wallet_payment' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_payment', NULL, 'tax_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_wallet_payment' AND organisation_id IS NULL AND concept = 'tax_liability');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_merchant_refund', NULL, 'merchant_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_merchant_refund' AND organisation_id IS NULL AND concept = 'merchant_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_merchant_refund', NULL, 'platform_commission', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_merchant_refund' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_merchant_refund', NULL, 'tax_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_merchant_refund' AND organisation_id IS NULL AND concept = 'tax_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_merchant_refund', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_merchant_refund' AND organisation_id IS NULL AND concept = 'payment_clearing');

-- 23. Referee / Provider compensation (universal provider parties)
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'referee_payout', NULL, 'referee_expense', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '5200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'referee_payout' AND organisation_id IS NULL AND concept = 'referee_expense');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'referee_payout', NULL, 'referee_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'referee_payout' AND organisation_id IS NULL AND concept = 'referee_payable');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'provider_payout', NULL, 'provider_expense', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '5200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'provider_payout' AND organisation_id IS NULL AND concept = 'provider_expense');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'provider_payout', NULL, 'provider_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'provider_payout' AND organisation_id IS NULL AND concept = 'provider_payable');

-- 24. subscription_cash_payment — cash subscription collected via admin approval
-- (admin confirmation of an offline cash subscription is the collection evidence)
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'subscription_cash_payment', NULL, 'cash_bank', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'subscription_cash_payment' AND organisation_id IS NULL AND concept = 'cash_bank');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'subscription_cash_payment', NULL, 'revenue', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'subscription_cash_payment' AND organisation_id IS NULL AND concept = 'revenue');
