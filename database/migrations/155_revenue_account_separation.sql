-- 155_revenue_account_separation.sql
-- Separate Organization vs CourtZon revenue accounts.
--
--   1. Rename the source-specific revenue accounts to reflect their REAL
--      content (CourtZon platform commissions / court rental), so organization
--      revenue is never mislabeled as CourtZon commission revenue and vice
--      versa. Label-only changes — codes, mappings and ledger history are
--      untouched.
--   2. Register the remaining real CourtZon commission sources as default L4
--      accounts (Academy / Tournament / Coach Session) for future postings.
--   3. Point the settlement offset mappings at the Marketplace Receivable
--      (1161) — the SAME receivable COD commissions book to — instead of the
--      stale Receivable from Org (1160), so settlement offsets clear the full
--      COD commission receivable without leaving an unmatched 1160 balance.
--   4. The org-scoped Court Rental Revenue account (MKT-COURT-REN) used by
--      booking organization-book postings is auto-provisioned at runtime by the
--      accounting engine (no schema row needed here).
--
-- Idempotent: UPDATE + INSERT IGNORE + parent lookup by code.

-- 1. Rename global (org NULL) revenue accounts.
UPDATE chart_of_accounts SET name = 'Court Rental Revenue',
  description = 'CourtZon court rental and invoiced services revenue'
 WHERE organisation_id IS NULL AND code = '4100';

UPDATE chart_of_accounts SET name = 'Court Booking Commission Revenue',
  description = 'CourtZon commission revenue on court bookings'
 WHERE organisation_id IS NULL AND code = '4110';

UPDATE chart_of_accounts SET name = 'Marketplace Commission Revenue',
  description = 'CourtZon commission revenue on marketplace orders'
 WHERE organisation_id IS NULL AND code = '4160';

UPDATE chart_of_accounts SET name = 'League Commission Revenue',
  description = 'CourtZon commission revenue on league operations'
 WHERE organisation_id IS NULL AND code = '4180';

-- 2. Register the remaining real CourtZon commission sources.
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4191', 'Academy Commission Revenue', 'revenue', 'credit', id, 0, 1, 'CourtZon commission revenue on academy programs'
  FROM chart_of_accounts WHERE code = 'REVENUE-COURT' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4192', 'Tournament Commission Revenue', 'revenue', 'credit', id, 0, 1, 'CourtZon commission revenue on tournaments'
  FROM chart_of_accounts WHERE code = 'REVENUE-COURT' AND organisation_id IS NULL;
INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
SELECT NULL, '4193', 'Coach Session Commission Revenue', 'revenue', 'credit', id, 0, 1, 'CourtZon commission revenue on coach sessions'
  FROM chart_of_accounts WHERE code = 'REVENUE-COURT' AND organisation_id IS NULL;

-- 3. Settlement offsets clear the Marketplace Receivable (1161) — the
-- receivable COD commissions actually book to (booking_cod_payment /
-- marketplace cash commission). Re-point the global mapping rows so they are
-- authoritative and consistent with the code-level defaults. Idempotent: a
-- second run finds no receivable_from_org rows left to update.
UPDATE accounting_event_mapping_lines m
  JOIN chart_of_accounts r ON r.code = '1161' AND r.organisation_id IS NULL
  SET m.concept = 'marketplace_receivable', m.account_id = r.id
 WHERE m.organisation_id IS NULL
   AND m.is_active = 1
   AND m.event_type IN ('settlement_paid_otc', 'settlement_paid_offset', 'settlement_paid_otc_offset')
   AND m.concept = 'receivable_from_org';