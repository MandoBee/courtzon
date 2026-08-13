-- 114_booking_cod_reversal.sql
-- Financial custody remediation: COD booking refund reversal.
--
-- Booking COD originally posts:
--   Dr receivable_from_org  /  Cr platform_commission + tax_liability
--
-- The COD refund/cancellation path previously reused the card/wallet
-- `booking_refund` event (org_payable + payment_clearing) which is
-- economically wrong for COD. This migration adds the dedicated
-- `booking_cod_reversal` event mapping that exactly reverses the COD
-- economics:
--   Dr platform_commission + tax_liability  /  Cr receivable_from_org

INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_reversal', NULL, 'platform_commission', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_reversal', NULL, 'tax_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2300';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_cod_reversal', NULL, 'receivable_from_org', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1160';
