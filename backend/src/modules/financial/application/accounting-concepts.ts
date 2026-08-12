import type { EntrySide } from '../domain/ledger-aggregate.js';

/**
 * Accounting Concepts Registry
 *
 * Defines the stable concept set for each accounting event type.
 * Concepts are semantic roles (e.g. 'revenue', 'tax_liability') —
 * the listener provides amounts keyed by concept, the mapping layer
 * resolves concept → chart_of_accounts.id.
 *
 * Architecture Decision #2 — LOCKED
 */

export interface AccountingConcept {
  concept: string;
  side: EntrySide;
}

/** Registry of concepts per event_type */
export const EVENT_CONCEPTS: Record<string, { debit: string[]; credit: string[] }> = {
  wallet_topup: {
    debit: ['payment_clearing'],
    credit: ['wallet_liability'],
  },
  card_payment: {
    debit: ['payment_clearing'],
    credit: ['revenue'],
  },
  wallet_payment: {
    debit: ['wallet_liability_spend'],
    credit: ['revenue'],
  },
  card_refund: {
    debit: ['revenue_contra'],
    credit: ['payment_clearing'],
  },
  wallet_refund: {
    debit: ['revenue_contra'],
    credit: ['wallet_liability'],
  },
  cod_payment: {
    debit: ['cash_receivable'],
    credit: ['revenue'],
  },
  marketplace_delivery: {
    debit: ['cost_of_revenue'],
    credit: ['org_payable'],
  },
  marketplace_reversal: {
    debit: ['org_payable'],
    credit: ['cost_of_revenue'],
  },
  withdrawal_request: {
    debit: ['wallet_liability'],
    credit: ['withdrawal_clearing'],
  },
  withdrawal_completion: {
    debit: ['withdrawal_clearing'],
    credit: ['cash_bank'],
  },
  settlement_paid: {
    debit: ['org_payable'],
    credit: ['cash_bank'],
  },
  settlement_paid_otc: {
    debit: ['cash_bank'],
    credit: ['receivable_from_org'],
  },
  payment_failure: {
    debit: ['bad_debt'],
    credit: ['payment_clearing'],
  },
  invoice_issue: {
    debit: ['receivable'],
    credit: ['revenue', 'tax_liability'],
  },
  invoice_payment: {
    debit: ['cash_bank'],
    credit: ['receivable'],
  },
  purchase_invoice_issue: {
    debit: ['expense'],
    credit: ['accounts_payable'],
  },
  purchase_invoice_payment: {
    debit: ['accounts_payable'],
    credit: ['cash_bank'],
  },
  invoice_cancel: {
    debit: ['revenue'],
    credit: ['receivable'],
  },
  purchase_invoice_cancel: {
    debit: ['accounts_payable'],
    credit: ['expense'],
  },
  payroll_post: {
    debit: ['salary_expense'],
    credit: ['salary_payable'],
  },
  year_close: {
    debit: [],
    credit: ['retained_earnings'],
  },
};

/** Returns the flat list of concepts with their inherent sides for an event_type */
export function getEventConcepts(eventType: string): AccountingConcept[] {
  const entry = EVENT_CONCEPTS[eventType];
  if (!entry) {
    throw new Error(`Unknown event_type: ${eventType}`);
  }
  const concepts: AccountingConcept[] = [];
  for (const c of entry.debit) concepts.push({ concept: c, side: 'debit' });
  for (const c of entry.credit) concepts.push({ concept: c, side: 'credit' });
  return concepts;
}

/** Validate that a set of mapping concepts covers all required concepts */
export function validateCompleteMapping(eventType: string, mappedConcepts: string[]): string[] {
  const required = getEventConcepts(eventType).map(c => c.concept);
  const missing = required.filter(r => !mappedConcepts.includes(r));
  return missing;
}
