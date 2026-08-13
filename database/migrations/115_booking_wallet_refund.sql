-- 115_booking_wallet_refund.sql
-- Financial custody remediation: wallet-funded refund reversal.
--
-- Wallet booking/order payments post:
--   Dr wallet_liability_spend  /  Cr org_payable + platform_commission + tax_liability
--
-- The refund path previously reused the card event (booking_refund /
-- marketplace_merchant_refund) which credits `payment_clearing` — a card
-- clearing asset that is never debited for wallet payments. This migrates
-- two dedicated wallet-refund events that credit `wallet_liability` instead:
--   booking_wallet_refund:
--     Dr org_payable + platform_commission + tax_liability  /  Cr wallet_liability
--   marketplace_wallet_refund:
--     Dr merchant_payable + platform_commission + tax_liability  /  Cr wallet_liability

-- booking_wallet_refund
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_refund', NULL, 'org_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_refund', NULL, 'platform_commission', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_refund', NULL, 'tax_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2300';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'booking_wallet_refund', NULL, 'wallet_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2100';

-- marketplace_wallet_refund
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_refund', NULL, 'merchant_payable', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2200';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_refund', NULL, 'platform_commission', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_refund', NULL, 'tax_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2300';
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'marketplace_wallet_refund', NULL, 'wallet_liability', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2100';
