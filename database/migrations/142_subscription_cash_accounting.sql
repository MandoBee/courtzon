-- 142: subscription_cash_payment accounting mapping + org activation on registration approval
--
-- Part 1 — Accounting mapping rows for the new `subscription_cash_payment` event
-- (concepts registered in financial/application/accounting-concepts.ts). A cash
-- subscription approved by an admin is a REAL cash collection: debit Cash/Bank,
-- credit Revenue. The posting itself happens inside the subscription activation
-- transaction via postAccountingEvent (idempotent through ledger_entries.uk_dedup).
--
-- Part 2 is code-side (subscription-activation.service): for REGISTRATION requests
-- ('organization'/'seller') the organisation is born is_active=FALSE and the only
-- blocking condition is this pending request, so activating the request now also
-- activates (verifies) the organisation in the same transaction. Non-registration
-- requests keep the existing org-active gate.

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'subscription_cash_payment', NULL, 'cash_bank', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'subscription_cash_payment' AND organisation_id IS NULL AND concept = 'cash_bank');

INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'subscription_cash_payment', NULL, 'revenue', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'subscription_cash_payment' AND organisation_id IS NULL AND concept = 'revenue');
