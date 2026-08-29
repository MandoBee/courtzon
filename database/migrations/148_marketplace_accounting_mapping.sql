-- 148_marketplace_accounting_mapping.sql
-- DATA-ONLY reconciliation of Marketplace accounting_event_mapping_lines.
--
-- WHY:
--   Marketplace custody events were posting to the BOOKING accounts
--   (merchant_payable -> 2200 Org Payable, platform_commission -> 4100 Court
--   Revenue) instead of the dedicated MARKETPLACE accounts introduced by
--   migration 118 (2202 Merchant Payable, 4160 Marketplace Revenue).
--
--   The accounting ENGINE is correct: it resolves accounts purely from
--   accounting_event_mapping_lines. The defect is the mapping configuration —
--   migration 117 and 130 both still encode the old 2200/4100 marketplace
--   mapping, and no later migration reconciled marketplace to 2202/4160.
--   (Seed 005 carries the corrected 2202/4160 intent but was never applied
--   to the LIVE database.)
--
-- SCOPE:
--   This migration touches ONLY Marketplace events and ONLY the two affected
--   concepts (merchant_payable, platform_commission). Booking (2200/4100),
--   subscription (4170), invoice (4100) and all other mappings are untouched.
--
--   Target accounts are resolved from the STABLE account CODE (never a
--   hard-coded chart_account_id) and restricted to the global/default scope
--   (organisation_id IS NULL), mirroring migration 130's reconciliation
--   technique. Idempotent: rows already pointing at the correct account are
--   left untouched; rows whose target code does not resolve are left unchanged
--   (nothing is silently broken).
--
-- No schema change. No new accounts.

-- ── UP ──
START TRANSACTION;

-- Marketplace events whose merchant_payable / platform_commission concepts are
-- misconfigured, with their canonical target codes (per seed 005 + migration 118).
DROP TEMPORARY TABLE IF EXISTS tmp_marketplace_map;
CREATE TEMPORARY TABLE tmp_marketplace_map (
  event_type VARCHAR(50) NOT NULL,
  concept    VARCHAR(50) NOT NULL,
  code       VARCHAR(20) NOT NULL,
  PRIMARY KEY (event_type, concept)
) ENGINE=InnoDB;

-- merchant_payable: 2202 Merchant Payable (was 2200 Org Payable)
INSERT INTO tmp_marketplace_map (event_type, concept, code) VALUES
  ('marketplace_card_payment',    'merchant_payable',    '2202'),
  ('marketplace_wallet_payment',  'merchant_payable',    '2202'),
  ('marketplace_merchant_refund', 'merchant_payable',    '2202'),
  ('marketplace_wallet_refund',   'merchant_payable',    '2202');

-- platform_commission: 4160 Marketplace Revenue (was 4100 Court Revenue)
INSERT INTO tmp_marketplace_map (event_type, concept, code) VALUES
  ('marketplace_card_payment',    'platform_commission', '4160'),
  ('marketplace_wallet_payment',  'platform_commission', '4160'),
  ('marketplace_merchant_refund', 'platform_commission', '4160'),
  ('marketplace_wallet_refund',   'platform_commission', '4160'),
  ('marketplace_delivery',        'platform_commission', '4160'),
  ('marketplace_reversal',        'platform_commission', '4160');

-- Reconcile: update account_id to the id of the global postable account
-- matching the stable code. Only rows whose current account_id differs are
-- updated. Restricted to global (organisation_id IS NULL) Marketplace lines.
UPDATE accounting_event_mapping_lines ael
JOIN tmp_marketplace_map t
  ON t.event_type = ael.event_type AND t.concept = ael.concept
JOIN chart_of_accounts coa
  ON coa.code = t.code AND coa.organisation_id IS NULL AND coa.is_active = 1
SET ael.account_id = coa.id,
    ael.updated_at = CURRENT_TIMESTAMP
WHERE ael.organisation_id IS NULL
  AND ael.concept IN ('merchant_payable', 'platform_commission')
  AND ael.event_type IN (
    'marketplace_card_payment',
    'marketplace_wallet_payment',
    'marketplace_merchant_refund',
    'marketplace_wallet_refund',
    'marketplace_delivery',
    'marketplace_reversal'
  )
  AND ael.account_id <> coa.id;

DROP TEMPORARY TABLE IF EXISTS tmp_marketplace_map;

COMMIT;

-- ── DOWN ──
-- Not reversibly expressed as SQL (the prior wrong account_ids are the
-- booking accounts 2200/4100). To roll back, restore the pre-migration
-- snapshot of accounting_event_mapping_lines captured before this migration
-- ran (see Phase 0 backup snapshot).
