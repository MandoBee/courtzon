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
    credit: ['org_payable', 'tax_liability'],
  },
  marketplace_reversal: {
    debit: ['org_payable', 'tax_liability'],
    credit: ['cost_of_revenue'],
  },
  // Marketplace payment custody: CourtZon collects customer payment on behalf
  // of the merchant. Only commission is CourtZon revenue; merchant share is a
  // payable; tax is a liability. (custody model)
  marketplace_card_payment: {
    debit: ['payment_clearing'],
    credit: ['merchant_payable', 'platform_commission', 'tax_liability'],
  },
  marketplace_wallet_payment: {
    debit: ['wallet_liability_spend'],
    credit: ['merchant_payable', 'platform_commission', 'tax_liability'],
  },
  marketplace_merchant_refund: {
    debit: ['merchant_payable', 'platform_commission', 'tax_liability'],
    credit: ['payment_clearing'],
  },
  // Referee / Provider compensation (universal provider party model)
  referee_payout: {
    debit: ['referee_expense'],
    credit: ['referee_payable'],
  },
  provider_payout: {
    debit: ['provider_expense'],
    credit: ['provider_payable'],
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
    debit: ['expense', 'input_tax'],
    credit: ['accounts_payable'],
  },
  purchase_invoice_payment: {
    debit: ['accounts_payable'],
    credit: ['cash_bank'],
  },
  invoice_cancel: {
    debit: ['revenue', 'tax_liability'],
    credit: ['receivable'],
  },
  purchase_invoice_cancel: {
    debit: ['accounts_payable'],
    credit: ['expense', 'input_tax'],
  },
  payroll_post: {
    debit: ['salary_expense'],
    credit: ['salary_payable'],
  },
  year_close: {
    debit: [],
    credit: ['retained_earnings'],
  },
  booking_card_payment: {
    debit: ['payment_clearing'],
    credit: ['booking_revenue', 'platform_commission', 'tax_liability'],
  },
  booking_wallet_payment: {
    debit: ['wallet_liability_spend'],
    credit: ['booking_revenue', 'platform_commission', 'tax_liability'],
  },
  booking_cod_payment: {
    debit: ['cash_receivable'],
    credit: ['booking_revenue', 'platform_commission', 'tax_liability'],
  },
  booking_coach_payout: {
    debit: ['coach_expense'],
    credit: ['coach_payable'],
  },
  booking_coach_reversal: {
    debit: ['coach_payable'],
    credit: ['coach_expense'],
  },
  booking_refund: {
    debit: ['booking_revenue', 'platform_commission', 'tax_liability'],
    credit: ['payment_clearing'],
  },
  // Post-settlement recovery: the party already received settlement funds.
  // Reverse the expense/revenue and create a receivable against that party.
  booking_coach_recovery: {
    debit: ['coach_recovery_receivable'],
    credit: ['coach_expense'],
  },
  booking_org_recovery: {
    debit: ['org_recovery_receivable'],
    credit: ['booking_revenue'],
  },
  // Booking settlement: clear the payable and record cash movement.
  booking_coach_settlement: {
    debit: ['coach_payable'],
    credit: ['cash_bank'],
  },
  booking_org_settlement: {
    debit: ['org_payable'],
    credit: ['cash_bank'],
  },
  // Recovery collection: clear the recovery receivable.
  booking_recovery_collection: {
    debit: ['cash_bank'],
    credit: ['recovery_receivable'],
  },
  // Settlement with recovery offset: clear payable against net cash + recovery
  // receivable in a single balanced posting (no silent net-down).
  booking_coach_settlement_offset: {
    debit: ['coach_payable'],
    credit: ['cash_bank', 'coach_recovery_receivable'],
  },
  booking_org_settlement_offset: {
    debit: ['org_payable'],
    credit: ['cash_bank', 'org_recovery_receivable'],
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
