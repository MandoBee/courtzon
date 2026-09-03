#!/usr/bin/env node
/**
 * Historical Settlement Correction — Node runner (canonical engine path).
 *
 * Posts the audit-preserving corrective journals for the three pre-ec2a5ab
 * Marketplace Organisation settlements through the CANONICAL Accounting Engine
 * (`postAccountingEvent`), so ledger_entries, general_ledger projection,
 * accounting period, balance validation and deduplication all follow the exact
 * production path.
 *
 *   Settlement #1 — org 6  — 810.00   → reversal / correction / org_receipt
 *   Settlement #2 — org 6  — 7509.40  → reversal / correction / org_receipt
 *   Settlement #3 — org 28 — 140.75   → reversal / correction / org_receipt
 *
 * Prerequisites (applied by migration 154):
 *   - org-scoped ORG-CASH + 1161 accounts for orgs 6 & 28
 *   - org-scoped `settlement_org_receipt` mapping rows
 *
 * Safety:
 *   - Original ledger rows 159-164 stay IMMUTABLE.
 *   - Idempotent: hasPosting + ledger_entries.uk_dedup → re-run is a no-op.
 *   - No settlement / entitlement / payment / gateway record is modified.
 *
 * Usage (inside the backend container or with env vars exported):
 *   node scripts/correct-historical-settlements.mjs
 */
import { applyHistoricalSettlementCorrections } from '../dist/modules/financial/application/settlement-correction.service.js';

async function main() {
  const result = await applyHistoricalSettlementCorrections();
  // eslint-disable-next-line no-console
  console.log(`Historical settlement correction complete: ${JSON.stringify(result)}`);
  // The imported Accounting Engine listener keeps Redis/DB handles open — exit
  // explicitly so the runner terminates cleanly in CI / Docker exec contexts.
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Historical settlement correction FAILED:', err?.message ?? err);
  process.exit(1);
});