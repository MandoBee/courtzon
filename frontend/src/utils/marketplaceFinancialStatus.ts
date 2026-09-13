/**
 * PHASE 2 / GROUP 1 — Marketplace order financial-status presentation.
 *
 * The backend `financial_status` value is authoritative and UNCHANGED:
 *   Pending / Available / Held / Settled / Cancelled
 *
 * `'Pending'` means settlement maturity is still pending (the order's financial
 * entitlements are waiting for the complaint/settlement window) — NOT that the
 * payment is pending. This mapping only clarifies the human-readable label;
 * it does not touch the API value, filters, accounting, or settlement logic.
 */
export const MARKETPLACE_FINANCIAL_STATUS_LABELS: Record<string, string> = {
  Pending: 'Settlement Pending',
  Available: 'Available',
  Held: 'Held',
  Settled: 'Settled',
  Cancelled: 'Cancelled',
};

/** Human-readable label for an order's `financial_status`. Falls back to the raw value. */
export function financialStatusLabel(value?: string | null): string {
  if (!value) return '';
  return MARKETPLACE_FINANCIAL_STATUS_LABELS[value] ?? value;
}