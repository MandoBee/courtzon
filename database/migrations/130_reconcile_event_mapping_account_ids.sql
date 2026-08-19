-- 130_reconcile_event_mapping_account_ids.sql
-- DATA-ONLY reconciliation of accounting_event_mapping_lines.account_id.
--
-- WHY:
--   accounting_event_mapping_lines.account_id is a numeric FK to chart_of_accounts(id).
--   In some environments the Chart of Accounts rows received different AUTO_INCREMENT
--   ids because structural (L1/L2/L3) accounts were inserted in a different order than
--   the postable L4 accounts. A mapping that was authored against a COA where postable
--   accounts sat at low ids (1..15) can therefore end up pointing at structural,
--   non-postable accounts in another environment (see production Account Templates /
--   Event Mappings incident, 2026-08-19).
--
--   This migration re-resolves account_id from the STABLE account CODE, never from an
--   environment-specific numeric id. It is idempotent: a mapping that already points at
--   the correct account is left untouched, and a mapping whose target is missing is
--   left unchanged (so nothing is silently broken).
--
--   The canonical concept -> CODE mapping below is the union of the mappings already
--   established by:
--     * database/migrations/117_accounting_mapping_reconciliation.sql
--     * database/seeds/005_accounting_defaults.sql
--   These two sources are consistent (no concept maps to different codes in either).
--
--   No schema change. account_id remains the FK (fk_ael_account).
--   Target accounts are restricted to the global/default scope (organisation_id IS NULL).

-- ── UP ──
START TRANSACTION;

-- 1. Temporary canonical concept -> code mapping (union of migration 117 + seed 005)
DROP TEMPORARY TABLE IF EXISTS tmp_concept_code;
CREATE TEMPORARY TABLE tmp_concept_code (
  concept VARCHAR(50) PRIMARY KEY,
  code    VARCHAR(20) NOT NULL
) ENGINE=InnoDB;

INSERT INTO tmp_concept_code (concept, code) VALUES
  ('payment_clearing',        '1100'),
  ('cash_bank',               '1120'),
  ('withdrawal_clearing',     '1130'),
  ('receivable',              '1140'),
  ('recovery_receivable',     '1140'),
  ('cash_receivable',         '1150'),
  ('receivable_from_org',     '1160'),
  ('coach_recovery_receivable','1160'),
  ('org_recovery_receivable', '1160'),
  ('wallet_liability',        '2100'),
  ('wallet_liability_spend',  '2100'),
  ('org_payable',             '2200'),
  ('coach_payable',           '2200'),
  ('merchant_payable',        '2200'),
  ('provider_payable',        '2200'),
  ('referee_payable',         '2200'),
  ('salary_payable',          '2200'),
  ('tax_liability',           '2300'),
  ('accounts_payable',        '2400'),
  ('revenue',                 '4100'),
  ('platform_commission',     '4100'),
  ('revenue_contra',          '4300'),
  ('bad_debt',                '5100'),
  ('expense',                 '5200'),
  ('coach_expense',           '5200'),
  ('provider_expense',        '5200'),
  ('referee_expense',         '5200'),
  ('salary_expense',          '5300'),
  ('retained_earnings',       '3100'),
  ('input_tax',               'INPUT-TAX');

-- 2. Reconcile: update account_id to the id of the global postable account matching the
--    stable code. Only rows whose current account_id differs are updated. Rows for which
--    the intended code does not resolve (missing/inactive/global-absent) are left
--    untouched. Organisation-specific override rows (organisation_id IS NOT NULL) are
--    never modified.
UPDATE accounting_event_mapping_lines ael
JOIN tmp_concept_code t ON t.concept = ael.concept
JOIN chart_of_accounts coa
  ON coa.code = t.code AND coa.organisation_id IS NULL AND coa.is_active = 1
SET ael.account_id = coa.id,
    ael.updated_at = CURRENT_TIMESTAMP
WHERE ael.organisation_id IS NULL
  AND ael.account_id <> coa.id;

DROP TEMPORARY TABLE IF EXISTS tmp_concept_code;

COMMIT;

-- ── DOWN ──
-- This migration is NOT reversibly expressed as SQL: the original invalid account_id
-- values are environment-specific AUTO_INCREMENT ids (e.g. structural accounts at ids
-- 1..15 on the affected production database) and cannot be known generically.
--
-- To roll back, restore the pre-migration snapshot of accounting_event_mapping_lines
-- captured before this migration ran, e.g.:
--   database/backups/mapping_snapshot_20260819.txt
-- (id, event_type, organisation_id, concept, account_id, is_active, created_at, updated_at)
