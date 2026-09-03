import { postAccountingEvent } from './accounting-event.listener.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('settlement-correction');

/**
 * Historical Settlement Correction — Canonical Engine path.
 *
 * Audit-preserving correction of the three pre-ec2a5ab Marketplace
 * Organisation settlements on production:
 *   Settlement #1 — org 6  — courtzon_to_org — 810.00
 *   Settlement #2 — org 6  — courtzon_to_org — 7509.40
 *   Settlement #3 — org 28 — courtzon_to_org — 140.75
 *
 * The historical rows (ledger_entries 159-164, settlement_paid) are IMMUTABLE.
 * This service posts THREE NEW balanced journals per settlement through the
 * canonical Accounting Engine (`postAccountingEvent`), so ledger_entries,
 * general_ledger projection, accounting period, balance validation and
 * deduplication (hasPosting + uk_dedup) all follow the exact production path:
 *
 *   A) settlement_paid_reversal   — org-scoped  — Dr 1120 / Cr 2200
 *      (neutralises the historical org-scoped 2200/1120 leak ONLY)
 *   B) settlement_paid_correction — global NULL — Dr 2202 / Cr 1120
 *      (records the real CourtZon payout + clears the merchant liability)
 *   C) settlement_org_receipt     — org-scoped  — Dr ORG-CASH / Cr 1161
 *      (records the organisation's cash receipt + clears its receivable)
 *
 * Distinct event identities guarantee no collision with the original
 * `settlement_paid` posting. Idempotent: re-running skips via hasPosting.
 */

export interface SettlementCorrectionSpec {
  settlementId: number;
  organisationId: number;
  amount: number;
}

export const HISTORICAL_SETTLEMENT_CORRECTIONS: SettlementCorrectionSpec[] = [
  { settlementId: 1, organisationId: 6, amount: 810.0 },
  { settlementId: 2, organisationId: 6, amount: 7509.4 },
  { settlementId: 3, organisationId: 28, amount: 140.75 },
];

const CURRENCY = 'EGP';

function description(spec: SettlementCorrectionSpec, reason: string): string {
  return `Historical correction of pre-ec2a5ab settlement #${spec.settlementId} — ${reason}`;
}

/**
 * Apply the historical settlement correction for the given specs through the
 * canonical Accounting Engine. Defaults to the three production settlements.
 * Returns the number of journals posted (idempotent skips excluded).
 */
export async function applyHistoricalSettlementCorrections(
  specs: SettlementCorrectionSpec[] = HISTORICAL_SETTLEMENT_CORRECTIONS,
): Promise<{ posted: number; skipped: number }> {
  let posted = 0;
  let skipped = 0;

  for (const spec of specs) {
    // A) Reverse the erroneous org-scoped payout leak (org-scoped, same global
    //    2200/1120 accounts the leak referenced — they net to zero inside the
    //    organisation's book).
    try {
      await postAccountingEvent(
        'settlement_paid_reversal',
        'settlement',
        spec.settlementId,
        spec.organisationId,
        { cash_bank: spec.amount, org_payable: spec.amount },
        CURRENCY,
        description(spec, 'reverse leaked org-scoped payout'),
      );
      posted += 1;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        skipped += 1;
      } else {
        throw err;
      }
    }

    // B) Record the actual CourtZon payout in the global book (org NULL).
    try {
      await postAccountingEvent(
        'settlement_paid_correction',
        'settlement',
        spec.settlementId,
        null,
        { merchant_payable: spec.amount, cash_bank: spec.amount },
        CURRENCY,
        description(spec, 'correct CourtZon Merchant Payable payout'),
      );
      posted += 1;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        skipped += 1;
      } else {
        throw err;
      }
    }

    // C) Post the organisation settlement receipt (org-scoped).
    try {
      await postAccountingEvent(
        'settlement_org_receipt',
        'settlement',
        spec.settlementId,
        spec.organisationId,
        { org_cash_bank: spec.amount, marketplace_receivable: spec.amount },
        CURRENCY,
        description(spec, 'organisation settlement receipt'),
      );
      posted += 1;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        skipped += 1;
      } else {
        throw err;
      }
    }
  }

  log.info({ specs: specs.length, posted, skipped }, 'Historical settlement correction applied');
  return { posted, skipped };
}