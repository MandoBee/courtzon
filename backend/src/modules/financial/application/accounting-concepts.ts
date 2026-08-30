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
  // Subscription paid in cash — admin approval of an offline cash subscription
  // IS the collection evidence (the registrant handed money to CourtZon).
  // Platform subscription revenue: debit Cash/Bank, credit Revenue.
  // Posted from subscription-activation.service inside the same
  // transaction; idempotent via uk_dedup(source_type='subscription').
  //
  // MODEL B PRINCIPLE (Phase 1): subscriptions are 100% CourtZon platform
  // revenue — CourtZon is the PRINCIPAL selling its own service. Postings go
  // to account 4170 via mapping, and organisation_id stays NULL: the paying
  // org is a customer counterparty, not a bookkeeping party here.
  subscription_cash_payment: {
    debit: ['cash_bank'],
    credit: ['revenue'],
  },
  // Card-paid subscription — dedicated event so subscriptions never ride the
  // generic card_payment mapping (which other flows may repoint). Same
  // principal-revenue treatment: debit Payment Clearing, credit 4170.
  subscription_card_payment: {
    debit: ['payment_clearing'],
    credit: ['revenue'],
  },
  // Wallet-funded subscription — buyer's stored value moves from the customer
  // wallet liability into platform revenue.
  subscription_wallet_payment: {
    debit: ['wallet_liability_spend'],
    credit: ['revenue'],
  },
  // Subscription refunds — symmetric reversal of the original subscription
  // payment (F-12). Subscriptions are 100% CourtZon principal platform revenue
  // recognized to 4170 (MODEL B), so a refund must reverse that revenue leg and
  // the custody/payment leg — NOT the generic revenue_contra (4300) path that
  // marketplace/booking refunds use. organisation_id stays NULL (the paying org
  // is a customer counterparty, not a bookkeeping party). One event per custody
  // mirrors the payment events above.
  subscription_card_refund: {
    debit: ['revenue'],
    credit: ['payment_clearing'],
  },
  subscription_wallet_refund: {
    debit: ['revenue'],
    credit: ['wallet_liability'],
  },
  subscription_cash_refund: {
    debit: ['revenue'],
    credit: ['cash_bank'],
  },
  // Marketplace COD delivery — the merchant physically collected cash from the
  // customer. CourtZon is owed commission (+ tax) = receivable from merchant.
  marketplace_delivery: {
    debit: ['receivable_from_org'],
    credit: ['platform_commission', 'tax_liability'],
  },
  marketplace_reversal: {
    debit: ['platform_commission', 'tax_liability'],
    credit: ['receivable_from_org'],
  },
  // Marketplace payment custody (COURTZON BOOK): CourtZon collects customer
  // payment on behalf of the merchants. CourtZon's Merchant Payable control is
  // the TOTAL owed to each seller (merchandise net + shipping), posted to the
  // global control account 2202 with organisation_id = NULL. Shipping belongs
  // economically to the ORGANIZATION (org book), never to CourtZon — so no
  // shipping concept appears here. Only commission (4160) is CourtZon revenue.
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
  // Wallet-funded marketplace refund — credit wallet_liability, not
  // payment_clearing (card clearing asset was never debited for wallet orders).
  marketplace_wallet_refund: {
    debit: ['merchant_payable', 'platform_commission', 'tax_liability'],
    credit: ['wallet_liability'],
  },
  // Marketplace CASH / COD — the seller physically collected the customer's
  // money. CourtZon is owed ONLY its commission (a receivable from the seller),
  // booked to the dedicated Marketplace Receivable (1161). The seller keeps the
  // merchandise + shipping cash; the full customer amount NEVER enters 1100.
  marketplace_cash_commission: {
    debit: ['marketplace_receivable'],
    credit: ['platform_commission'],
  },
  // Marketplace CASH / COD reversal — symmetric reversal of the cash commission
  // receivable (used for cash refunds/cancellations).
  marketplace_cash_reversal: {
    debit: ['platform_commission'],
    credit: ['marketplace_receivable'],
  },
  // ── ORGANIZATION BOOK ──
  // The organization records its OWN economics for a marketplace sale, entirely
  // separate from CourtZon's book. All lines are org-scoped (organisation_id =
  // seller). For CARD/WALLET/CASH the org's net position is identical:
  //   Dr org Marketplace Receivable   = merchantNet + shipping
  //   Dr org Marketplace Commission Exp = CourtZon commission
  //   Cr org Marketplace Sales Revenue = gross merchandise − discount
  //   Cr org Shipping Liability        = shipping
  // Balanced: Dr (merchantNet + shipping) + commission = Cr (merchantNet + commission) + shipping.
  // Receivable (merchantNet + shipping) equals the amount due from CourtZon per
  // the approved model; for CASH it represents the org's retained net (it
  // already holds the customer's cash — CourtZon's 1161 records the commission
  // receivable from the org).
  marketplace_org_receivable: {
    debit: ['marketplace_receivable', 'commission_expense'],
    credit: ['sales_revenue', 'shipping_liability'],
  },
  // Organization-book reversal (refund/cancel) — symmetric reversal of the org's
  // marketplace economics without touching CourtZon's book.
  marketplace_org_receivable_reversal: {
    debit: ['sales_revenue', 'shipping_liability'],
    credit: ['marketplace_receivable', 'commission_expense'],
  },
  // Marketplace complaint refund — symmetric reversal of the original
  // marketplace custody economics when a complaint refunds the buyer to their
  // wallet (CARD/WALLET custody: CourtZon collected, so merchant_payable is
  // reversed; COD custody uses receivable_from_org instead — see listener).
  // The buyer is always refunded to wallet (2100), matching the complaint
  // refund engine. This replaces the previous generic wallet_refund (4300
  // revenue_contra) which did not mirror the original marketplace legs.
  //
  // refund_expense (5220 Refund / Chargeback Costs): the residual excess when a
  // POST-SETTLEMENT refund exceeds the recoverable economics — the buyer is
  // refunded an amount that cannot be recovered from the org (bounded recovery)
  // or from CourtZon's own commission. That unrecoverable remainder is a cost
  // to CourtZon, booked to the existing refund/chargeback expense account so
  // the posting always balances and no valid complaint refund silently drops
  // its GL reversal.
  complaint_refund: {
    debit: ['merchant_payable', 'platform_commission', 'tax_liability', 'receivable_from_org', 'refund_expense'],
    credit: ['wallet_liability'],
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
  // Settlement offset — never silently net down. Clear the FULL merchant
  // payable and the FULL COD commission receivable against the net cash
  // movement in one balanced posting.
  settlement_paid_offset: {
    debit: ['org_payable'],
    credit: ['cash_bank', 'receivable_from_org'],
  },
  settlement_paid_otc_offset: {
    debit: ['cash_bank', 'org_payable'],
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
  // Payroll paid — clearing entry when a posted payroll run is marked paid.
  // Mirrors the payroll_post accrual (salary_expense Dr / salary_payable Cr):
  // the liability is cleared against cash, keeping the payroll accounting
  // cycle balanced. Posting is done by markPayrollPaidHandler inside the same
  // transaction; idempotent via uk_dedup(source_type='journal',
  // source_id=payroll_entries.id, event_type='payroll_paid').
  payroll_paid: {
    debit: ['salary_payable'],
    credit: ['cash_bank'],
  },
  year_close: {
    debit: [],
    credit: ['retained_earnings'],
  },
  // Booking payment — CourtZon is an agent for court bookings. The org/club
  // share is a PAYABLE (liability) while CourtZon holds the funds, NOT revenue.
  // Only commission is CourtZon revenue; tax is a separate liability.
  booking_card_payment: {
    debit: ['payment_clearing'],
    credit: ['org_payable', 'platform_commission', 'tax_liability'],
  },
  booking_wallet_payment: {
    debit: ['wallet_liability_spend'],
    credit: ['org_payable', 'platform_commission', 'tax_liability'],
  },
  // COD/cash — the org physically collects the money. CourtZon is owed only
  // commission (+ tax). The org share is the org's own revenue and does NOT
  // appear on CourtZon's canonical ledger.
  booking_cod_payment: {
    debit: ['receivable_from_org'],
    credit: ['platform_commission', 'tax_liability'],
  },
  // COD refund/cancellation — reverse the COD economics EXACTLY (the original
  // posting was receivable_from_org debit + commission/tax credit). Never use
  // the card/wallet booking_refund (org_payable/payment_clearing) for COD.
  booking_cod_reversal: {
    debit: ['platform_commission', 'tax_liability'],
    credit: ['receivable_from_org'],
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
    debit: ['org_payable', 'platform_commission', 'tax_liability'],
    credit: ['payment_clearing'],
  },
  // Wallet-funded booking refund — money returns to the customer's wallet, so
  // the credit is wallet_liability (NOT payment_clearing, which is a card
  // clearing asset that was never debited for wallet bookings).
  booking_wallet_refund: {
    debit: ['org_payable', 'platform_commission', 'tax_liability'],
    credit: ['wallet_liability'],
  },
  // Post-settlement recovery: the party already received settlement funds.
  // Reverse the expense/revenue and create a receivable against that party.
  booking_coach_recovery: {
    debit: ['coach_recovery_receivable'],
    credit: ['coach_expense'],
  },
  booking_org_recovery: {
    debit: ['org_recovery_receivable'],
    credit: ['org_payable'],
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
