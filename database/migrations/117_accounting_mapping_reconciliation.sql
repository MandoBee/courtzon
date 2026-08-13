-- 117_accounting_mapping_reconciliation.sql
-- Reconciles the platform-global Chart of Accounts + Accounting Event Mapping Lines
-- to the canonical reference state (seeds 005 + migrations 113/114/115).
--
-- Drift found: production was missing 8 leaf accounts and 97 mapping lines
-- (booking/marketplace/wallet/card/cod/settlement/withdrawal events), which made
-- the accounting engine throw "Concept 'X' not found in resolved mapping" for
-- those events.
--
-- Idempotent: every statement guards on NOT EXISTS / INSERT IGNORE so it is
-- safe to run on any environment regardless of current state.

-- ── 1. Missing leaf accounts ──
INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '1100', 'Payment Clearing', 'asset', 'debit', p.id, 1, 1, NULL
FROM chart_of_accounts p WHERE p.code = 'ASSETS-CLEARING' AND p.organisation_id IS NULL
AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.code = '1100' AND x.organisation_id IS NULL);
INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '1130', 'Withdrawal Clearing', 'asset', 'debit', p.id, 1, 1, NULL
FROM chart_of_accounts p WHERE p.code = 'ASSETS-CLEARING' AND p.organisation_id IS NULL
AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.code = '1130' AND x.organisation_id IS NULL);
INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '1150', 'Branch Receivable', 'asset', 'debit', p.id, 1, 1, NULL
FROM chart_of_accounts p WHERE p.code = 'ASSETS-RECEIVABLES' AND p.organisation_id IS NULL
AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.code = '1150' AND x.organisation_id IS NULL);
INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '1160', 'Receivable from Org', 'asset', 'debit', p.id, 1, 1, NULL
FROM chart_of_accounts p WHERE p.code = 'ASSETS-RECEIVABLES' AND p.organisation_id IS NULL
AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.code = '1160' AND x.organisation_id IS NULL);
INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '2100', 'Customer Wallet Liability', 'liability', 'credit', p.id, 1, 1, NULL
FROM chart_of_accounts p WHERE p.code = 'LIABILITIES-WALLET' AND p.organisation_id IS NULL
AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.code = '2100' AND x.organisation_id IS NULL);
INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4200', 'Cost of Revenue', 'contra_revenue', 'debit', p.id, 1, 1, NULL
FROM chart_of_accounts p WHERE p.code = 'REVENUE-CONTRA' AND p.organisation_id IS NULL
AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.code = '4200' AND x.organisation_id IS NULL);
INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4300', 'Revenue Contra', 'contra_revenue', 'debit', p.id, 1, 1, NULL
FROM chart_of_accounts p WHERE p.code = 'REVENUE-CONTRA' AND p.organisation_id IS NULL
AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.code = '4300' AND x.organisation_id IS NULL);
INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '5100', 'Bad Debt', 'expense', 'debit', p.id, 1, 1, NULL
FROM chart_of_accounts p WHERE p.code = 'EXPENSES-GENERAL' AND p.organisation_id IS NULL
AND NOT EXISTS (SELECT 1 FROM chart_of_accounts x WHERE x.code = '5100' AND x.organisation_id IS NULL);

-- ── 2. Missing mapping lines ──
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_card_payment', NULL, 'org_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_card_payment' AND organisation_id IS NULL AND concept = 'org_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_card_payment', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_card_payment' AND organisation_id IS NULL AND concept = 'payment_clearing');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_card_payment', NULL, 'platform_commission', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_card_payment' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_card_payment', NULL, 'tax_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_card_payment' AND organisation_id IS NULL AND concept = 'tax_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_payout', NULL, 'coach_expense', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '5200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_coach_payout' AND organisation_id IS NULL AND concept = 'coach_expense');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_payout', NULL, 'coach_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_coach_payout' AND organisation_id IS NULL AND concept = 'coach_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_recovery', NULL, 'coach_expense', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '5200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_coach_recovery' AND organisation_id IS NULL AND concept = 'coach_expense');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_recovery', NULL, 'coach_recovery_receivable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_coach_recovery' AND organisation_id IS NULL AND concept = 'coach_recovery_receivable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_reversal', NULL, 'coach_expense', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '5200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_coach_reversal' AND organisation_id IS NULL AND concept = 'coach_expense');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_reversal', NULL, 'coach_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_coach_reversal' AND organisation_id IS NULL AND concept = 'coach_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_settlement', NULL, 'cash_bank', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_coach_settlement' AND organisation_id IS NULL AND concept = 'cash_bank');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_settlement', NULL, 'coach_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_coach_settlement' AND organisation_id IS NULL AND concept = 'coach_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_settlement_offset', NULL, 'cash_bank', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_coach_settlement_offset' AND organisation_id IS NULL AND concept = 'cash_bank');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_settlement_offset', NULL, 'coach_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_coach_settlement_offset' AND organisation_id IS NULL AND concept = 'coach_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_coach_settlement_offset', NULL, 'coach_recovery_receivable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_coach_settlement_offset' AND organisation_id IS NULL AND concept = 'coach_recovery_receivable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_payment', NULL, 'platform_commission', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_cod_payment' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_payment', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_cod_payment' AND organisation_id IS NULL AND concept = 'receivable_from_org');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_payment', NULL, 'tax_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_cod_payment' AND organisation_id IS NULL AND concept = 'tax_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_reversal', NULL, 'platform_commission', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_cod_reversal' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_reversal', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_cod_reversal' AND organisation_id IS NULL AND concept = 'receivable_from_org');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_reversal', NULL, 'tax_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_cod_reversal' AND organisation_id IS NULL AND concept = 'tax_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_org_recovery', NULL, 'org_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_org_recovery' AND organisation_id IS NULL AND concept = 'org_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_org_recovery', NULL, 'org_recovery_receivable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_org_recovery' AND organisation_id IS NULL AND concept = 'org_recovery_receivable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_org_settlement', NULL, 'cash_bank', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_org_settlement' AND organisation_id IS NULL AND concept = 'cash_bank');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_org_settlement', NULL, 'org_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_org_settlement' AND organisation_id IS NULL AND concept = 'org_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_org_settlement_offset', NULL, 'cash_bank', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_org_settlement_offset' AND organisation_id IS NULL AND concept = 'cash_bank');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_org_settlement_offset', NULL, 'org_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_org_settlement_offset' AND organisation_id IS NULL AND concept = 'org_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_org_settlement_offset', NULL, 'org_recovery_receivable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_org_settlement_offset' AND organisation_id IS NULL AND concept = 'org_recovery_receivable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_recovery_collection', NULL, 'cash_bank', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_recovery_collection' AND organisation_id IS NULL AND concept = 'cash_bank');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_recovery_collection', NULL, 'recovery_receivable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1140'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_recovery_collection' AND organisation_id IS NULL AND concept = 'recovery_receivable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_refund', NULL, 'org_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_refund' AND organisation_id IS NULL AND concept = 'org_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_refund', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_refund' AND organisation_id IS NULL AND concept = 'payment_clearing');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_refund', NULL, 'platform_commission', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_refund' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_refund', NULL, 'tax_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_refund' AND organisation_id IS NULL AND concept = 'tax_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_payment', NULL, 'org_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_wallet_payment' AND organisation_id IS NULL AND concept = 'org_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_payment', NULL, 'platform_commission', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_wallet_payment' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_payment', NULL, 'tax_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_wallet_payment' AND organisation_id IS NULL AND concept = 'tax_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_payment', NULL, 'wallet_liability_spend', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_wallet_payment' AND organisation_id IS NULL AND concept = 'wallet_liability_spend');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_refund', NULL, 'org_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_wallet_refund' AND organisation_id IS NULL AND concept = 'org_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_refund', NULL, 'platform_commission', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_wallet_refund' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_refund', NULL, 'tax_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_wallet_refund' AND organisation_id IS NULL AND concept = 'tax_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_refund', NULL, 'wallet_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'booking_wallet_refund' AND organisation_id IS NULL AND concept = 'wallet_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'card_payment', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'card_payment' AND organisation_id IS NULL AND concept = 'payment_clearing');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'card_payment', NULL, 'revenue', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'card_payment' AND organisation_id IS NULL AND concept = 'revenue');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'card_refund', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'card_refund' AND organisation_id IS NULL AND concept = 'payment_clearing');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'card_refund', NULL, 'revenue_contra', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'card_refund' AND organisation_id IS NULL AND concept = 'revenue_contra');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'cod_payment', NULL, 'cash_receivable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1150'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'cod_payment' AND organisation_id IS NULL AND concept = 'cash_receivable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'cod_payment', NULL, 'revenue', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'cod_payment' AND organisation_id IS NULL AND concept = 'revenue');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_card_payment', NULL, 'merchant_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_card_payment' AND organisation_id IS NULL AND concept = 'merchant_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_card_payment', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_card_payment' AND organisation_id IS NULL AND concept = 'payment_clearing');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_card_payment', NULL, 'platform_commission', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_card_payment' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_card_payment', NULL, 'tax_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_card_payment' AND organisation_id IS NULL AND concept = 'tax_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_delivery', NULL, 'platform_commission', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_delivery' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_delivery', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_delivery' AND organisation_id IS NULL AND concept = 'receivable_from_org');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_delivery', NULL, 'tax_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_delivery' AND organisation_id IS NULL AND concept = 'tax_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_merchant_refund', NULL, 'merchant_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_merchant_refund' AND organisation_id IS NULL AND concept = 'merchant_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_merchant_refund', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_merchant_refund' AND organisation_id IS NULL AND concept = 'payment_clearing');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_merchant_refund', NULL, 'platform_commission', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_merchant_refund' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_merchant_refund', NULL, 'tax_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_merchant_refund' AND organisation_id IS NULL AND concept = 'tax_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_reversal', NULL, 'platform_commission', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_reversal' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_reversal', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_reversal' AND organisation_id IS NULL AND concept = 'receivable_from_org');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_reversal', NULL, 'tax_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_reversal' AND organisation_id IS NULL AND concept = 'tax_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_payment', NULL, 'merchant_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_wallet_payment' AND organisation_id IS NULL AND concept = 'merchant_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_payment', NULL, 'platform_commission', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_wallet_payment' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_payment', NULL, 'tax_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_wallet_payment' AND organisation_id IS NULL AND concept = 'tax_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_payment', NULL, 'wallet_liability_spend', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_wallet_payment' AND organisation_id IS NULL AND concept = 'wallet_liability_spend');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_refund', NULL, 'merchant_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_wallet_refund' AND organisation_id IS NULL AND concept = 'merchant_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_refund', NULL, 'platform_commission', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_wallet_refund' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_refund', NULL, 'tax_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_wallet_refund' AND organisation_id IS NULL AND concept = 'tax_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_refund', NULL, 'wallet_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'marketplace_wallet_refund' AND organisation_id IS NULL AND concept = 'wallet_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'payment_failure', NULL, 'bad_debt', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '5100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'payment_failure' AND organisation_id IS NULL AND concept = 'bad_debt');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'payment_failure', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'payment_failure' AND organisation_id IS NULL AND concept = 'payment_clearing');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'provider_payout', NULL, 'provider_expense', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '5200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'provider_payout' AND organisation_id IS NULL AND concept = 'provider_expense');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'provider_payout', NULL, 'provider_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'provider_payout' AND organisation_id IS NULL AND concept = 'provider_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'referee_payout', NULL, 'referee_expense', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '5200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'referee_payout' AND organisation_id IS NULL AND concept = 'referee_expense');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'referee_payout', NULL, 'referee_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'referee_payout' AND organisation_id IS NULL AND concept = 'referee_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid', NULL, 'cash_bank', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'settlement_paid' AND organisation_id IS NULL AND concept = 'cash_bank');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid', NULL, 'org_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'settlement_paid' AND organisation_id IS NULL AND concept = 'org_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_offset', NULL, 'cash_bank', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'settlement_paid_offset' AND organisation_id IS NULL AND concept = 'cash_bank');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_offset', NULL, 'org_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'settlement_paid_offset' AND organisation_id IS NULL AND concept = 'org_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_offset', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'settlement_paid_offset' AND organisation_id IS NULL AND concept = 'receivable_from_org');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_otc', NULL, 'cash_bank', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'settlement_paid_otc' AND organisation_id IS NULL AND concept = 'cash_bank');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_otc', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'settlement_paid_otc' AND organisation_id IS NULL AND concept = 'receivable_from_org');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_otc_offset', NULL, 'cash_bank', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'settlement_paid_otc_offset' AND organisation_id IS NULL AND concept = 'cash_bank');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_otc_offset', NULL, 'org_payable', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'settlement_paid_otc_offset' AND organisation_id IS NULL AND concept = 'org_payable');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_paid_otc_offset', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'settlement_paid_otc_offset' AND organisation_id IS NULL AND concept = 'receivable_from_org');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'wallet_payment', NULL, 'revenue', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'wallet_payment' AND organisation_id IS NULL AND concept = 'revenue');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'wallet_payment', NULL, 'wallet_liability_spend', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'wallet_payment' AND organisation_id IS NULL AND concept = 'wallet_liability_spend');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'wallet_refund', NULL, 'revenue_contra', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '4300'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'wallet_refund' AND organisation_id IS NULL AND concept = 'revenue_contra');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'wallet_refund', NULL, 'wallet_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'wallet_refund' AND organisation_id IS NULL AND concept = 'wallet_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'wallet_topup', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'wallet_topup' AND organisation_id IS NULL AND concept = 'payment_clearing');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'wallet_topup', NULL, 'wallet_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'wallet_topup' AND organisation_id IS NULL AND concept = 'wallet_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'withdrawal_completion', NULL, 'cash_bank', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'withdrawal_completion' AND organisation_id IS NULL AND concept = 'cash_bank');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'withdrawal_completion', NULL, 'withdrawal_clearing', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1130'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'withdrawal_completion' AND organisation_id IS NULL AND concept = 'withdrawal_clearing');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'withdrawal_request', NULL, 'wallet_liability', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '2100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'withdrawal_request' AND organisation_id IS NULL AND concept = 'wallet_liability');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'withdrawal_request', NULL, 'withdrawal_clearing', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '1130'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'withdrawal_request' AND organisation_id IS NULL AND concept = 'withdrawal_clearing');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'year_close', NULL, 'retained_earnings', id, 1 FROM chart_of_accounts
WHERE organisation_id IS NULL AND code = '3100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines
  WHERE event_type = 'year_close' AND organisation_id IS NULL AND concept = 'retained_earnings');
