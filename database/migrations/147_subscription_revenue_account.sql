-- Migration 147: Subscription accounting → Model B platform revenue (4170)
-- Phase 1 of the unified accounting principle:
--   * Subscription fees are 100% CourtZon revenue (CourtZon = PRINCIPAL).
--   * Dedicated subscription events so they never ride the generic
--     card_payment mapping: subscription_cash_payment / subscription_card_payment /
--     subscription_wallet_payment.
--   * Revenue concept maps to account 4170 "Platform / Subscription Revenue"
--     — NEVER 4100 Court Revenue.
--   * Postings carry organisation_id = NULL (customer counterparty, not a
--     bookkeeping party) — enforced in code; mappings are global (org NULL).
--
-- Idempotent: UPDATE-then-INSERT-NOT-EXISTS pattern (same as seeds/005).

-- ── Ensure the 4170 account exists (added by 118_l4_default_catalog.sql) ──
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4170', 'Platform / Subscription Revenue', 'revenue', 'credit', id, 0, 1, 'Platform subscription and SaaS fees'
  FROM chart_of_accounts WHERE code = 'REVENUE-COURT' AND organisation_id IS NULL;

-- ── 1. CASH subscriptions: cash_bank→1120, revenue→4170 ──
UPDATE accounting_event_mapping_lines m
  JOIN chart_of_accounts c ON c.organisation_id IS NULL AND c.code = '4170'
  SET m.account_id = c.id
WHERE m.event_type = 'subscription_cash_payment' AND m.organisation_id IS NULL AND m.concept = 'revenue';
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'subscription_cash_payment', NULL, 'cash_bank', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1120'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'subscription_cash_payment' AND organisation_id IS NULL AND concept = 'cash_bank');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'subscription_cash_payment', NULL, 'revenue', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4170'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'subscription_cash_payment' AND organisation_id IS NULL AND concept = 'revenue');

-- ── 2. CARD subscriptions: payment_clearing→1100, revenue→4170 (NEW event) ──
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'subscription_card_payment', NULL, 'payment_clearing', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '1100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'subscription_card_payment' AND organisation_id IS NULL AND concept = 'payment_clearing');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'subscription_card_payment', NULL, 'revenue', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4170'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'subscription_card_payment' AND organisation_id IS NULL AND concept = 'revenue');

-- ── 3. WALLET-funded subscriptions: wallet_liability_spend→2100, revenue→4170 (NEW event) ──
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'subscription_wallet_payment', NULL, 'wallet_liability_spend', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '2100'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'subscription_wallet_payment' AND organisation_id IS NULL AND concept = 'wallet_liability_spend');
INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'subscription_wallet_payment', NULL, 'revenue', id, 1 FROM chart_of_accounts WHERE organisation_id IS NULL AND code = '4170'
AND NOT EXISTS (SELECT 1 FROM accounting_event_mapping_lines WHERE event_type = 'subscription_wallet_payment' AND organisation_id IS NULL AND concept = 'revenue');

-- ══════════════════════════════════════════════════════════════════════════
-- HISTORICAL REPAIR — PREPARED BUT **INTENTIONALLY NOT EXECUTED** here.
-- Reclassifies already-posted subscription entries (account + attribution).
-- Run manually ONLY with explicit approval. See Phase-1 final report.
--
-- -- a) Revenue legs → 4170 (both card_payment & subscription_cash_payment rows)
-- UPDATE ledger_entries le JOIN chart_of_accounts c ON c.organisation_id IS NULL AND c.code='4170'
--   SET le.chart_account_id = c.id
--  WHERE le.source_type='subscription' AND le.side='credit';
-- UPDATE general_ledger gl
--   JOIN ledger_entries le ON le.id = gl.ledger_entry_id
--   JOIN chart_of_accounts c ON c.organisation_id IS NULL AND c.code='4170'
--   SET gl.account_id = c.id
--  WHERE le.source_type='subscription' AND gl.credit > 0;
--
-- -- b) Clear counterparty attribution on ALL legs (both sides)
-- UPDATE ledger_entries SET organisation_id = NULL WHERE source_type='subscription';
-- UPDATE general_ledger gl JOIN ledger_entries le ON le.id = gl.ledger_entry_id
--   SET gl.organisation_id = NULL
--  WHERE le.source_type='subscription';
--
-- NOTE: general_ledger.balance snapshots on affected rows become historical
-- running-balance values for their ORIGINAL accounts. If exact per-account
-- running balances are required after repair, re-run GL balance rebuild for
-- accounts 4100 / 4170 for the affected periods.
-- ══════════════════════════════════════════════════════════════════════════
