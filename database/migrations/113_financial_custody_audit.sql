-- 113_financial_custody_audit.sql
-- Financial Custody / Counterparty / Settlement correctness audit fixes.
--
-- Fixes the following canonical-accounting correctness bugs:
--  1. Booking org share was credited to `booking_revenue` -> 4100 "Court Revenue"
--     (treated as CourtZon revenue) instead of a payable. Now org share goes to
--     `org_payable` -> 2200 "Org Payable" (liability while CourtZon holds funds).
--  2. Booking COD/cash debited `cash_receivable` (1150) for the FULL gross and
--     credited org share as revenue. Now COD debits `receivable_from_org` (1160)
--     for commission+tax only; org share never enters CourtZon's ledger.
--  3. marketplace_delivery / marketplace_reversal used the legacy gross-revenue
--     model (cost_of_revenue 4200 + org_payable 2200 + tax_liability->4100).
--     Now they use the custody-correct COD model: receivable_from_org (1160)
--     debit, platform_commission (4100) + tax_liability (2300) credit.
--  4. marketplace tax_liability was mapped to 4100 (Court Revenue); now 2300.

-- Idempotent: deletes stale concept rows, then inserts the correct ones.

-- ── 1. Booking card payment: org share -> org_payable ──
DELETE FROM accounting_event_mapping_lines
WHERE event_type = 'booking_card_payment' AND organisation_id IS NULL
  AND concept IN ('booking_revenue', 'cash_receivable');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_card_payment', NULL, 'org_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_card_payment' AND organisation_id IS NULL AND concept = 'org_payable');

-- ── 2. Booking wallet payment: org share -> org_payable ──
DELETE FROM accounting_event_mapping_lines
WHERE event_type = 'booking_wallet_payment' AND organisation_id IS NULL
  AND concept IN ('booking_revenue', 'cash_receivable');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_payment', NULL, 'org_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_wallet_payment' AND organisation_id IS NULL AND concept = 'org_payable');

-- ── 3. Booking COD: full gross cash_receivable -> commission+tax receivable ──
DELETE FROM accounting_event_mapping_lines
WHERE event_type = 'booking_cod_payment' AND organisation_id IS NULL
  AND concept IN ('booking_revenue', 'cash_receivable');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_payment', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_cod_payment' AND organisation_id IS NULL AND concept = 'receivable_from_org');

-- ── 4. Booking refund: org share -> org_payable ──
DELETE FROM accounting_event_mapping_lines
WHERE event_type = 'booking_refund' AND organisation_id IS NULL
  AND concept = 'booking_revenue';

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_refund', NULL, 'org_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_refund' AND organisation_id IS NULL AND concept = 'org_payable');

-- ── 5. Booking org recovery: booking_revenue -> org_payable ──
DELETE FROM accounting_event_mapping_lines
WHERE event_type = 'booking_org_recovery' AND organisation_id IS NULL
  AND concept = 'booking_revenue';

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_org_recovery', NULL, 'org_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'booking_org_recovery' AND organisation_id IS NULL AND concept = 'org_payable');

-- ── 6. marketplace_delivery: legacy gross model -> COD commission receivable ──
DELETE FROM accounting_event_mapping_lines
WHERE event_type = 'marketplace_delivery' AND organisation_id IS NULL
  AND concept IN ('cost_of_revenue', 'org_payable');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_delivery', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_delivery' AND organisation_id IS NULL AND concept = 'receivable_from_org');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_delivery', NULL, 'platform_commission', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_delivery' AND organisation_id IS NULL AND concept = 'platform_commission');

-- Fix marketplace_delivery tax_liability 4100 -> 2300
UPDATE accounting_event_mapping_lines ael
JOIN chart_of_accounts coa_new ON coa_new.organisation_id IS NULL AND coa_new.code = '2300'
JOIN chart_of_accounts coa_old ON ael.account_id = coa_old.id AND coa_old.code = '4100'
SET ael.account_id = coa_new.id
WHERE ael.event_type = 'marketplace_delivery' AND ael.organisation_id IS NULL AND ael.concept = 'tax_liability';

-- ── 7. marketplace_reversal: legacy gross model -> COD commission reversal ──
DELETE FROM accounting_event_mapping_lines
WHERE event_type = 'marketplace_reversal' AND organisation_id IS NULL
  AND concept IN ('cost_of_revenue', 'org_payable');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_reversal', NULL, 'platform_commission', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_reversal' AND organisation_id IS NULL AND concept = 'platform_commission');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_reversal', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1160'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'marketplace_reversal' AND organisation_id IS NULL AND concept = 'receivable_from_org');

-- Fix marketplace_reversal tax_liability 4100 -> 2300
UPDATE accounting_event_mapping_lines ael
JOIN chart_of_accounts coa_new ON coa_new.organisation_id IS NULL AND coa_new.code = '2300'
JOIN chart_of_accounts coa_old ON ael.account_id = coa_old.id AND coa_old.code = '4100'
SET ael.account_id = coa_new.id
WHERE ael.event_type = 'marketplace_reversal' AND ael.organisation_id IS NULL AND ael.concept = 'tax_liability';

-- ── 8. Settlement offset events (explicit net-down) ──
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
