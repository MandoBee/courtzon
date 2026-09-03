-- 153_org_settlement_receipt.sql
--
-- Settlement payout reconciliation + organisation settlement receipt.
--
-- WHY:
--   The unified settlement engine (`settlement:paid`) settles an organization
--   (seller/merchant) for its net entitlement. Two defects were confirmed:
--     1) The CourtZon book payout cleared ORG PAYABLE (2200) instead of the
--        MERCHANT PAYABLE control (2202). Per the marketing/booking settlement
--        model, ALL organization settlements must clear 2202 Merchant Payable.
--     2) The CourtZon payout journal was stamped with the seller's
--        `organisation_id`, leaking the platform payout into the organization's
--        accounting records (book-scope leak).
--
--   The engine fix (accounting-event.listener.ts) posts:
--     - CONCEPTUAL change: settlement_paid / _offset / _otc_offset debit
--       `merchant_payable` (2202) instead of `org_payable` (2200).
--     - CourtZon book payout is ALWAYS organisation_id = NULL (platform book).
--     - NEW org-scoped `settlement_org_receipt` event: Dr org Cash/Bank /
--       Cr org 1161 Marketplace Receivable, clearing the org's receivable.
--       Org-book mapping rows are AUTO-PROVISIONED by the accounting engine
--       per organisation (see accounting-engine.service.ts: ORG_BOOK_EVENTS +
--       ORG_MARKETPLACE_ACCOUNT_CODES incl. org_cash_bank 'ORG-CASH'), so no
--       global seed row is required for the org receipt.
--
-- SCOPE:
--   Only the SETTLEMENT events (`settlement_paid`, `settlement_paid_offset`,
--   `settlement_paid_otc_offset`) and ONLY their global (organisation_id IS
--   NULL) `org_payable`/`merchant_payable` lines. Booking (2200), marketplace
--   (2202) and all other concepts are untouched.
--
--   Idempotent: rows already pointing at 2202 are left untouched; a missing
--   `merchant_payable` row is inserted with INSERT IGNORE on the
--   (event_type, organisation_id, concept) unique key. No schema change.
--   No new accounts (2202 already exists).
--
-- No destructive operation: existing rows are updated (corrected), not
-- deleted. This preserves audit history as required by the accounting policy.

-- ── UP ──
START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS tmp_settlement_map;
CREATE TEMPORARY TABLE tmp_settlement_map (
  event_type VARCHAR(50) NOT NULL,
  concept    VARCHAR(50) NOT NULL,
  code       VARCHAR(20) NOT NULL,
  PRIMARY KEY (event_type, concept)
) ENGINE=InnoDB;

INSERT INTO tmp_settlement_map (event_type, concept, code) VALUES
  ('settlement_paid',            'merchant_payable', '2202'),
  ('settlement_paid_offset',     'merchant_payable', '2202'),
  ('settlement_paid_otc_offset', 'merchant_payable', '2202');

-- 1) Reconcile any existing global `org_payable` settlement line → Merchant
--    Payable (2202). Uses the stable account CODE (never a hard-coded id) and
--    only touches rows whose target differs.
UPDATE accounting_event_mapping_lines ael
JOIN chart_of_accounts coa
  ON coa.code = '2202' AND coa.organisation_id IS NULL AND coa.is_active = 1
SET ael.concept   = 'merchant_payable',
    ael.account_id = coa.id,
    ael.updated_at = CURRENT_TIMESTAMP
WHERE ael.organisation_id IS NULL
  AND ael.event_type IN ('settlement_paid', 'settlement_paid_offset', 'settlement_paid_otc_offset')
  AND ael.concept = 'org_payable'
  AND (ael.concept <> 'merchant_payable' OR ael.account_id <> coa.id);

-- 2) Ensure a Merchant Payable (2202) mapping row exists for each settlement
--    event (INSERT IGNORE — idempotent across re-runs / fresh environments).
INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
SELECT t.event_type, NULL, t.concept, coa.id, 1
FROM tmp_settlement_map t
JOIN chart_of_accounts coa
  ON coa.code = t.code AND coa.organisation_id IS NULL AND coa.is_active = 1;

DROP TEMPORARY TABLE IF EXISTS tmp_settlement_map;

COMMIT;

-- ── DOWN ──
-- Not reversibly expressed as SQL without destroying history. To roll back,
-- restore the pre-migration snapshot of accounting_event_mapping_lines (the
-- settlement lines were `org_payable` → 2200 before this migration ran).
