-- 154_settlement_historical_correction.sql
--
-- AUDIT-PRESERVING correction of three pre-ec2a5ab Marketplace Organisation
-- settlements on production:
--   Settlement #1 — org 6  — courtzon_to_org — 810.00   EGP
--   Settlement #2 — org 6  — courtzon_to_org — 7509.40 EGP
--   Settlement #3 — org 28 — courtzon_to_org — 140.75  EGP
--
-- Confirmed historical defects (posted before commit ec2a5ab):
--   1) The CourtZon payout journal debited 2200 Org Payable instead of 2202
--      Merchant Payable (the merchant liability control).
--   2) The CourtZon payout journal was stamped with organisation_id = seller
--      org, leaking the platform payout into the organisation's book.
--   3) No organisation-side settlement receipt was ever posted, so the org's
--      1161 Marketplace Receivable was never cleared.
--   4) CourtZon's global 2202 Merchant Payable was never cleared.
--
-- THIS MIGRATION IS PROVISIONING-ONLY.
--
-- The corrective JOURNALS are NOT posted here as raw SQL. They are posted
-- through the CANONICAL ACCOUNTING ENGINE (`postAccountingEvent`) by the
-- dedicated Node runner:
--
--   backend/scripts/correct-historical-settlements.mjs
--
--   A) settlement_paid_reversal   — org-scoped  — Dr 1120 / Cr 2200
--      (neutralises the historical org-scoped 2200/1120 leak ONLY)
--   B) settlement_paid_correction — global NULL — Dr 2202 / Cr 1120
--      (records the real CourtZon payout + clears the merchant liability)
--   C) settlement_org_receipt     — org-scoped  — Dr ORG-CASH / Cr 1161
--      (records the organisation's cash receipt + clears its receivable)
--
-- The runner uses the canonical engine so ledger_entries, general_ledger
-- projection, accounting period handling, balance validation, deduplication
-- (hasPosting + uk_dedup) and account resolution by stable CODE all follow the
-- exact production path. The three event types are distinct identities and
-- cannot collide with the historical `settlement_paid` postings.
--
-- This SQL file provisions the org-scoped accounts and mapping rows that the
-- runner needs, so org 6 / org 28 have ORG-CASH and the org-scoped
-- `settlement_org_receipt` mapping before the journals post. It is:
--   * NON-DESTRUCTIVE (no UPDATE/DELETE of any historical row)
--   * IDEMPOTENT (INSERT IGNORE on uk_org_code / mapping unique key)
--   * TRANSACTION-SAFE
--   * SCOPE-LIMITED to orgs 6 & 28
--   * No schema change, no new tables, no baseline change.
--
-- Original ledger rows 159-164 (settlement_paid) stay IMMUTABLE. No
-- settlement / entitlement / payment / gateway record is modified.

START TRANSACTION;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Provision org-scoped ORG-CASH accounts for orgs 6 & 28 (INSERT IGNORE on
--    uk_org_code (organisation_id, code); parent = global ASSETS-CASH).
--    Only runs for orgs that exist (JOIN organisations) and only when missing.
-- ───────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT o.id, 'ORG-CASH', 'Organization Cash / Bank', 'asset', 'debit', p.id, 1, 1, 'Organization cash/bank for settled marketplace receipts (organization book)'
FROM organisations o
JOIN chart_of_accounts p
  ON p.code = 'ASSETS-CASH' AND p.organisation_id IS NULL AND p.is_active = 1
WHERE o.id IN (6, 28)
  AND NOT EXISTS (
    SELECT 1 FROM chart_of_accounts c
    WHERE c.organisation_id = o.id AND c.code = 'ORG-CASH'
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Provision org-scoped 1161 Marketplace Receivable accounts for orgs 6 & 28
--    if missing (production already has them; INSERT IGNORE keeps it safe on
--    environments where they do not yet exist).
-- ───────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT o.id, '1161', 'Marketplace Receivable', 'asset', 'debit', p.id, 1, 1, 'Amount due from CourtZon for marketplace sales (organization book)'
FROM organisations o
JOIN chart_of_accounts p
  ON p.code = 'ASSETS-RECEIVABLES' AND p.organisation_id IS NULL AND p.is_active = 1
WHERE o.id IN (6, 28)
  AND NOT EXISTS (
    SELECT 1 FROM chart_of_accounts c
    WHERE c.organisation_id = o.id AND c.code = '1161'
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Provision org-scoped accounting_event_mapping_lines for
--    settlement_org_receipt (org 6 & 28) — INSERT IGNORE on the
--    (event_type, organisation_id, concept) unique key.
-- ───────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_org_receipt', c.organisation_id, 'org_cash_bank', c.id, 1
FROM chart_of_accounts c
WHERE c.code = 'ORG-CASH' AND c.organisation_id IN (6, 28);

INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT 'settlement_org_receipt', c.organisation_id, 'marketplace_receivable', c.id, 1
FROM chart_of_accounts c
WHERE c.code = '1161' AND c.organisation_id IN (6, 28);

COMMIT;

-- ── DOWN ──
-- Not reversibly expressed as SQL without deleting data. To roll back the
-- provisioning, restore the pre-migration snapshot of chart_of_accounts /
-- accounting_event_mapping_lines for the rows created by this migration
-- (code 'ORG-CASH', orgs 6 & 28; event_type 'settlement_org_receipt'). The
-- corrective journals themselves are posted by the runner through the canonical
-- engine and are NOT tracked here.