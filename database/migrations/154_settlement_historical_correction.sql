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
-- This migration is NON-DESTRUCTIVE and idempotent:
--   * Original ledger rows 159-164 (settlement_paid) are NEVER modified/deleted.
--   * Three separate balanced journals are ADDED per settlement:
--       A) settlement_paid_reversal  — org-scoped — Dr 1120 / Cr 2200
--          (neutralises the historical org-scoped 2200/1120 leak ONLY)
--       B) settlement_paid_correction — global (org NULL) — Dr 2202 / Cr 1120
--          (records the real CourtZon payout + clears the merchant liability)
--       C) settlement_org_receipt     — org-scoped — Dr ORG-CASH / Cr 1161
--          (records the organisation's cash receipt + clears its receivable)
--   * Idempotency: uk_dedup (source_type, source_id, event_type,
--     chart_account_id, side) on ledger_entries, uk_gl_ledger_entry on
--     general_ledger, uk_org_code on chart_of_accounts — INSERT IGNORE skips
--     on re-run.
--   * Accounts are resolved by stable CODE, never hard-coded chart_account IDs.
--   * Org-scoped accounts (ORG-CASH / 1161) are provisioned for orgs 6 & 28
--     using the same idempotent provisioning pattern as
--     provisionOrganisationMarketplaceAccounts().
--   * No settlement / entitlement / payment / gateway record is touched.
--   * No schema change, no new tables, no baseline change.
--
-- GL projection: every inserted ledger_entries row gets a matching
-- general_ledger projection row (period resolved to the open platform period
-- covering the correction date; reference_type = <source_type>_<event_type>;
-- balance 0), exactly as glProjectionService.projectEntries() would.
--
-- Notes:
--   * Statements are idempotent; re-running produces exactly the same state.
--   * The global 2202 credit of 8460.15 is cleared exactly once (810.00 +
--     7509.40 + 140.75), org 6 1161 debit of 8319.40 is cleared exactly once,
--     org 28 1161 debit of 140.75 is cleared exactly once.

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

-- ───────────────────────────────────────────────────────────────────────────
-- Resolve the open platform accounting period covering the correction date
-- (replicates glProjectionService.resolvePostingPeriod for org-scoped postings
-- that fall back to the platform period, ORDER BY (status='open') DESC, id).
-- ───────────────────────────────────────────────────────────────────────────
-- (period_id resolved inline per insert below)

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Journal A — settlement_paid_reversal (org-scoped: neutralises the leaked
--    global 2200/1120 rows inside the organisation's book).
--    S1: Dr 1120 (org 6) 810.00 / Cr 2200 (org 6) 810.00
-- ───────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_rev_s1_dr', 'settlement', 1, 'settlement_paid_reversal',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       6, coa.id, NULL, 'debit', 810.00, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #1 — reverse leaked org-scoped payout', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = '1120' AND coa.organisation_id IS NULL AND coa.is_active = 1;

INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_rev_s1_cr', 'settlement', 1, 'settlement_paid_reversal',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       6, coa.id, NULL, 'credit', 810.00, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #1 — reverse leaked org-scoped payout', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = '2200' AND coa.organisation_id IS NULL AND coa.is_active = 1;

--    S2: Dr 1120 (org 6) 7509.40 / Cr 2200 (org 6) 7509.40
INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_rev_s2_dr', 'settlement', 2, 'settlement_paid_reversal',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       6, coa.id, NULL, 'debit', 7509.40, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #2 — reverse leaked org-scoped payout', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = '1120' AND coa.organisation_id IS NULL AND coa.is_active = 1;

INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_rev_s2_cr', 'settlement', 2, 'settlement_paid_reversal',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       6, coa.id, NULL, 'credit', 7509.40, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #2 — reverse leaked org-scoped payout', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = '2200' AND coa.organisation_id IS NULL AND coa.is_active = 1;

--    S3: Dr 1120 (org 28) 140.75 / Cr 2200 (org 28) 140.75
INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_rev_s3_dr', 'settlement', 3, 'settlement_paid_reversal',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       28, coa.id, NULL, 'debit', 140.75, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #3 — reverse leaked org-scoped payout', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = '1120' AND coa.organisation_id IS NULL AND coa.is_active = 1;

INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_rev_s3_cr', 'settlement', 3, 'settlement_paid_reversal',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       28, coa.id, NULL, 'credit', 140.75, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #3 — reverse leaked org-scoped payout', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = '2200' AND coa.organisation_id IS NULL AND coa.is_active = 1;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Journal B — settlement_paid_correction (GLOBAL book, org NULL):
--    the real CourtZon payout. Dr 2202 / Cr 1120 per settlement.
-- ───────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_corr_s1_dr', 'settlement', 1, 'settlement_paid_correction',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       NULL, coa.id, NULL, 'debit', 810.00, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #1 — correct CourtZon Merchant Payable payout', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = '2202' AND coa.organisation_id IS NULL AND coa.is_active = 1;

INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_corr_s1_cr', 'settlement', 1, 'settlement_paid_correction',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       NULL, coa.id, NULL, 'credit', 810.00, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #1 — correct CourtZon Merchant Payable payout', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = '1120' AND coa.organisation_id IS NULL AND coa.is_active = 1;

INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_corr_s2_dr', 'settlement', 2, 'settlement_paid_correction',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       NULL, coa.id, NULL, 'debit', 7509.40, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #2 — correct CourtZon Merchant Payable payout', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = '2202' AND coa.organisation_id IS NULL AND coa.is_active = 1;

INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_corr_s2_cr', 'settlement', 2, 'settlement_paid_correction',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       NULL, coa.id, NULL, 'credit', 7509.40, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #2 — correct CourtZon Merchant Payable payout', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = '1120' AND coa.organisation_id IS NULL AND coa.is_active = 1;

INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_corr_s3_dr', 'settlement', 3, 'settlement_paid_correction',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       NULL, coa.id, NULL, 'debit', 140.75, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #3 — correct CourtZon Merchant Payable payout', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = '2202' AND coa.organisation_id IS NULL AND coa.is_active = 1;

INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_corr_s3_cr', 'settlement', 3, 'settlement_paid_correction',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       NULL, coa.id, NULL, 'credit', 140.75, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #3 — correct CourtZon Merchant Payable payout', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = '1120' AND coa.organisation_id IS NULL AND coa.is_active = 1;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Journal C — settlement_org_receipt (org-scoped):
--    Dr org ORG-CASH / Cr org 1161 per settlement.
-- ───────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_orgrec_s1_dr', 'settlement', 1, 'settlement_org_receipt',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       coa.organisation_id, coa.id, NULL, 'debit', 810.00, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #1 — organisation settlement receipt', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = 'ORG-CASH' AND coa.organisation_id = 6 AND coa.is_active = 1;

INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_orgrec_s1_cr', 'settlement', 1, 'settlement_org_receipt',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       coa.organisation_id, coa.id, NULL, 'credit', 810.00, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #1 — organisation settlement receipt', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = '1161' AND coa.organisation_id = 6 AND coa.is_active = 1;

INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_orgrec_s2_dr', 'settlement', 2, 'settlement_org_receipt',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       coa.organisation_id, coa.id, NULL, 'debit', 7509.40, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #2 — organisation settlement receipt', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = 'ORG-CASH' AND coa.organisation_id = 6 AND coa.is_active = 1;

INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_orgrec_s2_cr', 'settlement', 2, 'settlement_org_receipt',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       coa.organisation_id, coa.id, NULL, 'credit', 7509.40, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #2 — organisation settlement receipt', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = '1161' AND coa.organisation_id = 6 AND coa.is_active = 1;

INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_orgrec_s3_dr', 'settlement', 3, 'settlement_org_receipt',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       coa.organisation_id, coa.id, NULL, 'debit', 140.75, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #3 — organisation settlement receipt', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = 'ORG-CASH' AND coa.organisation_id = 28 AND coa.is_active = 1;

INSERT IGNORE INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
SELECT 'fix_orgrec_s3_cr', 'settlement', 3, 'settlement_org_receipt',
       (SELECT pp.id FROM accounting_periods pp WHERE pp.organisation_id IS NULL AND CURDATE() BETWEEN pp.start_date AND pp.end_date ORDER BY (pp.status = 'open') DESC, pp.id ASC LIMIT 1),
       coa.organisation_id, coa.id, NULL, 'credit', 140.75, 'EGP',
       'Historical correction of pre-ec2a5ab settlement #3 — organisation settlement receipt', NULL, NOW()
FROM chart_of_accounts coa
WHERE coa.code = '1161' AND coa.organisation_id = 28 AND coa.is_active = 1;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. GL projection — one general_ledger row per ledger_entries row inserted
--    above (mirrors glProjectionService.projectEntries: period_id,
--    account_id, entry_date = DATE(recorded_at), debit/credit split,
--    balance 0, reference_type = <source_type>_<event_type>,
--    reference_id = source_id, created_by = 1). uk_gl_ledger_entry makes it
--    idempotent on re-run.
-- ───────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO general_ledger (ledger_entry_id, organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
SELECT le.id, le.organisation_id, le.period_id, le.chart_account_id, DATE(le.recorded_at),
       CASE WHEN le.side = 'debit' THEN le.amount ELSE 0 END,
       CASE WHEN le.side = 'credit' THEN le.amount ELSE 0 END,
       0,
       CONCAT(le.source_type, '_', le.event_type),
       le.source_id,
       le.description,
       1
FROM ledger_entries le
WHERE le.source_type = 'settlement'
  AND le.source_id IN (1, 2, 3)
  AND le.event_type IN ('settlement_paid_reversal', 'settlement_paid_correction', 'settlement_org_receipt');

COMMIT;

-- ── DOWN ──
-- Not reversibly expressed as SQL without deleting the corrective journals.
-- To roll back, restore the pre-migration snapshot of ledger_entries /
-- general_ledger for the rows created by this migration
-- (event_type IN ('settlement_paid_reversal','settlement_paid_correction',
-- 'settlement_org_receipt') AND source_type='settlement' AND source_id IN
-- (1,2,3)), and delete the provisioned org accounts / mapping lines
-- (code 'ORG-CASH', orgs 6 & 28; event_type 'settlement_org_receipt').