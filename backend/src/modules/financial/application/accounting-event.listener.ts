import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { accountingEngineService } from './accounting-engine.service.js';
import { ledgerRepository } from '../infrastructure/repositories/ledger.repository.js';
import { glProjectionService } from './gl-projection.service.js';
import { bookingAccounting } from './booking-accounting.service.js';
import type { RefundEconomics } from './booking-accounting.service.js';
import { academyPaymentRepository } from '../../academy/infrastructure/repositories/academy-payment.repository.js';
import { bookingSeriesRepository } from '../../booking/infrastructure/repositories/booking-series.repository.js';
import { bookingRepository } from '../../booking/infrastructure/repositories/booking.repository.js';
import { paymentAllocationRepository } from '../../booking/infrastructure/repositories/payment-allocation.repository.js';
import { paymentAllocationService } from '../../booking/application/payment-allocation.service.js';
import { tournamentRepository } from '../../tournaments/infrastructure/repositories/tournament.repository.js';
import { tournamentPrizeAwardRepository } from '../../tournaments/infrastructure/repositories/tournament-prize-award.repository.js';
import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import type { SourceType, LedgerLineInput, EntrySide, LedgerEntry } from '../domain/ledger-aggregate.js';
import { createLedgerLines, validateLedgerBalance } from '../domain/ledger-aggregate.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getLocalBusinessDate } from '../../../shared/utils/business-date.js';

const log = createModuleLogger('accounting-listener');
type RowData = RowDataPacket[];

// In-process per-entity mutexes. Booking accounting is legitimately triggered
// from two concurrent event paths per payment (payment:succeeded AND the
// booking:paid emitted by the booking-payment listener). Without serialization
// the two handlers race into concurrent first-time org provisioning and the
// org-book posting stalls on MySQL gap locks for ~1s — or deadlocks on busy
// traffic. The mutex makes the second trigger deterministically idempotent
// (it re-runs after the first completes and hits the hasPosting skip). Cross-
// process safety remains enforced by the ledger_entries.uk_dedup constraint.
const accountingEntityLocks = new Map<string, Promise<unknown>>();

async function runEntityExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = accountingEntityLocks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  const tail = run.then(() => undefined, () => undefined);
  accountingEntityLocks.set(key, tail);
  tail.finally(() => {
    // Garbage-collect idle keys: only delete if we are still the latest tail
    // (a newer caller replaces the map entry, so we must not clear their lock).
    if (accountingEntityLocks.get(key) === tail) accountingEntityLocks.delete(key);
  });
  return run;
}

// Idempotency guard for registerAccountingEventListeners(). Reset by the
// exported test helper so a test file can re-register on a clean slate.
let accountingListenersRegistered = false;

/** Test-only: clear the guard so registerAccountingEventListeners() can run again. */
export function resetAccountingEventListenersForTest(): void {
  accountingListenersRegistered = false;
}

function refTypeToSourceType(referenceType: string): SourceType {
  switch (referenceType) {
    case 'booking': return 'booking';
    case 'order': return 'marketplace';
    case 'wallet_topup': return 'wallet';
    default: return referenceType as SourceType;
  }
}

export interface OrderEconomics {
  orderId: number;
  merchantId: number | null;
  /** Seller merchandise gross (products before shipping/tax AND before discount). */
  grossMerchandise: number;
  discountAmount: number;
  commission: number;
  shipping: number;
  tax: number;
  /** Seller net merchandise payable = grossMerchandise − discount − commission (2202). */
  merchantNet: number;
  /** Full collected amount = merchandise − discount + shipping + tax (clearing). */
  grossAmount: number;
  paymentMethod: string;
  cashHolder: string;
}

/**
 * Resolve marketplace order economics for a SINGLE seller-order (one seller per
 * order row). CourtZon revenue = commission only; merchant share = payable;
 * tax = liability; shipping = separate payable to the beneficiary.
 */
async function resolveOrderEconomics(orderId: number): Promise<OrderEconomics | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT o.id, o.subtotal, o.discount_amount, o.shipping_cost, o.total, o.tax_amount, o.commission_amount, o.courtzon_fee, o.payment_method, o.cash_holder
     FROM orders o WHERE o.id = ? LIMIT 1`,
    [orderId],
  );
  if (!rows.length) return null;
  const o = rows[0] as any;
  const [items] = await pool.execute<RowData>(
    `SELECT DISTINCT seller_id FROM order_items WHERE order_id = ? LIMIT 1`, [orderId],
  );
  const merchantId = (items as any[])[0]?.seller_id ?? null;
  const grossMerchandise = Number(o.subtotal || 0);
  // orders.subtotal is the GROSS merchandise (pre-discount); discount_amount is
  // stored separately and `total` = subtotal − discount + shipping + tax. The
  // GL seller net must subtract the discount so the ledger balances against the
  // customer-charged clearing amount and reconciles to the entitlement formula
  // (ORGANIZATION_EARNING = itemTotal − itemDiscount − itemCommission + shipping).
  const discountAmount = Number(o.discount_amount || 0);
  const shipping = Number(o.shipping_cost || 0);
  const tax = Number(o.tax_amount || 0);
  // commission_amount is persisted at order creation; courtzon_fee is only set
  // later during confirmation (after payment:succeeded fires) — prefer the
  // creation-time snapshot, fall back to courtzon_fee for older rows.
  const commission = Number(o.commission_amount || o.courtzon_fee || 0);
  const merchantNet = Math.round((grossMerchandise - discountAmount - commission) * 100) / 100;
  const grossAmount = Number(o.total || 0);

  // cash_holder is only set during confirmation — derive from payment_method
  // for the payment-time custody decision (cash/COD ⇒ org holds cash).
  const paymentMethod = o.payment_method || 'card';
  const cashHolder = o.cash_holder || (paymentMethod === 'cash' ? 'org' : 'courtzon');

  return {
    orderId,
    merchantId,
    grossMerchandise,
    discountAmount,
    commission,
    shipping,
    tax,
    merchantNet,
    grossAmount,
    paymentMethod,
    cashHolder,
  };
}

/**
 * Resolve ALL seller-orders belonging to the same checkout group as `orderId`.
 * A multi-seller checkout creates one order per seller sharing a
 * checkout_group_id; the payment:succeeded event references only the primary
 * order, so accounting must fan out to every sibling order in the group.
 */
async function resolveCheckoutOrderIds(orderId: number): Promise<number[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT checkout_group_id FROM orders WHERE id = ? LIMIT 1`,
    [orderId],
  );
  const groupId = (rows as any[])[0]?.checkout_group_id;
  if (!groupId) return [orderId];
  const [group] = await pool.execute<RowData>(
    `SELECT id FROM orders WHERE checkout_group_id = ? ORDER BY id`,
    [groupId],
  );
  const ids = (group as any[]).map((r: any) => Number(r.id));
  return ids.length ? ids : [orderId];
}

/**
 * Post the ORGANIZATION BOOK for a single seller-order. The organization records
 * its OWN economics entirely separate from CourtZon's book (org-scoped lines).
 *   Dr org Marketplace Receivable   = merchantNet + shipping  (due from CourtZon)
 *   Dr org Marketplace Commission Exp = commission
 *   Cr org Marketplace Sales Revenue = gross merchandise − discount
 *   Cr org Shipping Liability        = shipping
 * Balanced: Dr (merchantNet+shipping+commission) = Cr (merchantNet+commission+shipping).
 * Idempotent per (source_type, source_id, 'marketplace_org_receivable').
 */
async function postOrganisationBookAccounting(econ: OrderEconomics, currency: string, oid: number): Promise<void> {
  if (!econ.merchantId) return;
  await postAccountingEvent(
    'marketplace_org_receivable', 'marketplace', oid, econ.merchantId,
    {
      marketplace_receivable: Math.round((econ.merchantNet + econ.shipping) * 100) / 100,
      commission_expense: econ.commission,
      sales_revenue: Math.round((econ.grossMerchandise - econ.discountAmount) * 100) / 100,
      shipping_liability: econ.shipping,
    },
    currency,
    `Order #${oid} organization book (sales/commission/shipping)`,
    undefined,
    {
      marketplace_receivable: econ.merchantId,
      commission_expense: econ.merchantId,
      sales_revenue: econ.merchantId,
      shipping_liability: econ.merchantId,
    },
  );
}

/**
 * Post the ORGANIZATION BOOK reversal for a single seller-order (refund/cancel).
 * Symmetric reversal of the org's marketplace economics.
 */
async function postOrganisationBookReversalAccounting(econ: OrderEconomics, currency: string, oid: number): Promise<void> {
  if (!econ.merchantId) return;
  await postAccountingEvent(
    'marketplace_org_receivable_reversal', 'marketplace', oid, econ.merchantId,
    {
      sales_revenue: Math.round((econ.grossMerchandise - econ.discountAmount) * 100) / 100,
      shipping_liability: econ.shipping,
      marketplace_receivable: Math.round((econ.merchantNet + econ.shipping) * 100) / 100,
      commission_expense: econ.commission,
    },
    currency,
    `Order #${oid} organization book reversal`,
    undefined,
    {
      sales_revenue: econ.merchantId,
      shipping_liability: econ.merchantId,
      marketplace_receivable: econ.merchantId,
      commission_expense: econ.merchantId,
    },
  );
}

/**
 * Post the ORGANIZATION BOOK for a CASH/COD seller-order at START PROCESSING.
 * The org collected (or will collect) the customer's cash directly, so the org
 * records the FULL customer gross (receivable from the customer) and the
 * commission it owes CourtZon as a payable — a distinct split from card/wallet:
 *   Dr org Marketplace Receivable      = gross (sales − discount + shipping)
 *   Dr org Marketplace Commission Exp  = commission
 *   Cr org Marketplace Sales Revenue   = gross merchandise − discount
 *   Cr org Shipping Liability          = shipping
 *   Cr org CourtZon Payable            = commission (owed to CourtZon)
 * Balanced: Dr (gross + commission) = Cr (sales + shipping + commission).
 * Idempotent per (source_type, source_id, 'marketplace_org_cash_receivable').
 */
async function postOrganisationCashBookAccounting(econ: OrderEconomics, currency: string, oid: number): Promise<void> {
  if (!econ.merchantId) return;
  const gross = Math.round(((econ.grossMerchandise - econ.discountAmount) + econ.shipping) * 100) / 100;
  const salesRevenue = Math.round((econ.grossMerchandise - econ.discountAmount) * 100) / 100;
  await postAccountingEvent(
    'marketplace_org_cash_receivable', 'marketplace', oid, econ.merchantId,
    {
      marketplace_receivable: gross,
      commission_expense: econ.commission,
      sales_revenue: salesRevenue,
      shipping_liability: econ.shipping,
      courtzon_payable: econ.commission,
    },
    currency,
    `Order #${oid} organization book (cash at start processing)`,
    undefined,
    {
      marketplace_receivable: econ.merchantId,
      commission_expense: econ.merchantId,
      sales_revenue: econ.merchantId,
      shipping_liability: econ.merchantId,
      courtzon_payable: econ.merchantId,
    },
  );
}

/**
 * Reverse the ORGANIZATION BOOK CASH postings (refund/cancel) for a seller-order.
 */
async function postOrganisationCashBookReversalAccounting(econ: OrderEconomics, currency: string, oid: number): Promise<void> {
  if (!econ.merchantId) return;
  // Reverse the org book only if the original org cash book posting actually
  // exists. Cash books at START PROCESSING; if that posting was never created
  // (e.g. an order cancelled before processing), there is nothing to reverse —
  // posting a reversal-only org entry would leave an unbalanced/spurious row.
  const orgBooked = await ledgerRepository.hasPosting('marketplace', oid, 'marketplace_org_cash_receivable');
  if (!orgBooked) return;
  const gross = Math.round(((econ.grossMerchandise - econ.discountAmount) + econ.shipping) * 100) / 100;
  const salesRevenue = Math.round((econ.grossMerchandise - econ.discountAmount) * 100) / 100;
  await postAccountingEvent(
    'marketplace_org_cash_receivable_rev', 'marketplace', oid, econ.merchantId,
    {
      sales_revenue: salesRevenue,
      shipping_liability: econ.shipping,
      courtzon_payable: econ.commission,
      marketplace_receivable: gross,
      commission_expense: econ.commission,
    },
    currency,
    `Order #${oid} organization book cash reversal`,
    undefined,
    {
      sales_revenue: econ.merchantId,
      shipping_liability: econ.merchantId,
      courtzon_payable: econ.merchantId,
      marketplace_receivable: econ.merchantId,
      commission_expense: econ.merchantId,
    },
  );
}

/**
 * Post marketplace CARD/WALLET payment accounting for EVERY seller-order in the
 * checkout group.
 *
 * COURTZON BOOK (organisation_id = NULL):
 *   Dr 1100 Payment Clearing            gross
 *   Cr 2202 Merchant Payable (control)  merchantNet + shipping  (total owed to seller)
 *   Cr 4160 Marketplace Revenue         commission
 * The Merchant Payable control is global; per-seller traceability is preserved
 * via source_type/source_id and the seller's own organization-book 1161
 * receivable + financial_entitlements.
 *
 * ORGANIZATION BOOK (organisation_id = seller):
 *   Dr org 1161 Marketplace Receivable (merchantNet + shipping)
 *   Dr org Marketplace Commission Expense
 *   Cr org Marketplace Sales Revenue (gross merchandise − discount)
 *   Cr org Shipping Liability
 *
 * Each seller-order is posted independently and idempotently.
 */
async function postMarketplacePaymentAccounting(orderId: number, paymentMethod: string, currency: string): Promise<void> {
  const orderIds = await resolveCheckoutOrderIds(orderId);
  for (const oid of orderIds) {
    const econ = await resolveOrderEconomics(oid);
    if (!econ) {
      log.error({ orderId: oid }, 'Marketplace order economics not found — skipping accounting');
      continue;
    }
    const eventType = paymentMethod === 'wallet' ? 'marketplace_wallet_payment' : 'marketplace_card_payment';
    // CourtZon total payable to the seller = merchandise net + shipping.
    const totalPayable = Math.round((econ.merchantNet + econ.shipping) * 100) / 100;
    await postAccountingEvent(
      eventType, 'marketplace', oid, null,
      {
        merchant_payable: totalPayable,
        platform_commission: econ.commission,
        tax_liability: econ.tax,
        payment_clearing: eventType === 'marketplace_card_payment' ? econ.grossAmount : 0,
        wallet_liability_spend: eventType === 'marketplace_wallet_payment' ? econ.grossAmount : 0,
      },
      currency,
      `Order #${oid} payment (custody: ${econ.cashHolder})`,
      undefined,
      {
        merchant_payable: null,
        platform_commission: null,
        payment_clearing: null,
        tax_liability: null,
        wallet_liability_spend: null,
      },
    );
    await postOrganisationBookAccounting(econ, currency, oid);
  }
}

/**
 * Post PAYMENT-GATEWAY SETTLEMENT accounting (CourtZon book only).
 *
 * A successful CARD/CREDIT marketplace payment debits 1100 Payment Clearing
 * (the gateway-clearing asset) — the money is held by the payment gateway, NOT
 * yet in CourtZon's bank/cash. Only when the gateway ACTUALLY settles and
 * transfers the accumulated clearing balance to CourtZon's bank does this
 * event post:
 *   Dr 1120 Cash / Bank (net received)
 *   Dr 5210 Payment Gateway Fees (gateway fee expense)
 *   Cr 1100 Payment Clearing (gross)
 * which zeroes the gateway clearing asset for the settled amount and increases
 * Bank ONLY on a genuine settlement signal. When no gateway fee applies
 * (net == gross, fee == 0) the fee leg is omitted and the posting is exactly
 * the historical Dr 1120 / Cr 1100 for the gross.
 *
 * organisation_id stays NULL: the gateway clearing asset and the bank are
 * CourtZon's accounts, never org-scoped. Idempotent per
 * (source_type='settlement', source_id, event_type='payment_gateway_settlement').
 *
 * Backward-compatible signature: callers that pass (sourceId, amount, currency)
 * are treated as a settlement with no gateway fee (gross == net == amount).
 */
async function postGatewaySettlementAccounting(sourceId: number, amount: number, currency: string): Promise<void>;
async function postGatewaySettlementAccounting(sourceId: number, gross: number, net: number, fee: number, currency: string, outerConn?: import('mysql2/promise').PoolConnection): Promise<void>;
async function postGatewaySettlementAccounting(
  sourceId: number,
  gross: number,
  netOrAmount: number | string,
  feeOrCurrency?: number | string,
  currency?: string,
  outerConn?: import('mysql2/promise').PoolConnection,
): Promise<void> {
  if (!sourceId || gross <= 0) return;

  let net: number;
  let fee: number;
  let cur: string;
  if (typeof netOrAmount === 'string') {
    // Legacy call: postGatewaySettlementAccounting(sourceId, amount, currency)
    net = gross;
    fee = 0;
    cur = netOrAmount;
  } else {
    net = netOrAmount as number;
    fee = (feeOrCurrency as number) ?? 0;
    cur = currency || 'EGP';
  }

  const conceptAmounts: Record<string, number> = { cash_bank: net, payment_clearing: gross };
  if (fee > 0) conceptAmounts.payment_gateway_fee = fee;

  await postAccountingEvent(
    'payment_gateway_settlement', 'settlement', sourceId, null,
    conceptAmounts,
    cur,
    `Payment gateway settlement #${sourceId} (clearing → bank${fee > 0 ? `, gateway fee ${fee}` : ''})`,
    outerConn,
  );
}

/**
 * Reversal of a payment-gateway settlement — posts the exact opposite movement
 * (Dr Payment Clearing gross / Cr Cash-Bank net + Cr Payment Gateway Fees fee)
 * with event_type='payment_gateway_settlement_reversal'. The ORIGINAL journal
 * (payment_gateway_settlement) is preserved as immutable history — it is never
 * edited or deleted; the reversal is a NEW balanced journal referencing the same
 * (source_type='settlement', source_id). Amounts come from the STORED settlement
 * batch (never recomputed from payment rows). When no fee is configured
 * (fee == 0, net == gross) the fee leg is omitted and the posting is exactly
 * Dr 1100 / Cr 1120 for the gross.
 *
 * organisation_id stays NULL (CourtZon book). Idempotent per
 * (source_type='settlement', source_id, event_type='payment_gateway_settlement_reversal')
 * — a crash-safe replay or the post-commit listener re-dispatching the event is a
 * safe no-op.
 */
async function postGatewaySettlementReversalAccounting(
  sourceId: number,
  gross: number,
  net: number,
  fee: number,
  currency: string,
  outerConn?: import('mysql2/promise').PoolConnection,
): Promise<void> {
  if (!sourceId || gross <= 0) return;

  const conceptAmounts: Record<string, number> = {};
  conceptAmounts.payment_clearing = gross;
  conceptAmounts.cash_bank = fee > 0 ? net : gross;
  if (fee > 0) conceptAmounts.payment_gateway_fee = fee;

  await postAccountingEvent(
    'payment_gateway_settlement_reversal', 'settlement', sourceId, null,
    conceptAmounts,
    currency || 'EGP',
    `Reversal of payment gateway settlement #${sourceId} (bank → clearing${fee > 0 ? `, gateway fee ${fee}` : ''})`,
    outerConn,
  );
}

async function postMarketplaceRefundAccounting(orderId: number, currency: string): Promise<void> {
  const orderIds = await resolveCheckoutOrderIds(orderId);
  for (const oid of orderIds) {
    const econ = await resolveOrderEconomics(oid);
    if (!econ) {
      log.error({ orderId: oid }, 'Marketplace order economics not found — skipping refund accounting');
      continue;
    }
    // Reverse the CourtZon book (merchant payable control + commission + tax)
    // and the organization book.
    const isWallet = econ.paymentMethod === 'wallet';
    const eventType = isWallet ? 'marketplace_wallet_refund' : 'marketplace_merchant_refund';
    const totalPayable = Math.round((econ.merchantNet + econ.shipping) * 100) / 100;
    await postAccountingEvent(
      eventType, 'marketplace', oid, null,
      {
        merchant_payable: totalPayable,
        platform_commission: econ.commission,
        tax_liability: econ.tax,
        payment_clearing: isWallet ? 0 : econ.grossAmount,
        wallet_liability: isWallet ? econ.grossAmount : 0,
      },
      currency,
      `Order #${oid} refunded (custody reversal)`,
      undefined,
      {
        merchant_payable: null,
        platform_commission: null,
        payment_clearing: null,
        tax_liability: null,
        wallet_liability: null,
      },
    );
    await postOrganisationBookReversalAccounting(econ, currency, oid);
  }
}

/**
 * Post marketplace CASH/COD commission receivable. The seller collected the
 * customer's cash directly, so CourtZon is owed only its commission (a
 * receivable from the seller). The full customer amount NEVER enters 1100.
 * Per-seller-order, idempotent.
 */
/**
 * Post marketplace CASH/COD accounting for EVERY seller-order.
 *
 * COURTZON BOOK (org NULL): the seller collected the customer's cash directly,
 * so CourtZon records ONLY its commission receivable:
 *   Dr 1161 Marketplace Receivable  commission
 *   Cr 4160 Marketplace Revenue      commission
 * The full customer amount NEVER enters 1100, and CourtZon's 1161 is CourtZon's
 * own asset (org NULL) — never org-scoped.
 *
 * ORGANIZATION BOOK (org = seller): the org records its own economics
 * (sales revenue / commission expense / shipping liability / receivable).
 * Per-seller-order, idempotent.
 */
async function postMarketplaceCashCommissionAccounting(orderId: number, currency: string): Promise<void> {
  const orderIds = await resolveCheckoutOrderIds(orderId);
  for (const oid of orderIds) {
    const econ = await resolveOrderEconomics(oid);
    if (!econ) {
      log.error({ orderId: oid }, 'Marketplace order economics not found — skipping cash accounting');
      continue;
    }
    await postAccountingEvent(
      'marketplace_cash_commission', 'marketplace', oid, null,
      { marketplace_receivable: econ.commission, platform_commission: econ.commission },
      currency,
      `Order #${oid} start processing (cash — commission receivable)`,
      undefined,
      { marketplace_receivable: null, platform_commission: null },
    );
    await postOrganisationCashBookAccounting(econ, currency, oid);
  }
}

/**
 * Reverse a marketplace cash/COD commission receivable on refund/cancel.
 * Reverses CourtZon's 1161 receivable + 4160 revenue (org NULL) and the
 * organization book — per-seller-order.
 */
async function postMarketplaceCashReversalAccounting(orderId: number, currency: string, action: 'refunded' | 'cancelled'): Promise<void> {
  const orderIds = await resolveCheckoutOrderIds(orderId);
  for (const oid of orderIds) {
    const econ = await resolveOrderEconomics(oid);
    if (!econ) {
      log.error({ orderId: oid }, 'Marketplace order economics not found — skipping cash reversal');
      continue;
    }
    const delivered = await ledgerRepository.hasPosting('marketplace', oid, 'marketplace_cash_commission');
    if (!delivered) continue;
    await postAccountingEvent(
      'marketplace_cash_reversal', 'marketplace', oid, null,
      { platform_commission: econ.commission, marketplace_receivable: econ.commission },
      currency,
      `Order #${oid} ${action} (cash — commission receivable reversed)`,
      undefined,
      { platform_commission: null, marketplace_receivable: null },
    );
    await postOrganisationCashBookReversalAccounting(econ, currency, oid);
  }
}

/**
 * F-2: Marketplace complaint refund — symmetric reversal of the original
 * marketplace custody economics.
 *
 * A complaint refund credits the buyer's wallet (2100). It must reverse the
 * SAME economic legs the original marketplace payment posted:
 *   CARD/WALLET: Dr merchant_payable + platform_commission + tax_liability
 *   COD:         Dr platform_commission + tax_liability + merchant-share
 *                receivable (CourtZon refunded the buyer from its own wallet;
 *                the org collected the COD cash, so CourtZon holds a receivable
 *                for the refunded merchant share).
 *
 * The refund split comes from the complaint refund engine metadata:
 *   orgAdjustment     = org's share being reversed (tax-inclusive org earning;
 *                        for post-settlement recovery this is the BOUNDED
 *                        orgRecoveryAmount, which can be < the full refund)
 *   commissionReversal = CourtZon commission being reversed
 * The org earning includes tax (F-9 pass-through), so the tax-consistent
 * merchant_payable reversal is orgAdjustment − taxReversal, with taxReversal
 * booked separately to tax_liability. Balance is preserved:
 *   (orgAdjustment − taxReversal) + commissionReversal + taxReversal
 *     = orgAdjustment + commissionReversal.
 *
 * F-2 × F-5: for a POST-SETTLEMENT refund, orgAdjustment is the bounded
 * recovery amount (never more than the settled org earning), so it can be LESS
 * than refundAmount − commissionReversal. The residual
 *   excessRefund = refundAmount − orgAdjustment − commissionReversal
 * is money CourtZon refunds to the buyer that cannot be recovered from the org
 * (already settled, bounded) or from CourtZon's own commission. That remainder
 * is a genuine CourtZon refund/chargeback cost, booked to refund_expense
 * (5220 Refund / Chargeback Costs) — an existing COA account. This keeps every
 * valid complaint refund posting balanced and prevents the GL reversal from
 * being silently dropped:
 *   CARD/WALLET: (orgAdj − tax) + commission + tax + excess = refundAmount.
 *
 * Replaces the previous generic wallet_refund (4300 revenue_contra / 2100)
 * which did not reverse the original marketplace legs.
 */
export async function postMarketplaceComplaintRefundAccounting(
  complaintId: number,
  refundAmount: number,
  currency: string,
  data: any,
): Promise<void> {
  const m = data.metadata || {};
  const orgAdjustment = Math.max(0, Number(m.orgAdjustment ?? 0));
  const commissionReversal = Math.max(0, Number(m.commissionReversal ?? 0));
  const organisationId = Number(m.organisationId ?? 0) || null;
  const itemTax = Math.max(0, Number(m.itemTax ?? 0));
  const originalOrgEarning = Math.max(0, Number(m.settledOrgEarning ?? m.originalOrgEarning ?? 0));
  const cashHolder = m.cashHolder;
  const isCOD = cashHolder === 'org';
  const refundAmountR = Math.max(0, Number(refundAmount) || 0);

  // Tax-consistent split: taxReversal is the tax share of the refunded org
  // adjustment (org earning includes tax per F-9). When no tax is present the
  // split collapses to orgAdjustment and the posting is still balanced.
  let taxReversal = 0;
  if (itemTax > 0 && originalOrgEarning > 0 && orgAdjustment > 0) {
    taxReversal = Math.min(itemTax, Math.round((orgAdjustment * (itemTax / originalOrgEarning)) * 100) / 100);
  }
  const merchantPayableReversal = Math.max(0, Math.round((orgAdjustment - taxReversal) * 100) / 100);

  if (isCOD) {
    // COD custody: no merchant_payable was ever posted (the org collected
    // cash). CourtZon refunded the buyer from its wallet; the refunded
    // merchant share becomes a receivable from the org.
    const merchantShareReceivable = Math.max(0, Math.round((refundAmountR - commissionReversal - taxReversal) * 100) / 100);
    await postAccountingEvent(
      'complaint_refund', 'marketplace', complaintId, organisationId,
      {
        platform_commission: commissionReversal,
        tax_liability: taxReversal,
        receivable_from_org: merchantShareReceivable,
        wallet_liability: refundAmountR,
      },
      currency,
      `Complaint #${complaintId} refunded (COD custody reversal)`,
    );
    return;
  }

  // CARD / WALLET custody: reverse the merchant payable + commission + tax,
  // crediting the buyer's wallet. When a bounded post-settlement recovery
  // leaves an unrecoverable excess, book it to refund_expense so the posting
  // stays balanced.
  const excessRefund = Math.max(0, Math.round((refundAmountR - orgAdjustment - commissionReversal) * 100) / 100);
  await postAccountingEvent(
    'complaint_refund', 'marketplace', complaintId, organisationId,
    {
      merchant_payable: merchantPayableReversal,
      platform_commission: commissionReversal,
      tax_liability: taxReversal,
      refund_expense: excessRefund,
      wallet_liability: refundAmountR,
    },
    currency,
    `Complaint #${complaintId} refunded (custody reversal)`,
  );
}

async function postMembershipPaymentAccounting(
  subscriptionId: number,
  paymentMethod: string,
  currency: string,
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT id, organisation_id, total_amount, commission_amount, org_net_amount, currency
     FROM membership_subscriptions WHERE id = ? LIMIT 1`,
    [subscriptionId],
  );
  const sub = (rows as any[])[0];
  if (!sub) {
    log.error({ subscriptionId }, 'Membership subscription missing for accounting — skipping posting');
    return;
  }
  const total = Math.round(Number(sub.total_amount) * 100) / 100;
  const commission = Math.round(Number(sub.commission_amount) * 100) / 100;
  const orgNet = Math.round(Number(sub.org_net_amount) * 100) / 100;
  const orgId = sub.organisation_id != null ? Number(sub.organisation_id) : null;
  const cur = String(sub.currency || currency || 'EGP');

  if (paymentMethod === 'cash') {
    // CourtZon book — the org collected the cash; CourtZon is owed only its
    // commission. Tax = 0 (same decision as bookings).
    await postAccountingEvent(
      'membership_cash_payment', 'membership', subscriptionId, null,
      { marketplace_receivable: commission, platform_commission: commission, tax_liability: 0 },
      cur,
      `Membership subscription #${subscriptionId} cash payment`,
    );
    if (orgId != null) {
      await postAccountingEvent(
        'membership_org_cash_receivable', 'membership', subscriptionId, orgId,
        { org_cash_bank: total, commission_expense: commission, membership_revenue: total, courtzon_payable: commission },
        cur,
        `Membership subscription #${subscriptionId} organization book (cash collected)`,
      );
    }
    return;
  }

  // Card / online — CourtZon is merchant of record (Dr 1100 gross / Cr 2202
  // org net / Cr 4110 commission / Cr 2300 tax 0).
  await postAccountingEvent(
    'membership_card_payment', 'membership', subscriptionId, null,
    { payment_clearing: total, merchant_payable: orgNet, platform_commission: commission, tax_liability: 0 },
    cur,
    `Membership subscription #${subscriptionId} card payment`,
  );
  if (orgId != null) {
    await postAccountingEvent(
      'membership_org_receivable', 'membership', subscriptionId, orgId,
      { marketplace_receivable: orgNet, commission_expense: commission, membership_revenue: total },
      cur,
      `Membership subscription #${subscriptionId} organization book (card custody)`,
    );
  }
}

async function resolveOrgId(referenceType: string, referenceId: number): Promise<number | null> {
  const pool = getPool();
  if (referenceType === 'booking') {
    const [rows] = await pool.execute<RowData>(
      'SELECT organisation_id FROM bookings WHERE id = ?', [referenceId],
    );
    return (rows as any[])[0]?.organisation_id ?? null;
  }
  if (referenceType === 'order') {
    const [rows] = await pool.execute<RowData>(
      'SELECT DISTINCT oi.seller_id AS organisation_id FROM order_items oi WHERE oi.order_id = ? LIMIT 1',
      [referenceId],
    );
    return (rows as any[])[0]?.organisation_id ?? null;
  }
  return null;
}

async function postAccountingEvent(
  eventType: string,
  sourceType: SourceType,
  sourceId: number,
  organisationId: number | null,
  conceptAmounts: Record<string, number>,
  currency: string,
  description: string,
  outerConn?: import('mysql2/promise').PoolConnection,
  conceptOrganisations?: Record<string, number | null>,
  timezone?: string | null,
): Promise<void> {
  const alreadyPosted = await ledgerRepository.hasPosting(sourceType, sourceId, eventType);
  if (alreadyPosted) {
    log.info({ eventType, sourceType, sourceId }, 'Accounting posting already exists — idempotent skip');
    return;
  }

  const mapping = await accountingEngineService.resolveMapping(eventType, organisationId);
  const accountIds = mapping.map(m => m.accountId);
  await accountingEngineService.validateAccounts(accountIds, organisationId);

  const resolved = accountingEngineService.buildLedgerLines(eventType, mapping, conceptAmounts, conceptOrganisations);
  accountingEngineService.validateBalance(resolved);

  // transaction_id is varchar(64) — keep it within the limit for long event
  // type names (e.g. marketplace_cash_commission) and large source ids.
  const transactionId = `acct_${eventType}_${sourceType}_${sourceId}_${Date.now().toString(36)}`.slice(0, 64);
  const lines: LedgerLineInput[] = resolved.map(l => ({
    transactionId,
    sourceType,
    sourceId,
    eventType,
    organisationId: l.organisationId !== undefined ? l.organisationId : organisationId,
    chartAccountId: l.accountId,
    side: l.side as EntrySide,
    amount: l.amount,
    currency,
    description,
  }));

  const entries = createLedgerLines(lines);
  if (!validateLedgerBalance(entries)) {
    throw new Error('Ledger lines are not balanced');
  }

  const recordedAt = entries[0]?.recordedAt || new Date().toISOString().slice(0, 19).replace('T', ' ');
  // The GL business date is the LOCAL date in the configured timezone (default
  // platform `localization.timezone`, e.g. Africa/Cairo), NOT the server UTC
  // date — this keeps the accounting period correct for transactions around
  // midnight. `recordedAt` itself stays a UTC instant; only the date
  // projection changes.
  const entryDate = await getLocalBusinessDate(recordedAt, timezone);
  const periodId = await glProjectionService.resolvePeriod(entryDate, organisationId);
  await glProjectionService.validateOpenPeriod(periodId);

  // Set period_id on canonical entries
  for (const e of entries) e.periodId = periodId;

  // If caller supplied an outer connection, participate in that transaction.
  if (outerConn) {
    const leIds = await ledgerRepository.createEntries(entries, outerConn);
    const projectable = entries.map((e, i) => ({
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      eventType: e.eventType ?? null,
      organisationId: e.organisationId ?? null,
      chartAccountId: e.chartAccountId ?? null,
      side: e.side,
      amount: e.amount,
      description: e.description,
      recordedAt: e.recordedAt,
      ledgerEntryId: leIds[i],
    }));
    await glProjectionService.projectEntries(projectable, periodId, outerConn);
    log.info({ eventType, sourceType, sourceId, organisationId, lines: lines.length, periodId }, 'Accounting posting created (outer tx)');
    return;
  }

  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const leIds = await ledgerRepository.createEntries(entries, conn);

    const projectable = entries.map((e, i) => ({
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      eventType: e.eventType ?? null,
      organisationId: e.organisationId ?? null,
      chartAccountId: e.chartAccountId ?? null,
      side: e.side,
      amount: e.amount,
      description: e.description,
      recordedAt: e.recordedAt,
      ledgerEntryId: leIds[i],
    }));
    await glProjectionService.projectEntries(projectable, periodId, conn);

    await conn.commit();
    log.info({ eventType, sourceType, sourceId, organisationId, lines: lines.length, periodId }, 'Accounting posting created');
    // Post-COMMIT realtime signal: finance surfaces may now refetch. Only the
    // self-committing path emits here — callers that pass an outer connection
    // emit themselves after their own commit, so the UI never refreshes on an
    // entry that is not yet durable. Idempotent skips above never emit.
    eventBusV2.emit('accounting:entry-recorded', {
      eventType,
      sourceType,
      sourceId,
      organisationId,
    });
  } catch (err: any) {
    await conn.rollback();
    if (err?.code === 'ER_DUP_ENTRY') {
      log.info({ err: err.message }, 'Duplicate — idempotent rollback from DB constraint');
      return;
    }
    throw err;
  } finally {
    conn.release();
  }
}

async function postBookingPaymentAccounting(bookingId: number, paymentMethod: string, currency: string): Promise<void> {
  // Serialize per organisation (not per booking): the double-trigger handlers
  // (payment:succeeded + booking:paid) and concurrent bookings of the same org
  // must not race first-time org provisioning, which stalls on MySQL gap locks.
  const econ = await bookingAccounting.resolveBookingEconomics(bookingId);
  const key = econ ? `booking-org:${econ.organisationId ?? 'global'}` : `booking:${bookingId}`;
  return runEntityExclusive(key, () => postBookingPaymentAccountingInner(bookingId, paymentMethod, currency));
}

// ─────────────────────────────────────────────────────────────────────────────
// R5-C2 — recurring SERIES card payment accounting (ONE recognition).
//
// A paid series is ONE `payment_transactions` row (reference_type =
// 'booking_series', amount = seriesGross, booking_id = NULL) covering N
// occurrences. The economics are aggregated EXCLUSIVELY from the persisted
// per-occurrence snapshots (R5-A: total_amount / commission_amount /
// club_amount / tax_amount) through the canonical round2 rule — never from a
// client value and never through an aggregate re-calculation.
//
// CourtZon book (org NULL): Dr 1100 Payment Clearing = gross ·
//   Cr 2202 Merchant Payable = Σ org net · Cr 4110 Platform Commission =
//   Σ commission · Cr 2300 Tax Liability = Σ tax.
// Organization book (org-scoped): Dr 1161 = Σ org net · Dr commission expense =
//   Σ commission · Cr court rental revenue = Σ org net + Σ commission
//   (== seriesSubtotal for exact-economics series).
//
// The per-booking occurrence guards (postBookingPaymentAccountingInner's
// `econ.seriesId` early-return) remain untouched, so the SAME money can NEVER
// be recognized both here and per occurrence.
// ─────────────────────────────────────────────────────────────────────────────

interface SeriesAccountingEconomics {
  seriesId: number;
  organisationId: number | null;
  branchId: number;
  /** Charged to the gateway (R5-C1): round2(seriesSubtotal + seriesTax). */
  gross: number;
  /** Balanced debit amount: round2(orgNet + commission + tax). */
  grossPayable: number;
  subtotal: number;
  tax: number;
  commission: number;
  orgNet: number;
}

async function resolveSeriesAccountingEconomics(seriesId: number): Promise<SeriesAccountingEconomics | null> {
  const series = await bookingSeriesRepository.findById(seriesId);
  if (!series) {
    log.error({ seriesId }, 'Series not found — skipping series accounting');
    return null;
  }
  const occurrences = await bookingRepository.findBySeries(seriesId);
  if (!occurrences.length) {
    log.error({ seriesId }, 'Recurring series has no occurrence bookings — skipping series accounting');
    return null;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const sum = (f: (b: any) => number) => r2(occurrences.reduce((s, b) => s + (f(b) || 0), 0));
  const subtotal = sum((b) => Number(b.total_amount));
  const tax = sum((b) => Number(b.tax_amount));
  const commission = sum((b) => Number(b.commission_amount));
  const orgNet = sum((b) => Number(b.club_amount));
  const gross = r2(subtotal + tax); // == payment_transactions.amount (R5-C1)
  // Balance the journal by construction (org + commission + tax), mirroring
  // booking_card_payment's `grossPayable`. For exact-economics series this
  // equals the charged gross — log loudly if commission rounding ever drifts a
  // piastre so it is visible rather than silently mis-linked.
  const grossPayable = r2(orgNet + commission + tax);
  if (Math.abs(gross - grossPayable) >= 0.01) {
    log.warn(
      { seriesId, gross, grossPayable, subtotal, tax, commission, orgNet },
      'Series ledger grossPayable (org+commission+tax) differs from charged seriesGross by ≥1pt — rounding drift; journal stays balanced by construction',
    );
  }
  return {
    seriesId,
    organisationId: series.organisationId ?? null,
    branchId: series.branchId,
    gross,
    grossPayable,
    subtotal,
    tax,
    commission,
    orgNet,
  };
}

async function postSeriesPaymentAccounting(seriesId: number, currency: string): Promise<void> {
  const econ = await resolveSeriesAccountingEconomics(seriesId);
  const key = econ ? `booking-series-org:${econ.organisationId ?? 'global'}` : `booking-series:${seriesId}`;
  return runEntityExclusive(key, () => postSeriesPaymentAccountingInner(seriesId, currency));
}

async function postSeriesPaymentAccountingInner(seriesId: number, currency: string): Promise<void> {
  const econ = await resolveSeriesAccountingEconomics(seriesId);
  if (!econ) return;

  // ── CourtZon book (org NULL) — Dr 1100 gross / Cr 2202 org net /
  //    Cr 4110 commission / Cr 2300 tax. One series → exactly one posting
  //    (hasPosting('booking', seriesId, eventType) dedupes webhook/confirm/
  //    recover/sync replays).
  await postAccountingEvent(
    'booking_series_card_payment', 'booking', seriesId, null,
    {
      payment_clearing: econ.grossPayable,
      merchant_payable: econ.orgNet,
      platform_commission: econ.commission,
      tax_liability: econ.tax,
    },
    currency,
    `Recurring series #${seriesId} card payment (custody: card/wallet)`,
    undefined,
    { payment_clearing: null, merchant_payable: null, platform_commission: null, tax_liability: null },
  );

  // ── Organization book (org-scoped) — Dr 1161 org net / Dr commission
  //    expense / Cr court rental revenue = orgNet + commission. Mirrors
  //    booking_org_receivable and is independently idempotent.
  const orgId = econ.organisationId;
  if (orgId != null) {
    const courtRentalRevenue = Math.round((econ.orgNet + econ.commission) * 100) / 100;
    await postAccountingEvent(
      'booking_series_org_receivable', 'booking', seriesId, orgId,
      {
        marketplace_receivable: econ.orgNet,
        commission_expense: econ.commission,
        court_rental_revenue: courtRentalRevenue,
      },
      currency,
      `Recurring series #${seriesId} organization book (court rental/commission)`,
      undefined,
      { marketplace_receivable: orgId, commission_expense: orgId, court_rental_revenue: orgId },
    );
  } else {
    log.info({ seriesId }, 'Series has no organisationId — organization book skipped (CourtZon book posted)');
  }
}

// R5-C4 — recurring series CASH confirmation accounting. R5-C4 does NOT create
// a payment_transactions row (Cash has none, exactly like normal cash). The
// canonical source of truth is the operator's confirmation state + these
// postings. Mirrors the NORMAL Cash/COD contract (booking_cod_payment +
// booking_org_cash_receivable) aggregated at the SERIES level:
//
//   CourtZon book (org NULL) — booking_series_cod_payment:
//     Dr 1161 Marketplace Receivable = commission + tax
//     Cr 4110 Platform Commission     = commission
//     Cr 2300 Tax Liability           = tax
//   Organization book (org-scoped) — booking_series_org_cash_receivable:
//     Dr org ORG-CASH       = series subtotal (TAX-EXCLUSIVE, like every
//                             booking_org_cash_receivable; tax stays in the
//                             CourtZon book via 2300)
//     Dr org commission exp = commission
//     Cr org court revenue  = series subtotal
//     Cr org CourtZon payable = commission
// Idempotent per (source_type='booking', source_id=seriesId, event_type) via
// hasPosting, so repeated operator confirmation never double-posts.
// (Exported via the module's `export { ... }` list below — must NOT carry the
// `export` keyword on the declaration itself, matching every other post fn.)
async function postSeriesCashAccounting(seriesId: number, currency: string): Promise<void> {
  const econ = await resolveSeriesAccountingEconomics(seriesId);
  const key = econ ? `booking-series-cash-org:${econ.organisationId ?? 'global'}` : `booking-series-cash:${seriesId}`;
  return runEntityExclusive(key, () => postSeriesCashAccountingInner(seriesId, currency));
}

async function postSeriesCashAccountingInner(seriesId: number, currency: string): Promise<void> {
  const econ = await resolveSeriesAccountingEconomics(seriesId);
  if (!econ) return;

  // CourtZon book — Dr 1161 (commission + tax) / Cr 4110 / Cr 2300.
  await postAccountingEvent(
    'booking_series_cod_payment', 'booking', seriesId, null,
    {
      marketplace_receivable: Math.round((econ.commission + econ.tax) * 100) / 100,
      platform_commission: econ.commission,
      tax_liability: econ.tax,
    },
    currency,
    `Recurring series #${seriesId} cash payment (commission/tax receivable)`,
    undefined,
    { marketplace_receivable: null, platform_commission: null, tax_liability: null },
  );

  // Organization book — the org physically collected the series cash. Cash is
  // TAX-EXCLUSIVE (the subtotal), exactly matching booking_org_cash_receivable;
  // the tax remains CourtZon's (Cr 2300 above).
  const orgId = econ.organisationId;
  if (orgId != null) {
    const cashBase = Math.round((econ.orgNet + econ.commission) * 100) / 100; // == seriesSubtotal for exact series
    await postAccountingEvent(
      'booking_series_org_cash_receivable', 'booking', seriesId, orgId,
      {
        org_cash_bank: cashBase,
        commission_expense: econ.commission,
        court_rental_revenue: cashBase,
        courtzon_payable: econ.commission,
      },
      currency,
      `Recurring series #${seriesId} organization book (cash collected)`,
      undefined,
      { org_cash_bank: orgId, commission_expense: orgId, court_rental_revenue: orgId, courtzon_payable: orgId },
    );
  } else {
    log.info({ seriesId }, 'Series has no organisationId — organization cash book skipped (CourtZon book posted)');
  }
}

// R5-D1 — FULL recurring series CARD refund reversal. Exact symmetric reversal
// of the R5-C2 recognition (booking_series_card_payment + booking_series_org_
// receivable). Only reachable via payment:refunded for reference_type=
// 'booking_series' (i.e. the canonical gateway refund lifecycle in
// R5-D1's refundSeriesCard). Idempotent via
// hasPosting('booking', seriesId, event_type).
async function postSeriesRefundAccounting(seriesId: number, currency: string): Promise<void> {
  const econ = await resolveSeriesAccountingEconomics(seriesId);
  const key = econ ? `booking-series-refund-org:${econ.organisationId ?? 'global'}` : `booking-series-refund:${seriesId}`;
  return runEntityExclusive(key, () => postSeriesRefundAccountingInner(seriesId, currency));
}

async function postSeriesRefundAccountingInner(seriesId: number, currency: string): Promise<void> {
  const econ = await resolveSeriesAccountingEconomics(seriesId);
  if (!econ) return;

  // CourtZon book — Dr 2202 orgNet / Dr 4110 commission / Dr 2300 tax /
  // Cr 1100 gross. Balanced by construction (orgNet + commission + tax = gross).
  const gross = Math.round((econ.orgNet + econ.commission + econ.tax) * 100) / 100;
  await postAccountingEvent(
    'booking_series_refund', 'booking', seriesId, null,
    {
      merchant_payable: econ.orgNet,
      platform_commission: econ.commission,
      tax_liability: econ.tax,
      payment_clearing: gross,
    },
    currency,
    `Recurring series #${seriesId} refund (CourtZon book)`,
    undefined,
    { merchant_payable: null, platform_commission: null, tax_liability: null, payment_clearing: null },
  );

  // Organization book — symmetric reversal of booking_series_org_receivable
  // (Dr 1161 orgNet + Dr commission expense / Cr court rental revenue):
  //   Dr org court rental revenue (subtotal)
  //   Cr org 1161 org net
  //   Cr org commission expense
  // Balanced. (The CARD org model never credited the org's CourtZon payable.)
  const orgId = econ.organisationId;
  if (orgId != null) {
    const subtotal = Math.round((econ.orgNet + econ.commission) * 100) / 100;
    await postAccountingEvent(
      'booking_series_org_receivable_reversal', 'booking', seriesId, orgId,
      {
        court_rental_revenue: subtotal,
        marketplace_receivable: econ.orgNet,
        commission_expense: econ.commission,
      },
      currency,
      `Recurring series #${seriesId} organization book refund reversal`,
      undefined,
      { court_rental_revenue: orgId, marketplace_receivable: orgId, commission_expense: orgId },
    );
  } else {
    log.info({ seriesId }, 'Series has no organisationId — organization book reversal skipped (CourtZon book reversed)');
  }
}

async function postBookingPaymentAccountingInner(bookingId: number, paymentMethod: string, currency: string): Promise<void> {
  const econ = await bookingAccounting.resolveBookingEconomics(bookingId);
  if (!econ) {
    log.error({ bookingId }, 'Booking economics not found — skipping booking accounting');
    return;
  }

  // R5-B — Recurring-series occurrence. The player's money arrived as ONE
  // series-level payment (reference_type = booking_series, already skipped by
  // the payment:succeeded guard above), not as N per-occurrence payments.
  // Posting booking_card_payment per occurrence would therefore recognise the
  // SAME series payment N times — one series payment must yield ZERO booking
  // payment postings in R5-B. Series accounting is R5-C's job.
  //
  // This single guard covers every entry point into per-booking payment
  // accounting: payment:succeeded (reference_type = booking), booking:paid, and
  // the durable published_events replay. Standalone bookings have
  // series_id = NULL and are completely unaffected.
  if (econ.seriesId) {
    log.info(
      { bookingId, seriesId: econ.seriesId },
      'Recurring series occurrence — no per-booking payment posting in R5-B (single series payment; series accounting is R5-C)',
    );
    return;
  }

  const isCOD = paymentMethod === 'cod' || paymentMethod === 'cash';
  const eventType = paymentMethod === 'wallet' ? 'booking_wallet_payment'
    : isCOD ? 'booking_cod_payment'
    : 'booking_card_payment';

  // The debit (payment side) must equal the sum of credits.
  const grossPayable = econ.orgAmount + econ.commissionAmount + econ.taxAmount;

  if (isCOD) {
    // COD — the org collects the customer's cash directly, mirroring the
    // marketplace cash/COD custody model.
    //
    // COURTZON BOOK (organisation_id = NULL):
    //   Dr 1161 Marketplace Receivable = commission + tax
    //   Cr 4110 Platform Commission     = commission
    //   Cr 2300 Tax Liability           = tax
    // CourtZon is owed ONLY its commission (+ VAT collected on its behalf);
    // the org's share NEVER enters CourtZon's book as a payable — the org
    // collected it directly from the customer.
    //
    // ORGANIZATION BOOK (organisation_id = org): the org records
    //   Dr org 1161 Marketplace Receivable = orgAmount + commission (full
    //                                            collected court fee, pre-tax)
    //   Dr org Commission Expense          = commission
    //   Cr org Sales Revenue               = orgAmount + commission
    //   Cr org CourtZon Payable            = commission (owed to CourtZon)
    // Balanced: Dr(gross + commission) = Cr(gross + commission).
    await postAccountingEvent(
      eventType, 'booking', bookingId, null,
      {
        marketplace_receivable: econ.commissionAmount + econ.taxAmount,
        platform_commission: econ.commissionAmount,
        tax_liability: econ.taxAmount,
      },
      currency,
      `Booking #${bookingId} COD payment (commission/tax receivable)`,
      undefined,
      {
        marketplace_receivable: null,
        platform_commission: null,
        tax_liability: null,
      },
    );

    const orgId = econ.organisationId;
    if (orgId != null) {
      const cashGross = Math.round((econ.orgAmount + econ.commissionAmount) * 100) / 100;
      // ORGANIZATION BOOK (organisation_id = org): the org collected the cash
      // IMMEDIATELY at the court, so its book increases Cash/Bank (ORG-CASH)
      // directly instead of booking a receivable from CourtZon:
      //   Dr org Cash / Bank (ORG-CASH)      = gross (orgAmount + commission)
      //   Dr org Commission Expense          = commission
      //   Cr org Court Rental Revenue        = gross (orgAmount + commission)
      //   Cr org CourtZon Payable            = commission (owed to CourtZon)
      // Balanced: Dr (gross + commission) = Cr (gross + commission). Same account
      // set as the marketplace org book except the revenue leg (Court Rental
      // Revenue instead of Marketplace Sales Revenue).
      await postAccountingEvent(
        'booking_org_cash_receivable', 'booking', bookingId, orgId,
        {
          org_cash_bank: cashGross,
          commission_expense: econ.commissionAmount,
          court_rental_revenue: cashGross,
          courtzon_payable: econ.commissionAmount,
        },
        currency,
        `Booking #${bookingId} organization book (COD cash collected)`,
        undefined,
        {
          org_cash_bank: orgId,
          commission_expense: orgId,
          court_rental_revenue: orgId,
          courtzon_payable: orgId,
        },
      );
    }

    // Coach payable (separate explicit event, only when coach share exists)
    if (econ.coachAmount > 0 && orgId != null) {
      await postAccountingEvent(
        'booking_coach_payout', 'booking', bookingId, orgId,
        { coach_expense: econ.coachAmount, coach_payable: econ.coachAmount },
        currency,
        `Booking #${bookingId} coach payout`,
      );
    }
    return;
  }

  // CARD / WALLET — mirror marketplace custody (marketplace_card_payment /
  // marketplace_wallet_payment) exactly.
  //
  // COURTZON BOOK (organisation_id = NULL):
  //   Dr 1100 Payment Clearing / 2100 Wallet Liability Spend = gross
  //   Cr 2202 Merchant Payable (control)                    = orgAmount
  //   Cr 4110 Platform Commission                            = commission
  //   Cr 2300 Tax Liability                                  = tax
  // CourtZon holds the funds; the org share is CourtZon's PAYABLE to the org
  // (same 2202 control the settlement engine clears), NOT org revenue.
  //
  // ORGANIZATION BOOK (organisation_id = org): the org records
  //   Dr org 1161 Marketplace Receivable = orgAmount   (due from CourtZon)
  //   Dr org Commission Expense          = commission
  //   Cr org Court Rental Revenue        = orgAmount + commission
  // Balanced: Dr(orgAmount + commission) = Cr(orgAmount + commission).
  await postAccountingEvent(
    eventType, 'booking', bookingId, null,
    {
      merchant_payable: econ.orgAmount,
      platform_commission: econ.commissionAmount,
      tax_liability: econ.taxAmount,
      payment_clearing: eventType === 'booking_card_payment' ? grossPayable : 0,
      wallet_liability_spend: eventType === 'booking_wallet_payment' ? grossPayable : 0,
    },
    currency,
    `Booking #${bookingId} payment (custody: card/wallet)`,
    undefined,
    {
      merchant_payable: null,
      platform_commission: null,
      tax_liability: null,
      payment_clearing: null,
      wallet_liability_spend: null,
    },
  );

  const orgId = econ.organisationId;
  if (orgId != null) {
    const salesRevenue = Math.round((econ.orgAmount + econ.commissionAmount) * 100) / 100;
    await postAccountingEvent(
      'booking_org_receivable', 'booking', bookingId, orgId,
      {
        marketplace_receivable: econ.orgAmount,
        commission_expense: econ.commissionAmount,
        court_rental_revenue: salesRevenue,
      },
      currency,
      `Booking #${bookingId} organization book (court rental/commission)`,
      undefined,
      {
        marketplace_receivable: orgId,
        commission_expense: orgId,
        court_rental_revenue: orgId,
      },
    );
  }

  // Coach payable (separate explicit event, only when coach share exists)
  if (econ.coachAmount > 0 && orgId != null) {
    await postAccountingEvent(
      'booking_coach_payout', 'booking', bookingId, orgId,
      { coach_expense: econ.coachAmount, coach_payable: econ.coachAmount },
      currency,
      `Booking #${bookingId} coach payout`,
    );
  }
}

async function postAcademyPaymentAccounting(enrollmentId: number, paymentMethod: string, currency: string): Promise<void> {
  // Serialize per organisation for the same reason as booking: the accounting
  // can be triggered from payment:succeeded AND (for offline cash) the durable
  // replay — both must not race first-time org provisioning.
  const snapshot = await academyPaymentRepository.getSnapshotByEnrollment(enrollmentId);
  const key = snapshot?.organisation_id ? `academy-org:${snapshot.organisation_id}` : `academy:${enrollmentId}`;
  return runEntityExclusive(key, () => postAcademyPaymentAccountingInner(enrollmentId, paymentMethod, currency));
}

async function postAcademyPaymentAccountingInner(enrollmentId: number, paymentMethod: string, currency: string): Promise<void> {
  const snapshot = await academyPaymentRepository.getSnapshotByEnrollment(enrollmentId);
  if (!snapshot?.id) {
    log.error({ enrollmentId }, 'Academy snapshot not found — skipping academy accounting');
    return;
  }

  const gross = Math.round(Number(snapshot.gross_amount || 0) * 100) / 100;
  const commission = Math.round(Number(snapshot.commission_amount || 0) * 100) / 100;
  const orgEarning = Math.round(Number(snapshot.organization_earning_amount || 0) * 100) / 100;
  const orgId = snapshot.organisation_id ?? null;
  const isCash = paymentMethod === 'cash' || snapshot.payment_method === 'cash';

  // G8.3A — the org's Gross Collections are classified between Academy Tuition
  // Revenue (gross − court rental) and Court Rental Revenue (court rental),
  // reusing the booking court-rental concept/account (MKT-COURT-REN). The court
  // rental is read from the FROZEN snapshot — never from mutable session pricing.
  const courtRental = Math.round(Number(snapshot.court_rental_amount || 0) * 100) / 100;
  const academyRevenue = Math.round((gross - courtRental) * 100) / 100;

  // Invariant guard — fail closed and report the exact cause rather than
  // silently clamping invalid economics (G8.3A Part 8).
  if (courtRental > gross) {
    throw new Error(`Academy accounting invariant failed for enrollment ${enrollmentId}: court_rental_amount (${courtRental}) > gross_amount (${gross})`);
  }
  if (academyRevenue < 0) {
    throw new Error(`Academy accounting invariant failed for enrollment ${enrollmentId}: academy_revenue (${academyRevenue}) < 0`);
  }
  if (orgEarning < 0) {
    throw new Error(`Academy accounting invariant failed for enrollment ${enrollmentId}: organization_earning_amount (${orgEarning}) < 0`);
  }

  if (isCash) {
    // CASH/offline — the org collects the tuition directly. CourtZon is owed
    // only its commission (+0% tax) → a receivable (1161) from the org.
    await postAccountingEvent(
      'academy_cash_payment', 'academy', enrollmentId, null,
      {
        marketplace_receivable: commission,
        platform_commission: commission,
        tax_liability: 0,
      },
      currency,
      `Academy enrollment #${enrollmentId} cash commission receivable`,
      undefined,
      {
        marketplace_receivable: null,
        platform_commission: null,
        tax_liability: null,
      },
    );

    if (orgId != null) {
      const cashGross = Math.round((orgEarning + commission) * 100) / 100;
      await postAccountingEvent(
        'academy_org_cash_receivable', 'academy', enrollmentId, orgId,
        {
          org_cash_bank: cashGross,
          commission_expense: commission,
          academy_revenue: academyRevenue,
          court_rental_revenue: courtRental,
          courtzon_payable: commission,
        },
        currency,
        `Academy enrollment #${enrollmentId} organization book (cash collected)`,
        undefined,
        {
          org_cash_bank: orgId,
          commission_expense: orgId,
          academy_revenue: orgId,
          court_rental_revenue: orgId,
          courtzon_payable: orgId,
        },
      );
    }
    return;
  }

  // CARD / WALLET — CourtZon holds the funds (custody). CourtZon book:
  //   Dr 1100 Payment Clearing / 2100 Wallet Liability Spend = gross
  //   Cr 2202 Merchant Payable (control)                    = orgEarning
  //   Cr 4191 Platform Commission                            = commission
  //   Cr 2300 Tax Liability (0% by design)                  = 0
  const grossPayable = Math.round((orgEarning + commission) * 100) / 100;
  const eventType = paymentMethod === 'wallet' ? 'academy_wallet_payment' : 'academy_card_payment';
  await postAccountingEvent(
    eventType, 'academy', enrollmentId, null,
    {
      merchant_payable: orgEarning,
      platform_commission: commission,
      tax_liability: 0,
      payment_clearing: eventType === 'academy_card_payment' ? grossPayable : 0,
      wallet_liability_spend: eventType === 'academy_wallet_payment' ? grossPayable : 0,
    },
    currency,
    `Academy enrollment #${enrollmentId} payment (custody: card/wallet)`,
    undefined,
    {
      merchant_payable: null,
      platform_commission: null,
      tax_liability: null,
      payment_clearing: null,
      wallet_liability_spend: null,
    },
  );

  // Organization book: the org records a receivable from CourtZon (org 1161)
  // for its share + commission expense, and classifies its Gross Collections
  // between Academy Tuition Revenue (gross − court rental) and Court Rental
  // Revenue (court rental).
  if (orgId != null) {
    await postAccountingEvent(
      'academy_org_receivable', 'academy', enrollmentId, orgId,
      {
        marketplace_receivable: orgEarning,
        commission_expense: commission,
        academy_revenue: academyRevenue,
        court_rental_revenue: courtRental,
      },
      currency,
      `Academy enrollment #${enrollmentId} organization book (tuition/commission)`,
      undefined,
      {
        marketplace_receivable: orgId,
        commission_expense: orgId,
        academy_revenue: orgId,
        court_rental_revenue: orgId,
      },
    );
  }
}

/**
 * G5-A — Academy refund accounting reversal. Mirrors `postAcademyPaymentAccounting`
 * in reverse, reading economics from the immutable snapshot only. Serializes per
 * organisation (refund event + durable replay must not race first-time org
 * provisioning). Idempotent per (sourceType, sourceId, eventType) via
 * `postAccountingEvent`'s hasPosting guard.
 */
async function postAcademyRefundAccounting(enrollmentId: number, paymentMethod: string, currency: string): Promise<void> {
  const snapshot = await academyPaymentRepository.getSnapshotByEnrollment(enrollmentId);
  const key = snapshot?.organisation_id ? `academy-refund-org:${snapshot.organisation_id}` : `academy-refund:${enrollmentId}`;
  return runEntityExclusive(key, () => postAcademyRefundAccountingInner(enrollmentId, paymentMethod, currency));
}

async function postAcademyRefundAccountingInner(enrollmentId: number, paymentMethod: string, currency: string): Promise<void> {
  const snapshot = await academyPaymentRepository.getSnapshotByEnrollment(enrollmentId);
  if (!snapshot?.id) {
    log.error({ enrollmentId }, 'Academy snapshot not found — skipping academy refund accounting');
    return;
  }

  const r2 = (v: any) => Math.round(Number(v || 0) * 100) / 100;
  const gross = r2(snapshot.gross_amount);
  const commission = r2(snapshot.commission_amount);
  const orgEarning = r2(snapshot.organization_earning_amount);
  const orgId = snapshot.organisation_id ?? null;
  const isCash = paymentMethod === 'cash' || snapshot.payment_method === 'cash';
  const courtRental = r2(snapshot.court_rental_amount);
  const academyRevenue = r2(gross - courtRental);
  const grossPayable = r2(orgEarning + commission);

  // CourtZon book reversal (org NULL) — reverse the original custody/cash legs.
  if (isCash) {
    await postAccountingEvent(
      'academy_cash_refund', 'academy', enrollmentId, null,
      { platform_commission: commission, tax_liability: 0, marketplace_receivable: commission },
      currency,
      `Academy enrollment #${enrollmentId} cash refund`,
      undefined,
      { platform_commission: null, tax_liability: null, marketplace_receivable: null },
    );
  } else if (paymentMethod === 'wallet') {
    await postAccountingEvent(
      'academy_wallet_refund', 'academy', enrollmentId, null,
      { merchant_payable: orgEarning, platform_commission: commission, tax_liability: 0, wallet_liability_spend: grossPayable },
      currency,
      `Academy enrollment #${enrollmentId} wallet refund`,
      undefined,
      { merchant_payable: null, platform_commission: null, tax_liability: null, wallet_liability_spend: null },
    );
  } else {
    await postAccountingEvent(
      'academy_card_refund', 'academy', enrollmentId, null,
      { merchant_payable: orgEarning, platform_commission: commission, tax_liability: 0, payment_clearing: grossPayable },
      currency,
      `Academy enrollment #${enrollmentId} card refund`,
      undefined,
      { merchant_payable: null, platform_commission: null, tax_liability: null, payment_clearing: null },
    );
  }

  // Organization book reversal — reuse the existing symmetric reversal events.
  if (orgId != null) {
    if (isCash) {
      await postAccountingEvent(
        'academy_org_cash_receivable_rev', 'academy', enrollmentId, orgId,
        { academy_revenue: academyRevenue, court_rental_revenue: courtRental, courtzon_payable: commission, org_cash_bank: grossPayable, commission_expense: commission },
        currency,
        `Academy enrollment #${enrollmentId} org book cash refund`,
        undefined,
        { academy_revenue: orgId, court_rental_revenue: orgId, courtzon_payable: orgId, org_cash_bank: orgId, commission_expense: orgId },
      );
    } else {
      await postAccountingEvent(
        'academy_org_receivable_reversal', 'academy', enrollmentId, orgId,
        { academy_revenue: academyRevenue, court_rental_revenue: courtRental, marketplace_receivable: orgEarning, commission_expense: commission },
        currency,
        `Academy enrollment #${enrollmentId} org book refund`,
        undefined,
        { academy_revenue: orgId, court_rental_revenue: orgId, marketplace_receivable: orgId, commission_expense: orgId },
      );
    }
  }
}

async function postBookingRefundAccounting(bookingId: number, refundAmount: number, currency: string): Promise<void> {
  const refund = await bookingAccounting.computeRefundEconomics(bookingId, refundAmount);
  const key = refund ? `booking-org:${refund.organisationId ?? 'global'}` : `booking:${bookingId}`;
  return runEntityExclusive(key, () => postBookingRefundAccountingInner(bookingId, refundAmount, currency));
}

async function postBookingRefundAccountingInner(bookingId: number, refundAmount: number, currency: string): Promise<void> {
  const refund = await bookingAccounting.computeRefundEconomics(bookingId, refundAmount);
  if (!refund) {
    log.error({ bookingId }, 'Booking refund economics not found — skipping refund accounting');
    return;
  }
  if (refund.refundedAmount <= 0) return;

  // ── COD refund: reverse the COD economics (receivable + commission + tax) ──
  // COD bookings never created merchant_payable or payment_clearing; they
  // created a CourtZon marketplace_receivable (1161). Reversing them through
  // booking_refund (card/wallet) would fabricate merchant_payable/payment_clearing
  // entries for money that was never in CourtZon's custody.
  const isCOD = refund.paymentMethod === 'cash' || refund.paymentMethod === 'cod';
  if (isCOD) {
    // COURTZON BOOK (org NULL): reverse the 1161 receivable + commission + tax.
    await postAccountingEvent(
      'booking_cod_reversal', 'booking', bookingId, null,
      {
        platform_commission: refund.commissionAmount,
        tax_liability: refund.taxAmount,
        marketplace_receivable: refund.commissionAmount + refund.taxAmount,
      },
      currency,
      `Booking #${bookingId} COD refund (CourtZon book)`,
      undefined,
      {
        platform_commission: null,
        tax_liability: null,
        marketplace_receivable: null,
      },
    );
    await postBookingOrganisationCashBookReversal(refund, bookingId, currency);
    return;
  }

  // Reversing the CourtZon book (debit side) + the organization book — mirrors
  // the marketplace merchant refund (postMarketplaceRefundAccounting / F-2).
  const isWallet = refund.paymentMethod === 'wallet';
  // The refund returns the FULL payment to the customer (refund.paymentAmount
  // includes any coach share), but the CourtZon-book reversal must mirror the
  // original booking:paid structure: the wallet_liability / payment_clearing
  // leg covers only the NON-COACH economics (gross = org + commission + tax);
  // the coach share is reversed separately via booking_coach_reversal below.
  // Crediting the full paymentAmount would leave this event unbalanced for
  // coach bookings (debit 200 / credit 300). The non-coach gross by
  // construction equals the debit side (merchant_payable + commission + tax),
  // so every posting stays mathematically balanced while the combined reversal
  // (wallet/card refund + coach reversal) returns the full refunded amount.
  const nonCoachRefund = Math.round((refund.orgAmount + refund.commissionAmount + refund.taxAmount) * 100) / 100;
  const eventType = isWallet ? 'booking_wallet_refund' : 'booking_refund';
  await postAccountingEvent(
    eventType, 'booking', bookingId, null,
    {
      merchant_payable: refund.orgAmount,
      platform_commission: refund.commissionAmount,
      tax_liability: refund.taxAmount,
      payment_clearing: isWallet ? 0 : nonCoachRefund,
      wallet_liability: isWallet ? nonCoachRefund : 0,
    },
    currency,
    `Booking #${bookingId} refund (CourtZon book)`,
    undefined,
    {
      merchant_payable: null,
      platform_commission: null,
      tax_liability: null,
      payment_clearing: null,
      wallet_liability: null,
    },
  );
  await postBookingOrganisationBookReversal(refund, bookingId, currency);

  const pool = getPool();

  // Coach: unsettled portion → payable reversal; settled portion → recovery.
  if (refund.coachUnsettled > 0) {
    await postAccountingEvent(
      'booking_coach_reversal', 'booking', bookingId, refund.organisationId,
      { coach_payable: refund.coachUnsettled, coach_expense: refund.coachUnsettled },
      currency,
      `Booking #${bookingId} coach payout reversal`,
    );
  }
  if (refund.coachSettled > 0) {
    await postAccountingEvent(
      'booking_coach_recovery', 'booking', bookingId, refund.organisationId,
      { coach_recovery_receivable: refund.coachSettled, coach_expense: refund.coachSettled },
      currency,
      `Booking #${bookingId} coach post-settlement recovery`,
    );
    // Cumulative recovery tracking (bounded at DB level — never exceeds settled).
    await pool.execute(
      `UPDATE bookings SET coach_recovered_amount = coach_recovered_amount + ?
       WHERE id = ? AND coach_recovered_amount + ? <= coach_settled_amount`,
      [refund.coachSettled, bookingId, refund.coachSettled],
    );
  }

  // Org: settled portion → recovery (org already received settlement funds).
  if (refund.orgSettled > 0) {
    await postAccountingEvent(
      'booking_org_recovery', 'booking', bookingId, refund.organisationId,
      { org_recovery_receivable: refund.orgSettled, org_payable: refund.orgSettled },
      currency,
      `Booking #${bookingId} org post-settlement recovery`,
    );
    await pool.execute(
      `UPDATE bookings SET org_recovered_amount = org_recovered_amount + ?
       WHERE id = ? AND org_recovered_amount + ? <= org_settled_amount`,
      [refund.orgSettled, bookingId, refund.orgSettled],
    );
  }
}

/**
 * Post the ORGANIZATION BOOK reversal for a CARD/WALLET booking refund/cancel.
 * Symmetric reversal of the org's booking economics (booking_org_receivable):
 *   Dr org Court Rental Revenue          = orgAmount + commission
 *   Cr org 1161 Marketplace Receivable = orgAmount
 *   Cr org Commission Expense          = commission
 * Balanced. Idempotent per (booking, booking_id, 'booking_org_receivable_reversal').
 */
async function postBookingOrganisationBookReversal(refund: RefundEconomics, bookingId: number, currency: string): Promise<void> {
  const orgId = refund.organisationId;
  if (orgId == null) return;
  const salesRevenue = Math.round((refund.orgAmount + refund.commissionAmount) * 100) / 100;
  await postAccountingEvent(
    'booking_org_receivable_reversal', 'booking', bookingId, orgId,
    {
      court_rental_revenue: salesRevenue,
      marketplace_receivable: refund.orgAmount,
      commission_expense: refund.commissionAmount,
    },
    currency,
    `Booking #${bookingId} organization book reversal`,
    undefined,
    {
      court_rental_revenue: orgId,
      marketplace_receivable: orgId,
      commission_expense: orgId,
    },
  );
}

/**
 * Post the ORGANIZATION BOOK reversal for a COD/CASH booking refund/cancel.
 * Symmetric reversal of the booking COD org book (booking_org_cash_receivable):
 *   Dr org Court Rental Revenue         = gross (orgAmount + commission)
 *   Dr org CourtZon Payable            = commission
 *   Cr org Cash / Bank (ORG-CASH)      = gross (orgAmount + commission)
 *   Cr org Commission Expense          = commission
 * Balanced. Skips when the original COD org-book posting never existed (e.g.
 * a legacy booking posted before the org-book split) — mirror of
 * postOrganisationCashBookReversalAccounting.
 */
async function postBookingOrganisationCashBookReversal(refund: RefundEconomics, bookingId: number, currency: string): Promise<void> {
  const orgId = refund.organisationId;
  if (orgId == null) return;
  const orgBooked = await ledgerRepository.hasPosting('booking', bookingId, 'booking_org_cash_receivable');
  if (!orgBooked) return;
  const gross = Math.round((refund.orgAmount + refund.commissionAmount) * 100) / 100;
  await postAccountingEvent(
    'booking_org_cash_receivable_rev', 'booking', bookingId, orgId,
    {
      court_rental_revenue: gross,
      courtzon_payable: refund.commissionAmount,
      org_cash_bank: gross,
      commission_expense: refund.commissionAmount,
    },
    currency,
    `Booking #${bookingId} organization book cash reversal`,
    undefined,
    {
      court_rental_revenue: orgId,
      courtzon_payable: orgId,
      org_cash_bank: orgId,
      commission_expense: orgId,
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// G11.1 — TOURNAMENT CARD registration recognition (per paid registration).
//
// One tournament card payment == one registration (payment_transactions
// reference_type='tournament', reference_id = tournament_registration.id,
// amount = round2(entry_fee)). The PAYMENT amount is authoritative — it is
// never re-priced; the persisted entry_fee is only verified defensively.
//
// Organisation-owned tournament (the ONLY kind — see G11 Phase 3):
//   CourtZon book (org NULL): Dr 1100 Payment Clearing = gross · Cr 2202
//     Merchant Payable = orgNet · Cr 4192 Tournament Commission = commission.
//   Organization book (org-scoped): Dr org 1161 = orgNet · Dr org MKT-COMM-EXP
//     = commission · Cr org 4140 Tournament / Event Revenue = gross.
// G11 Phase 3 — the CourtZon platform never owns a tournament, so the former
//   platform branch (`tournament_platform_card_payment`: Dr 1100 = gross ·
//   Cr 4140 = gross) is REMOVED. A legacy org-less row is handled FAIL-CLOSED
//   below: no accounting is posted, because there is no counterparty and no
//   custody model to book against.
//
// commission = round2(gross × tournament.commission_rate / 100) from the
// IMMUTABLE tournament snapshot — the live subscription rate is never re-read
// at payment time. Tax = 0 by decision (no 2300 leg). Zero-fee (FREE)
// registrations post nothing. This function handles CARD only — CASH is routed
// to postTournamentCashAccounting (G11.2) by the branch above.
//
// source_type = 'tournament' (existing ledger ENUM value) · source_id =
// paymentId · dedicated tournament event types. The CourtZon and org postings
// are independently idempotent via hasPosting('tournament', paymentId,
// eventType) + uk_dedup, so a replayed payment:succeeded (outbox/BullMQ replay
// re-dispatches to THIS same guarded handler) can never double-post.
// ─────────────────────────────────────────────────────────────────────────────
async function postTournamentCardPaymentAccounting(
  paymentMethod: string,
  amount: number,
  currency: string,
  data: any,
): Promise<void> {
  // G11.1 is CARD registration recognition only. CASH tournament payments are
  // out of scope and must remain un-posted (no accidental cash accounting).
  if (paymentMethod && paymentMethod !== 'card') return;

  const registrationId = Number(data.referenceId);
  const paymentId = Number(data.paymentId);
  const registration = registrationId ? await tournamentRepository.getRegistrationById(registrationId) : null;
  if (!registration) {
    log.info({ paymentId, registrationId }, 'Tournament registration not found — no accounting posted');
    return;
  }

  const tournament = await tournamentRepository.findById(Number(registration.tournament_id));
  if (!tournament) {
    log.warn({ paymentId, registrationId }, 'Tournament not found for registration — no accounting posted');
    return;
  }

  // The PAYMENT amount is authoritative (what was actually charged/collected).
  const gross = Math.round(Number(amount) * 100) / 100;
  if (gross <= 0) {
    // FREE / zero-fee registration → no economic event to recognize.
    log.info({ paymentId, registrationId }, 'Tournament zero-fee registration — no accounting posted');
    return;
  }

  // Defensive verification against the authoritative entry_fee (cent-rounded).
  // The payment amount is NEVER silently altered or re-priced.
  const entryFee = Math.round(Number(tournament.entry_fee ?? 0) * 100) / 100;
  if (entryFee >= 0 && gross !== entryFee) {
    log.warn({ paymentId, registrationId, gross, entryFee }, 'Tournament payment amount differs from entry_fee — using payment amount (authoritative)');
  }

  // Commission from the IMMUTABLE tournament.commission_rate snapshot — never
  // the live subscription rate at payment time (G11.1 rule).
  // commission = round2(gross × commission_rate / 100).
  const commissionRate = Number(tournament.commission_rate ?? 0);
  const commission = Math.round(((gross * commissionRate) / 100) * 100) / 100;
  const orgNet = Math.round((gross - commission) * 100) / 100;

  const currencyCode = String(tournament.currency_code || currency || 'EGP');
  const orgId = tournament.organisation_id != null ? Number(tournament.organisation_id) : null;
  const description = `Tournament #${tournament.id} registration #${registration.id} card payment (payment #${paymentId})`;

  if (orgId == null) {
    // G11 Phase 3 fail-closed guard. An org-less tournament is a legacy row only
    // (creation is organisation-only since Phase 3). There is no counterparty and
    // no custody model, so NO accounting is posted — the platform must never
    // recognise a tournament fee as its own revenue.
    log.info({ paymentId, registrationId, tournamentId: tournament.id }, 'Org-less tournament CARD payment — no owning organisation; no accounting posted (fail-closed)');
    return;
  }

  // CourtZon book (org NULL) — merchant-of-record custody over the org's net.
  await postAccountingEvent(
    'tournament_registration_card_payment', 'tournament', paymentId, null,
    { payment_clearing: gross, merchant_payable: orgNet, tournament_commission: commission },
    currencyCode,
    description,
  );
  // Organization book — the org records its OWN economics (org-scoped 1161 /
  // MKT-COMM-EXP / 4140, auto-provisioned per org by the accounting engine).
  await postAccountingEvent(
    'tournament_org_registration_receivable', 'tournament', paymentId, orgId,
    { marketplace_receivable: orgNet, commission_expense: commission, tournament_revenue: gross },
    currencyCode,
    `${description} (organization book)`,
    undefined,
    { marketplace_receivable: orgId, commission_expense: orgId, tournament_revenue: orgId },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// G11.2 — TOURNAMENT CASH registration recognition (org collected the cash).
//
// payment:succeeded with paymentMethod='cash' represents physical cash
// collected by the ORGANISATION (the shared tournament.service cash-register
// path records a paid payment_transactions row with reference_type='tournament'
// and emits payment:succeeded with metadata.paymentMethod='cash'). CourtZon
// never holds this cash — account 1100 Payment Clearing is NEVER used.
//
// Organisation-owned tournament (organisation_id NOT NULL), per the approved
// model:
//   CourtZon book (org NULL) — tournament_cash_commission_receivable:
//     Dr 2202 Merchant Payable = commission · Cr 4192 Tournament Commission =
//     commission.
//   Organization book (org-scoped) — tournament_org_cash_payment:
//     Dr org ORG-CASH = gross · Dr org MKT-COMM-EXP = commission ·
//     Cr org 4140 Tournament / Event Revenue = gross · Cr org MKT-CZ-PAY
//     (CourtZon Payable) = commission. Balanced by construction.
//
// G11 Phase 3 — an org-less tournament (LEGACY rows only, since creation is now
// organisation-only) has NO custody model — FAIL-CLOSED, no accounting is
// posted (explicit guard below). FREE (payment amount <= 0) posts nothing. commission uses the
// IMMUTABLE tournament.commission_rate snapshot; the payment amount is
// authoritative (registration_fee never used); tax = 0 (no 2300 leg).
//
// source_type = 'tournament' · source_id = paymentId · dedicated event types,
// each independently idempotent via hasPosting('tournament', paymentId,
// eventType) + uk_dedup — a replayed payment:succeeded can never double-post.
// ─────────────────────────────────────────────────────────────────────────────
async function postTournamentCashAccounting(
  amount: number,
  currency: string,
  data: any,
): Promise<void> {
  const registrationId = Number(data.referenceId);
  const paymentId = Number(data.paymentId);
  const registration = registrationId ? await tournamentRepository.getRegistrationById(registrationId) : null;
  if (!registration) {
    log.info({ paymentId, registrationId }, 'Tournament registration not found — no cash accounting posted');
    return;
  }

  const tournament = await tournamentRepository.findById(Number(registration.tournament_id));
  if (!tournament) {
    log.warn({ paymentId, registrationId }, 'Tournament not found for registration — no cash accounting posted');
    return;
  }

  // The PAYMENT amount is authoritative (what was actually collected).
  const gross = Math.round(Number(amount) * 100) / 100;
  if (gross <= 0) {
    // FREE / zero-fee registration → no economic event to recognize.
    log.info({ paymentId, registrationId }, 'Tournament zero-fee registration — no cash accounting posted');
    return;
  }

  // Defensive verification against the authoritative entry_fee (cent-rounded) —
  // the collected amount is NEVER silently altered or re-priced.
  const entryFee = Math.round(Number(tournament.entry_fee ?? 0) * 100) / 100;
  if (entryFee >= 0 && gross !== entryFee) {
    log.warn({ paymentId, registrationId, gross, entryFee }, 'Tournament cash amount differs from entry_fee — using payment amount (authoritative)');
  }

  // Commission from the IMMUTABLE tournament.commission_rate snapshot — never
  // the live subscription rate at payment time.
  // commission = round2(gross × commission_rate / 100).
  const commissionRate = Number(tournament.commission_rate ?? 0);
  const commission = Math.round(((gross * commissionRate) / 100) * 100) / 100;

  // G11.2 fail-closed guard (preserved from before Phase 3, still load-bearing for
  // LEGACY rows): an org-less tournament CASH has NO custodial organisation to
  // book against — no accounting is posted. Since Phase 3 creation is
  // organisation-only, this can only be reached by a pre-Phase-3 row.
  const orgId = tournament.organisation_id != null ? Number(tournament.organisation_id) : null;
  if (orgId == null) {
    log.info({ paymentId, registrationId, tournamentId: tournament.id }, 'Org-less tournament CASH — no custody model; no accounting posted (fail-closed)');
    return;
  }

  const currencyCode = String(tournament.currency_code || currency || 'EGP');
  const description = `Tournament #${tournament.id} registration #${registration.id} cash payment (payment #${paymentId})`;

  // CourtZon book (org NULL) — the org collected the cash; CourtZon books its
  // commission (Dr 2202 Merchant Payable / Cr 4192 per the approved model).
  await postAccountingEvent(
    'tournament_cash_commission_receivable', 'tournament', paymentId, null,
    { merchant_payable: commission, tournament_commission: commission },
    currencyCode,
    description,
  );

  // Organization book (org-scoped) — the org owns the whole gross and owes
  // CourtZon the commission (Dr ORG-CASH + commission expense / Cr 4140 +
  // CourtZon payable).
  await postAccountingEvent(
    'tournament_org_cash_payment', 'tournament', paymentId, orgId,
    { org_cash_bank: gross, commission_expense: commission, tournament_revenue: gross, courtzon_payable: commission },
    currencyCode,
    `${description} (organization book)`,
    undefined,
    { org_cash_bank: orgId, commission_expense: orgId, tournament_revenue: orgId, courtzon_payable: orgId },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// G11.3 — TOURNAMENT FULL-REFUND accounting reversals (CARD and CASH).
//
// Both reverse the respective recognition EXACTLY, on source_type='tournament'
// + source_id=paymentId with dedicated tournament reversal event types — never
// the generic card_refund fallthrough. Commission uses the IMMUTABLE
// tournament.commission_rate snapshot; the refund amount (payment amount) is
// authoritative; registration_fee is never used; tax = 0 (nothing recognized
// to reverse). Platform/community tournaments (organisation_id NULL) are OUT OF
// G11.3 scope → fail-closed, no posting.
// ─────────────────────────────────────────────────────────────────────────────
async function resolveTournamentRefundEconomy(registrationId: number, paymentId: number, amount: number) {
  const registration = registrationId ? await tournamentRepository.getRegistrationById(registrationId) : null;
  if (!registration) {
    log.info({ paymentId, registrationId }, 'Tournament registration not found — no refund accounting posted');
    return null;
  }
  const tournament = await tournamentRepository.findById(Number(registration.tournament_id));
  if (!tournament) {
    log.warn({ paymentId, registrationId }, 'Tournament not found for registration — no refund accounting posted');
    return null;
  }
  const gross = Math.round(Number(amount) * 100) / 100;
  if (gross <= 0) return null;
  const commissionRate = Number(tournament.commission_rate ?? 0);
  const commission = Math.round(((gross * commissionRate) / 100) * 100) / 100;
  const orgNet = Math.round((gross - commission) * 100) / 100;
  const orgId = tournament.organisation_id != null ? Number(tournament.organisation_id) : null;
  const currencyCode = String(tournament.currency_code || 'EGP');
  return { registration, tournament, gross, commission, orgNet, orgId, currencyCode };
}

// Serialized wrappers — tournament refund postings run under the SAME
// per-entity exclusive mutex the booking/academy postings use, so the two
// (CourtZon + org) postings of one refund — and any concurrent settlement/
// replay delivery for the SAME payment — can never race first-time org
// provisioning (MySQL gap-lock deadlock, see runEntityExclusive comment).
async function postTournamentCardRefundAccountingSerialized(amount: number, currency: string, data: any): Promise<void> {
  return runEntityExclusive(`tournament-refund:${Number(data.paymentId ?? 0)}`, () =>
    postTournamentCardRefundAccounting(amount, currency, data));
}

async function postTournamentCashRefundAccountingSerialized(amount: number, currency: string, data: any): Promise<void> {
  return runEntityExclusive(`tournament-refund:${Number(data.paymentId ?? 0)}`, () =>
    postTournamentCashRefundAccounting(amount, currency, data));
}

// ─────────────────────────────────────────────────────────────────────────────
// G11.4 — REFUND-AFTER-SETTLEMENT detection from the DURABLE settlement history.
//
// `payment_transactions.gateway_settlement_id` CANNOT answer "did CourtZon
// already receive this payment's gateway funds?" at refund time: the G11.3
// payment-scoped settlement dismantle nulls exactly that column (and its
// gateway_settled_at sibling) before the refund is executed. Reading it would
// therefore always answer "not settled" and post the refund against 1100 even
// when the batch already moved the money to 1120 — leaving 1100 with a phantom
// +gross and never returning it to zero.
//
// The settlement HISTORY is the durable authority: a line in
// gateway_settlement_transactions whose batch is still 'completed' proves the
// funds were received into 1120. A 'reversed' batch proves the opposite (the
// bank transfer was undone and the money is back in 1100), so a reversed batch
// must be treated as NOT settled and the refund keeps the G11.3 clearing leg.
// The historical line row itself is never deleted by the dismantle, so this
// answer is stable forever.
//
// Replay-safe: the variant is derived from durable rows, not from a transient
// column, so re-delivering `payment:refunded` can never pick a DIFFERENT variant
// and double-post. Each variant is additionally guarded by
// hasPosting('tournament', paymentId, eventType) + uk_dedup.
// ─────────────────────────────────────────────────────────────────────────────
async function tournamentPaymentWasGatewaySettled(paymentId: number): Promise<boolean> {
  if (!(paymentId > 0)) return false;
  const [rows] = await getPool().execute<RowData>(
    `SELECT 1
     FROM gateway_settlement_transactions gst
     JOIN gateway_settlements gs ON gs.id = gst.gateway_settlement_id
     WHERE gst.payment_transaction_id = ?
       AND gs.settlement_status = 'completed'
     LIMIT 1`,
    [paymentId],
  );
  return (rows as any[]).length > 0;
}

async function postTournamentCardRefundAccounting(amount: number, currency: string, data: any): Promise<void> {
  const paymentId = Number(data.paymentId);
  const econ = await resolveTournamentRefundEconomy(Number(data.referenceId), paymentId, amount);
  if (!econ) return;
  // Platform/community card tournaments are OUT of G11.3 scope — fail closed.
  if (econ.orgId == null) {
    log.info({ paymentId, registrationId: Number(data.referenceId) }, 'Platform/community tournament card refund — OUT of G11.3 scope; no accounting posted');
    return;
  }
  const baseDescription = `Tournament #${econ.tournament.id} registration #${econ.registration.id} card refund (payment #${paymentId})`;

  // G11.4 — two CourtZon variants, selected from the durable settlement history
  // (NOT from payment_transactions.gateway_settlement_id, which the dismantle
  // already nulled). Both fully reverse the G11.1 recognition legs; they differ
  // ONLY in the account the cash leaves from.
  const wasSettled = await tournamentPaymentWasGatewaySettled(paymentId);
  if (wasSettled) {
    // Funds already received into 1120 by the gateway batch → pay the refund out
    // of the bank. Reverses 2202 (org net) + 4192 (commission) in full, so the
    // CourtZon book nets to zero on this payment while 1100 stays at zero.
    // The gateway fee (5210) is intentionally left in place — non-refundable.
    await postAccountingEvent(
      'tournament_registration_card_refund_settled', 'tournament', paymentId, null,
      { merchant_payable: econ.orgNet, tournament_commission: econ.commission, cash_bank: econ.gross },
      econ.currencyCode,
      `${baseDescription} — settled cash leg`,
    );
  } else {
    // Not gateway-settled (or the batch was reversed) → the G11.3 reversal is
    // unchanged: the refund simply returns the clearing balance.
    await postAccountingEvent(
      'tournament_registration_card_refund', 'tournament', paymentId, null,
      { merchant_payable: econ.orgNet, tournament_commission: econ.commission, payment_clearing: econ.gross },
      econ.currencyCode,
      `${baseDescription} — unsettled clearing leg`,
    );
  }

  // Organization book (org-scoped): Dr 4140 gross · Cr 1161 orgNet · Cr MKT-COMM-EXP commission.
  await postAccountingEvent(
    'tournament_org_receivable_reversal', 'tournament', paymentId, econ.orgId,
    { tournament_revenue: econ.gross, marketplace_receivable: econ.orgNet, commission_expense: econ.commission },
    econ.currencyCode,
    `${baseDescription} (organization book)`,
    undefined,
    { tournament_revenue: econ.orgId, marketplace_receivable: econ.orgId, commission_expense: econ.orgId },
  );
}

async function postTournamentCashRefundAccounting(amount: number, currency: string, data: any): Promise<void> {
  const paymentId = Number(data.paymentId);
  const econ = await resolveTournamentRefundEconomy(Number(data.referenceId), paymentId, amount);
  if (!econ) return;
  // Platform/community CASH has NO recognition (G11.2 fail-closed) and is OUT
  // of G11.3 scope — nothing to reverse.
  if (econ.orgId == null) {
    log.info({ paymentId, registrationId: Number(data.referenceId) }, 'Platform/community tournament cash refund — OUT of G11.3 scope; no accounting posted');
    return;
  }
  const description = `Tournament #${econ.tournament.id} registration #${econ.registration.id} cash refund (payment #${paymentId})`;
  // CourtZon book (org NULL): Dr 4192 commission · Cr 2202 commission.
  await postAccountingEvent(
    'tournament_cash_commission_refund', 'tournament', paymentId, null,
    { tournament_commission: econ.commission, merchant_payable: econ.commission },
    econ.currencyCode,
    description,
  );
  // Organization book (org-scoped): Dr 4140 gross · Dr MKT-CZ-PAY commission ·
  // Cr ORG-CASH gross · Cr MKT-COMM-EXP commission.
  await postAccountingEvent(
    'tournament_org_cash_payment_reversal', 'tournament', paymentId, econ.orgId,
    { tournament_revenue: econ.gross, courtzon_payable: econ.commission, org_cash_bank: econ.gross, commission_expense: econ.commission },
    econ.currencyCode,
    `${description} (organization book)`,
    undefined,
    { tournament_revenue: econ.orgId, courtzon_payable: econ.orgId, org_cash_bank: econ.orgId, commission_expense: econ.orgId },
  );
}

// ── G11.5 — Tournament Prize Payout postings ─────────────────────────────────
// Mirrors the locked award topology (Q8b/Q8c/Q10b). G11 Phase 3 — prize funding
// is ORGANIZATION-ONLY, so there is exactly one award topology:
//   Org-funded award (CourtZon book, org NULL):
//                           Dr 2202 Merchant Payable · Cr 2100 Wallet Liability.
//   Org CARD org book:      Dr org 4140 · Cr org 1161.
//   Org CASH org book:      Dr org 4140 · Cr org MKT-CZ-PAY.
//   Refunds are the EXACT FULL inverse (separate event types — postAccountingEvent
//   rejects negative amounts, and the mirrored side swap keeps every posting
//   positive/balanced).
// The platform-funded topology (Dr 4300 Revenue Contra · Cr 2100) is REMOVED with
// the `tournament_prize_award` / `tournament_prize_refund` concepts — the CourtZon
// platform never funds a prize, so it never has prize revenue to contra-expense.
// Amounts are always re-read from the durable award row (never the event
// payload), and every posting is idempotent via hasPosting on
// (source_type='tournament', source_id=awardId, event_type).
async function postPrizeAwardAccounting(awardId: number): Promise<void> {
  const award = await tournamentPrizeAwardRepository.findById(awardId);
  if (!award) {
    log.error({ awardId }, 'Prize award not found — award accounting skipped');
    return;
  }
  const amount = Number(award.amount);
  const currency = award.currency_code || 'EGP';
  const description = `Tournament prize award #${awardId} (${award.bind_source})`;

  // G11 Phase 3 fail-closed guard. A `platform`-funded award can only be a
  // LEGACY row (funding is organization-only since Phase 3, and the
  // `tournament_prize_award` concept is deleted) — nothing is posted rather than
  // booked against a concept that no longer exists.
  if (award.funding_source !== 'organization') {
    log.error({ awardId, fundingSource: award.funding_source }, 'Prize award is not organization-funded — no accounting posted (fail-closed)');
    return;
  }

  // Organization-funded — CourtZon book (org NULL).
  await postAccountingEvent(
    'tournament_org_prize_award', 'tournament', awardId, null,
    { merchant_payable: amount, wallet_liability: amount },
    currency, description,
  );

  const tournament = await tournamentRepository.findById(award.tournament_id);
  const orgId = tournament?.organisation_id ?? null;
  if (orgId == null) return;

  if (award.collection_method === 'cash') {
    await postAccountingEvent(
      'tournament_org_cash_prize_award_book', 'tournament', awardId, orgId,
      { tournament_revenue: amount, courtzon_payable: amount },
      currency, `${description} (organization book)`, undefined,
      { tournament_revenue: orgId, courtzon_payable: orgId },
    );
  } else {
    await postAccountingEvent(
      'tournament_org_prize_award_book', 'tournament', awardId, orgId,
      { tournament_revenue: amount, marketplace_receivable: amount },
      currency, `${description} (organization book)`, undefined,
      { tournament_revenue: orgId, marketplace_receivable: orgId },
    );
  }
}

async function postPrizeRefundAccounting(awardId: number): Promise<void> {
  const award = await tournamentPrizeAwardRepository.findById(awardId);
  if (!award) {
    log.error({ awardId }, 'Prize award not found — refund accounting skipped');
    return;
  }
  const amount = Number(award.amount);
  const currency = award.currency_code || 'EGP';
  const description = `Tournament prize refund #${awardId} (full clawback)`;

  // G11 Phase 3 fail-closed guard (mirrors the award path above): a
  // `platform`-funded refund can only be a LEGACY row — the
  // `tournament_prize_refund` concept no longer exists, so nothing is posted.
  if (award.funding_source !== 'organization') {
    log.error({ awardId, fundingSource: award.funding_source }, 'Prize refund is not organization-funded — no accounting posted (fail-closed)');
    return;
  }

  // Organization-funded — CourtZon book (org NULL).
  await postAccountingEvent(
    'tournament_org_prize_refund', 'tournament', awardId, null,
    { wallet_liability: amount, merchant_payable: amount },
    currency, description,
  );

  const tournament = await tournamentRepository.findById(award.tournament_id);
  const orgId = tournament?.organisation_id ?? null;
  if (orgId == null) return;

  if (award.collection_method === 'cash') {
    await postAccountingEvent(
      'tournament_org_cash_prize_refund_book', 'tournament', awardId, orgId,
      { courtzon_payable: amount, tournament_revenue: amount },
      currency, `${description} (organization book)`, undefined,
      { courtzon_payable: orgId, tournament_revenue: orgId },
    );
  } else {
    await postAccountingEvent(
      'tournament_org_prize_refund_book', 'tournament', awardId, orgId,
      { marketplace_receivable: amount, tournament_revenue: amount },
      currency, `${description} (organization book)`, undefined,
      { marketplace_receivable: orgId, tournament_revenue: orgId },
    );
  }
}

export function registerAccountingEventListeners(): void {
  // Idempotent: registering twice would duplicate every in-memory handler and
  // fire each domain event multiple times (the event bus does not await
  // handlers, so duplicates race and can double-post). Called once at app
  // startup, and once per test file. Guarded so repeated calls are a no-op.
  if (accountingListenersRegistered) {
    log.info('Accounting event listeners already registered — skip');
    return;
  }
  accountingListenersRegistered = true;

  // ── Payment Events ──

  eventBusV2.on('payment:succeeded', async (data: any) => {
    try {
      const paymentMethod: string = data.metadata?.paymentMethod || 'card';
      const referenceType: string = data.referenceType;
      const referenceId: number = data.referenceId;
      const amount: number = Number(data.amount);
      const currency: string = data.metadata?.currency || 'EGP';
      if (!referenceType || !referenceId || !amount) return;

      // Group 3 — Tournament registration payments are routed through the SHARED
      // Payment capability. The dedicated tournament accounting branch below is
      // source-segregated (source_type='tournament', source_id=paymentId,
      // dedicated tournament event types) and can NEVER reach the generic
      // card_payment fallthrough (which would post the full gross as generic
      // CourtZon revenue — wrong custody model).
      //   G11.1 — CARD registration fee recognition.
      //   G11.2 — CASH registration recognition (org collected; platform/
      //           community CASH has NO custody model → fail-closed, un-posted).
      if (referenceType === 'tournament') {
        if (paymentMethod === 'cash') {
          await postTournamentCashAccounting(amount, currency, data);
        } else {
          await postTournamentCardPaymentAccounting(paymentMethod, amount, currency, data);
        }
        return;
      }

      // R5-B — Recurring series payments are ONE gateway transaction covering N
      // occurrences. R5-C2 — a successful series payment is recognized ONCE at
      // the SERIES level (booking_series_card_payment / org book), never per
      // occurrence and never through the generic platform-revenue fallthrough
      // below (which would post the full series gross as CourtZon revenue).
      // The per-occurrence `econ.seriesId` guard keeps booking:paid a no-op, so
      // this branch is the series' ONLY financial recognition.
      if (referenceType === 'booking_series') {
        await postSeriesPaymentAccounting(referenceId, currency);
        return;
      }

      if (referenceType === 'wallet_topup') {
        const orgId = null; // platform event
        await postAccountingEvent(
          'wallet_topup', 'wallet', data.paymentId, orgId,
          { payment_clearing: amount, wallet_liability: amount },
          currency,
          `Card deposit (payment #${data.paymentId})`,
        );
        return;
      }

      // ── Subscription payment → principal platform revenue (Model B) ──
      // Subscriptions are 100% CourtZon's own service revenue. Dedicated
      // subscription_* events keep them on account 4170 (never the generic
      // card_payment mapping / 4100) and organisation_id stays NULL: the
      // paying org is a customer, not a bookkeeping party. Renewals use the
      // identical request+activation machinery, so they inherit this path.
      if (referenceType === 'subscription') {
        const eventType = paymentMethod === 'wallet' ? 'subscription_wallet_payment' : 'subscription_card_payment';
        await postAccountingEvent(
          eventType, 'subscription', referenceId, null,
          eventType === 'subscription_wallet_payment'
            ? { wallet_liability_spend: amount, revenue: amount }
            : { payment_clearing: amount, revenue: amount },
          currency,
          `Subscription #${referenceId} payment`,
        );
        return;
      }

      // ── Booking payment → booking-specific accounting (full economic split) ──
      // A booking payment must NOT post a generic full-gross revenue entry.
      // Instead resolve the authoritative economics (org share, commission,
      // coach share, tax) and post the explicit booking event.
      if (referenceType === 'booking') {
        await postBookingPaymentAccounting(referenceId, paymentMethod, currency);
        return;
      }

      // ── Marketplace order payment → custody-correct accounting ──
      // CourtZon is an agent: only commission is revenue; merchant share is a
      // payable; tax is a liability. Never post full gross as revenue.
      if (referenceType === 'order') {
        await postMarketplacePaymentAccounting(referenceId, paymentMethod, currency);
        return;
      }

      // ── Academy enrollment payment → snapshot-based tuition accounting (G8) ──
      // Academy economics come EXCLUSIVELY from the immutable
      // academy_enrollment_payments snapshot (never recomputed). The posting
      // mirrors booking custody: commission → 4191, org share → merchant
      // payable (card/wallet) or org book receivable (cash).
      if (referenceType === 'academy') {
        await postAcademyPaymentAccounting(referenceId, paymentMethod, currency);
        return;
      }

      // ── Membership subscription payment → snapshot-based accounting (G11.22 P1) ──
      // Economics come EXCLUSIVELY from the immutable membership_subscriptions
      // snapshot (total / commission / org-net), never recomputed. Mirrors the
      // booking custody model with the DEDICATED membership events (CourtZon
      // book + organization book, both idempotent via uk_dedup).
      if (referenceType === 'membership_subscription') {
        await postMembershipPaymentAccounting(referenceId, paymentMethod, currency);
        return;
      }

      // booking or order payment — distinguish card vs wallet vs cod
      let eventType: string;
      if (paymentMethod === 'wallet') {
        eventType = 'wallet_payment';
      } else if (paymentMethod === 'cod') {
        eventType = 'cod_payment';
      } else {
        eventType = 'card_payment';
      }

      const sourceType = refTypeToSourceType(referenceType);
      const orgId = await resolveOrgId(referenceType, referenceId);
      const conceptAmounts: Record<string, number> = eventType === 'wallet_payment'
        ? ({ wallet_liability_spend: amount, revenue: amount } as Record<string, number>)
        : ({ payment_clearing: amount, revenue: amount } as Record<string, number>);

      await postAccountingEvent(
        eventType, sourceType, referenceId, orgId,
        conceptAmounts, currency,
        `${referenceType} #${referenceId} payment`,
      );
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        log.info({ err: err.message }, 'Duplicate ledger entry — idempotent skip');
        return;
      }
      log.error({ err, eventType: data.referenceType }, 'Accounting event failed');
    }
  });

  eventBusV2.on('payment:refunded', async (data: any) => {
    try {
      const referenceType: string = data.referenceType;
      const referenceId: number = data.referenceId;
      const amount: number = Number(data.amount);
      const currency: string = data.metadata?.currency || 'EGP';
      const paymentMethod: string = data.metadata?.paymentMethod || 'card';
      if (!referenceType || !referenceId || !amount) return;

      // ── Booking refund → booking-specific proportional reversal ──
      // A booking refund must NOT post a generic revenue_contra entry.
      if (referenceType === 'booking') {
        await postBookingRefundAccounting(Number(referenceId), amount, currency);
        return;
      }

      // ── R5-D1 — recurring series CARD refund → series-level symmetric
      //    reversal of the R5-C2 recognition. NEVER falls through to the
      //    generic card_refund path (refTypeToSourceType('booking_series')
      //    is not a valid ledger_entries.source_type). Idempotent per
      //    (source_type='booking', source_id=seriesId, event_type).
      if (referenceType === 'booking_series') {
        await postSeriesRefundAccounting(Number(referenceId), currency);
        return;
      }

      // ── Marketplace order refund → custody-correct reversal ──
      // Reverse merchant payable + commission + tax, not generic revenue_contra.
      if (referenceType === 'order') {
        await postMarketplaceRefundAccounting(Number(referenceId), currency);
        return;
      }

      // ── Marketplace complaint refund → symmetric custody reversal (F-2) ──
      // A complaint refund credits the buyer's wallet. Reverse the ORIGINAL
      // marketplace economic legs (merchant_payable + platform_commission +
      // tax_liability for CARD/WALLET custody; receivable_from_org for COD)
      // instead of a generic 4300/2100 revenue_contra entry that never mirrored
      // the original marketplace posting.
      if (referenceType === 'complaint') {
        await postMarketplaceComplaintRefundAccounting(Number(referenceId), amount, currency, data);
        return;
      }

      // ── Subscription refund → symmetric reversal of principal platform
      //    revenue (F-12) ──
      // Subscriptions are recognized as 100% CourtZon principal revenue to 4170
      // (MODEL B). A refund must reverse the revenue leg (4170) and the custody
      // leg (payment_clearing for card, wallet_liability for wallet, cash_bank
      // for cash) — NOT the generic revenue_contra (4300) path used by
      // marketplace/booking refunds. organisation_id stays NULL (the paying org
      // is a customer, not a bookkeeping party), matching the original payment.
      if (referenceType === 'subscription') {
        const eventType = paymentMethod === 'wallet' ? 'subscription_wallet_refund'
          : paymentMethod === 'cash' ? 'subscription_cash_refund'
          : 'subscription_card_refund';
        const conceptAmounts: Record<string, number> = eventType === 'subscription_wallet_refund'
          ? { revenue: amount, wallet_liability: amount }
          : eventType === 'subscription_cash_refund'
            ? { revenue: amount, cash_bank: amount }
            : { revenue: amount, payment_clearing: amount };
        await postAccountingEvent(
          eventType, 'subscription', referenceId, null,
          conceptAmounts, currency,
          `Subscription #${referenceId} refund`,
        );
        return;
      }

      // ── Academy refund → symmetric reversal of the original academy legs ──
      // Economics come from the immutable academy_enrollment_payments snapshot
      // (never recalculated). The org book reuses the existing academy reversal
      // events; the CourtZon book uses the new academy_*_refund events built on
      // the SAME accounts as the original postings.
      if (referenceType === 'academy') {
        await postAcademyRefundAccounting(Number(referenceId), paymentMethod, currency);
        return;
      }

      // ── G11.3 — Tournament FULL refund → dedicated reversal events (source
      //   _type='tournament', source_id=paymentId). CARD reverses the G11.1
      //    recognition; CASH reverses the G11.2 recognition gateway-free. Never
      //    falls through to the generic card_refund/wallet_refund fallthrough
      //    (which would post a WRONG source_type='tournament' generic reversal).
      if (referenceType === 'tournament') {
        const method: string = data.metadata?.paymentMethod || paymentMethod;
        if (method === 'cash') {
          await postTournamentCashRefundAccountingSerialized(amount, currency, data);
        } else if (method === 'card') {
          await postTournamentCardRefundAccountingSerialized(amount, currency, data);
        } else {
          // Fail closed — an unsupported tournament refund method must not post
          // any generic accounting reversal.
          log.warn({ paymentId: data.paymentId, registrationId: referenceId, method }, 'Tournament refund with unsupported payment method — no accounting posted (fail-closed)');
        }
        return;
      }

      const eventType = paymentMethod === 'wallet' ? 'wallet_refund' : 'card_refund';
      const sourceType = refTypeToSourceType(referenceType);
      const orgId = await resolveOrgId(referenceType, referenceId);
      const conceptAmounts: Record<string, number> = eventType === 'wallet_refund'
        ? ({ revenue_contra: amount, wallet_liability: amount } as Record<string, number>)
        : ({ revenue_contra: amount, payment_clearing: amount } as Record<string, number>);

      await postAccountingEvent(
        eventType, sourceType, referenceId, orgId,
        conceptAmounts, currency,
        `${referenceType} #${referenceId} refund`,
      );
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') { log.info({ err: err.message }, 'Duplicate — skip'); return; }
      log.error({ err }, 'Accounting refund event failed');
    }
  });

  // ── R5-D2-C — per-refund-line accounting for one recurring-series PARTIAL
  //    refund allocation. Reverses EXACTLY the refunded slice of ONE
  //    allocation using only its PERSISTED snapshot:
  //      CourtZon  booking_refund:                Dr 2202 orgNet · Dr 4110 comm ·
  //                                                Dr 2300 tax · Cr 1100 gross
  //      Org book  booking_org_receivable_reversal: Dr org revenue(orgNet+comm) ·
  //                                                Cr org 1161 orgNet · Cr comm exp
  //    `source_id` = a deterministic per-(payment, allocation, idempotency-key)
  //    line identity (never the seriesId), so two allocations and two operations
  //    on one allocation never collide, and a replay of the SAME operation is
  //    idempotent via hasPosting('booking', sourceId, event_type).
  //    The allocation refund path never emits the full-series `payment:refunded`
  //    (see PaymentService._finalizeAllocationRefund), so this line-level
  //    reversal does not double with R5-D1's series-wide reversal.
  eventBusV2.on('payment:allocation-refunded', async (data: any) => {
    try {
      if (data?.referenceType && data.referenceType !== 'booking_series') return;
      const paymentId = Number(data.paymentId);
      const allocationId = Number(data.allocationId);
      const amount = Number(data.amount);
      const idempotencyKey = String(data.idempotencyKey || '');
      if (!paymentId || !allocationId || !(amount > 0) || !idempotencyKey) return;

      const allocation = await paymentAllocationRepository.findById(allocationId);
      if (!allocation) {
        log.error({ paymentId, allocationId }, 'Allocation not found for partial refund accounting');
        return;
      }
      if (allocation.paymentTransactionId !== paymentId) {
        log.error({ paymentId, allocationId }, 'Allocation does not belong to this payment — skipping');
        return;
      }
      const seriesId = allocation.seriesId ?? (Number(data.seriesId ?? 0) || null);
      const orgId = seriesId
        ? (await bookingSeriesRepository.findById(seriesId))?.organisationId ?? null
        : null;
      const r2 = (n: number) => Math.round(n * 100) / 100;
      // Prorate the snapshot by the refunded fraction of THIS allocation (1 for a
      // full-allocation refund → components equal the snapshot exactly).
      const gross = allocation.grossAmount > 0 ? allocation.grossAmount : 1;
      const ratio = Math.min(Math.max(amount / gross, 0), 1);
      const orgNet = r2(allocation.orgNetAmount * ratio);
      const commission = r2(allocation.commissionAmount * ratio);
      const tax = r2(allocation.taxAmount * ratio);
      const grossSlice = r2(orgNet + commission + tax);   // balanced CourtZon credit
      const subtotalSlice = r2(orgNet + commission);      // balanced org revenue leg
      const sourceId = paymentAllocationService.refundLineSourceId(paymentId, allocationId, idempotencyKey);
      const auditLabel = `Recurring series #${seriesId ?? '?'} allocation refund (payment ${paymentId}, allocation ${allocationId}, op ${idempotencyKey})`;

      // CourtZon book (org NULL) — per-line slice of booking_refund.
      await postAccountingEvent(
        'booking_refund', 'booking', sourceId, null,
        { merchant_payable: orgNet, platform_commission: commission, tax_liability: tax, payment_clearing: grossSlice },
        allocation.currency || 'EGP',
        auditLabel,
        undefined,
        { merchant_payable: null, platform_commission: null, tax_liability: null, payment_clearing: null },
      );

      // Organization book — per-line booking_org_receivable_reversal.
      if (orgId != null) {
        await postAccountingEvent(
          'booking_org_receivable_reversal', 'booking', sourceId, orgId,
          { court_rental_revenue: subtotalSlice, marketplace_receivable: orgNet, commission_expense: commission },
          allocation.currency || 'EGP',
          `${auditLabel} (organization book)`,
          undefined,
          { court_rental_revenue: orgId, marketplace_receivable: orgId, commission_expense: orgId },
        );
      } else {
        log.info({ seriesId }, 'Allocation refund: no organisationId — organization reversal skipped (CourtZon reversed)');
      }
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') { log.info({ err: err.message }, 'Duplicate allocation refund entry — idempotent skip'); return; }
      log.error({ err }, 'Allocation refund accounting failed');
    }
  });

  // A failed payment (pending → failed) is a non-event economically:
  //   - No money moved (gateway declined / wallet never debited).
  //   - No revenue was recognized (recognition only happens on payment:succeeded).
  //   - No payment_clearing position exists to reverse.
  // Therefore a failed payment MUST NOT create any accounting entry. Posting
  // bad_debt/payment_clearing here would credit a clearing asset that was never
  // debited and fabricate a bad-debt expense for money never collected.
  // (Bad debt / receivable write-off for genuinely uncollectible COD receivables
  //  is a distinct future flow and is intentionally NOT handled here.)
  eventBusV2.on('payment:failed-event', async (data: any) => {
    log.info({ paymentId: data.paymentId, referenceType: data.referenceType, reason: data.reason }, 'payment:failed — no accounting entry (non-event)');
  });

  // ── Marketplace Events ──

  // CASH/COD marketplace accounting is released at START PROCESSING (order →
  // `processing`), when the seller begins fulfilment and is deemed to have
  // taken on the sale + its CourtZon commission obligation. Only COD/cash
  // orders post here (card/wallet were already recognized at payment time via
  // marketplace_card/wallet_payment). Idempotent per posting.
  eventBusV2.on('marketplace:order-processing', async (data: any) => {
    try {
      const orderId = data.orderId || data.id;
      const currency = data.currency || 'EGP';
      if (!orderId) return;

      const econ = await resolveOrderEconomics(orderId);
      if (!econ) return;
      if (econ.cashHolder !== 'org') return;

      await postMarketplaceCashCommissionAccounting(orderId, currency);
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') { log.info({ err: err.message }, 'Duplicate — skip'); return; }
      log.error({ err }, 'Marketplace start-processing (cash) accounting failed');
    }
  });

  // Delivery is a business-state event only. CASH/COD accounting is already
  // released at START PROCESSING (see marketplace:order-processing); card/wallet
  // were recognized at payment time. No additional accounting is posted here.
  eventBusV2.on('marketplace:order-delivered', async (data: any) => {
    try {
      const orderId = data.orderId || data.id;
      if (!orderId) return;

      const econ = await resolveOrderEconomics(orderId);
      if (!econ) return;

      // Cash accounting was released at start-processing; delivery adds nothing.
      if (econ.cashHolder !== 'org') return;
      log.info({ orderId }, 'Marketplace delivered — cash accounting already released at start processing; no-op');
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') { log.info({ err: err.message }, 'Duplicate — skip'); return; }
      log.error({ err }, 'Marketplace delivery accounting failed');
    }
  });

  eventBusV2.on('marketplace:order-refunded', async (data: any) => {
    try {
      const orderId = data.orderId || data.id;
      const currency = data.currency || 'EGP';
      if (!orderId) return;

      const econ = await resolveOrderEconomics(orderId);
      if (!econ) return;
      if (econ.cashHolder !== 'org') return;

      await postMarketplaceCashReversalAccounting(orderId, currency, 'refunded');
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') { log.info({ err: err.message }, 'Duplicate — skip'); return; }
      log.error({ err }, 'Marketplace refund accounting failed');
    }
  });

  eventBusV2.on('marketplace:order-cancelled', async (data: any) => {
    try {
      const orderId = data.orderId || data.id;
      const currency = data.currency || 'EGP';
      if (!orderId) return;

      const econ = await resolveOrderEconomics(orderId);
      if (!econ) return;
      if (econ.cashHolder !== 'org') return;

      await postMarketplaceCashReversalAccounting(orderId, currency, 'cancelled');
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') { log.info({ err: err.message }, 'Duplicate — skip'); return; }
      log.error({ err }, 'Marketplace cancel accounting failed');
    }
  });

  // ── Withdrawal Events ──

  eventBusV2.on('wallet:withdrawal-submitted', async (data: any) => {
    try {
      const withdrawalId = data.withdrawalId || data.id;
      const amount = Number(data.amount || 0);
      const currency = data.currency || 'EGP';
      if (!withdrawalId || amount <= 0) return;

      await postAccountingEvent(
        'withdrawal_request', 'wallet', withdrawalId, null,
        { wallet_liability: amount, withdrawal_clearing: amount },
        currency,
        `Withdrawal #${withdrawalId} requested`,
      );
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') { log.info({ err: err.message }, 'Duplicate — skip'); return; }
      log.error({ err }, 'Withdrawal request accounting failed');
    }
  });

  eventBusV2.on('wallet:withdrawal-completed', async (data: any) => {
    try {
      const withdrawalId = data.withdrawalId || data.id;
      const amount = Number(data.amount || 0);
      const currency = data.currency || 'EGP';
      if (!withdrawalId || amount <= 0) return;

      await postAccountingEvent(
        'withdrawal_completion', 'wallet', withdrawalId, null,
        { withdrawal_clearing: amount, cash_bank: amount },
        currency,
        `Withdrawal #${withdrawalId} completed`,
      );
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') { log.info({ err: err.message }, 'Duplicate — skip'); return; }
      log.error({ err }, 'Withdrawal completion accounting failed');
    }
  });

  // ── Payment Gateway Settlement Event ──

  // A successful CARD/CREDIT marketplace payment debits 1100 Payment Clearing
  // (gateway clearing asset); it NEVER debits Bank/Cash. Only an ACTUAL gateway
  // settlement (the gateway transferring cleared funds to CourtZon's bank)
  // emits this event → Dr Bank / Cr Payment Clearing. No fake/simulated
  // settlement is generated anywhere; the gateway settlement process emits it
  // when a real settlement occurs.
  eventBusV2.on('payment:gateway-settled', async (data: any) => {
    try {
      const sourceId = Number(data.settlementId || data.id || 0);
      const gross = Number(data.gross ?? data.amount ?? 0);
      const net = Number(data.net ?? gross);
      const fee = Number(data.fee ?? 0);
      const currency = data.currency || 'EGP';
      if (!sourceId || gross <= 0) return;
      await postGatewaySettlementAccounting(sourceId, gross, net, fee, currency);
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') { log.info({ err: err.message }, 'Duplicate — skip'); return; }
      log.error({ err }, 'Payment gateway settlement accounting failed');
    }
  });

  // Reversal of a gateway settlement. The reversal journal is ALREADY posted
  // inside the reversing transaction (atomic with status/metadata); this
  // listener exists only for crash-safe replay symmetry with the create event
  // and safely no-ops (hasPosting) when the durable posting already exists.
  eventBusV2.on('payment:gateway-settlement-reversed', async (data: any) => {
    try {
      const sourceId = Number(data.settlementId || 0);
      const gross = Number(data.gross ?? 0);
      const net = Number(data.net ?? gross);
      const fee = Number(data.fee ?? 0);
      const currency = data.currency || 'EGP';
      if (!sourceId || gross <= 0) return;
      await postGatewaySettlementReversalAccounting(sourceId, gross, net, fee, currency);
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') { log.info({ err: err.message }, 'Duplicate — skip'); return; }
      log.error({ err }, 'Payment gateway settlement reversal accounting failed');
    }
  });

  // ── Settlement Events ──

  eventBusV2.on('settlement:paid', async (data: any) => {
    try {
      const settlementId = data.settlementId;
      const amount = Number(data.amount || 0);
      const direction: string = data.direction || 'courtzon_to_org';
      // The org whose entitlement is being settled (seller/merchant org).
      const orgId = data.organisationId || null;
      const currency = data.currency || 'EGP';
      if (!settlementId || amount <= 0) return;

      // When both components are present (online net vs COD fee), post an
      // explicit offset entry — clear the FULL payable and the FULL receivable
      // against the net cash movement. Never silently net down.
      const onlineNet = Number(data.onlineNet || 0);
      const codFee = Number(data.codFee || 0);
      const hasOffset = onlineNet > 0 && codFee > 0;

      // ── COURTZON BOOK payout (ALWAYS organisation_id = NULL) ──
      // The platform settlement payout (Dr Merchant Payable 2202 / Cr Cash-Bank
      // 1120) is CourtZon's OWN ledger. It must NEVER be stamped with the
      // seller's organisation_id — doing so leaks the platform payout into the
      // organization's accounting records. Only the org-side receipt (below) is
      // org-scoped, keeping the two books fully separated.
      if (hasOffset) {
        const eventType = direction === 'org_to_courtzon' ? 'settlement_paid_otc_offset' : 'settlement_paid_offset';
        const conceptAmounts = direction === 'org_to_courtzon'
          ? ({ cash_bank: amount, merchant_payable: onlineNet, marketplace_receivable: codFee } as Record<string, number>)
          : ({ merchant_payable: onlineNet, cash_bank: amount, marketplace_receivable: codFee } as Record<string, number>);
        await postAccountingEvent(
          eventType, 'settlement', settlementId, null,
          conceptAmounts, currency,
          `Settlement #${settlementId} paid (offset: online ${onlineNet} vs COD ${codFee})`,
        );
      } else {
        const eventType = direction === 'org_to_courtzon' ? 'settlement_paid_otc' : 'settlement_paid';
        const conceptAmounts: Record<string, number> = eventType === 'settlement_paid_otc'
          ? ({ cash_bank: amount, marketplace_receivable: amount } as Record<string, number>)
          : ({ merchant_payable: amount, cash_bank: amount } as Record<string, number>);
        await postAccountingEvent(
          eventType, 'settlement', settlementId, null,
          conceptAmounts, currency,
          `Settlement #${settlementId} paid`,
        );
      }

      // ── ORGANIZATION BOOK settlement receipt (org-scoped) ──
      // Only when CourtZon actually pays the org (courtZon → org) does the org
      // record its OWN cash receipt, entirely separate from CourtZon's book:
      //   Dr org Cash/Bank                = amount received
      //   Cr org 1161 Marketplace Receivable = amount due from CourtZon (cleared)
      // This clears the org's 1161 receivable (merchantNet + shipping accrued at
      // sale) against the cash received. Idempotent per
      // (source_type='settlement', source_id, event_type='settlement_org_receipt')
      // — an independent dedup key from the CourtZon payout above.
      if (direction !== 'org_to_courtzon' && orgId != null) {
        await postAccountingEvent(
          'settlement_org_receipt', 'settlement', settlementId, orgId,
          { marketplace_receivable: amount, org_cash_bank: amount },
          currency,
          `Settlement #${settlementId} organization receipt`,
        );
      }

      // ── ORGANIZATION BOOK OTC cash pay (org-scoped) ──
      // When the ORG pays CourtZon (direction ORG → CourtZon, e.g. COD
      // commission collected by the org), clear the org's accrued CourtZon
      // payable against its own cash/bank:
      //   Dr org CourtZon Payable  = amount actually paid
      //   Cr org Cash/Bank          = same
      // This keeps the org book balanced after COD collection booked
      // (booking_org_cash_receivable: Dr ORG-CASH / Cr CourtZon Payable).
      // Idempotent per
      // (source_type='settlement', source_id, event_type='settlement_org_cash_pay').
      if (direction === 'org_to_courtzon' && orgId != null) {
        await postAccountingEvent(
          'settlement_org_cash_pay', 'settlement', settlementId, orgId,
          { courtzon_payable: amount, org_cash_bank: amount },
          currency,
          `Settlement #${settlementId} organization OTC cash paid to CourtZon`,
        );
      }
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') { log.info({ err: err.message }, 'Duplicate — skip'); return; }
      log.error({ err }, 'Settlement paid accounting failed');
    }
  });

  // ── Booking Accounting Events ──
  // COD bookings emit booking:paid directly (they don't route through the
  // generic payment gateway listener). Card/wallet bookings route through
  // payment:succeeded → postBookingPaymentAccounting.

  eventBusV2.on('booking:paid', async (data: any) => {
    try {
      const bookingId = data.bookingId || data.sourceId;
      const currency = data.currency || 'EGP';
      if (!bookingId) return;
      await postBookingPaymentAccounting(Number(bookingId), data.paymentMethod || 'cod', currency);
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') { log.info({ err: err.message }, 'Duplicate — skip'); return; }
      log.error({ err, bookingId: data.bookingId }, 'Booking paid accounting failed');
    }
  });

  eventBusV2.on('booking:refunded', async (data: any) => {
    try {
      const bookingId = data.bookingId;
      const refundAmount = Number(data.refundAmount ?? data.grossAmount ?? 0);
      const currency = data.currency || 'EGP';
      if (!bookingId || refundAmount <= 0) return;
      await postBookingRefundAccounting(Number(bookingId), refundAmount, currency);
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') { log.info({ err: err.message }, 'Duplicate — skip'); return; }
      log.error({ err, bookingId: data.bookingId }, 'Booking refund accounting failed');
    }
  });

  // ── Tournament Prize Payout Accounting (G11.5 Phase 1) ─────────────────
  // The business module never posts directly — it emits the award lifecycle
  // domain events AFTER the award transaction commits; this listener posts the
  // GL idempotently (source_type='tournament', source_id=awardId, dedicated
  // event types). Amounts are re-read from the durable award row, never from
  // the event payload. Refunds are FULL-ONLY inverse postings (Q10b).
  eventBusV2.on('tournament:prize-awarded', async (data: any) => {
    try {
      const awardId = Number(data.awardId);
      if (!awardId) return;
      await postPrizeAwardAccounting(awardId);
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') { log.info({ err: err.message }, 'Duplicate — skip'); return; }
      log.error({ err, awardId: data.awardId }, 'Prize award accounting failed');
    }
  });

  eventBusV2.on('tournament:prize-refunded', async (data: any) => {
    try {
      const awardId = Number(data.awardId);
      if (!awardId) return;
      await postPrizeRefundAccounting(awardId);
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') { log.info({ err: err.message }, 'Duplicate — skip'); return; }
      log.error({ err, awardId: data.awardId }, 'Prize refund accounting failed');
    }
  });

  log.info('Accounting event listeners registered');
}

/**
 * Durable accounting replay — Exception 3 hardening.
 *
 * The in-memory `on()` handlers above run POST-COMMIT in the same process. If
 * the process crashes in the window between the business transaction committing
 * (which atomically persisted the event to `published_events`) and the in-memory
 * handler running, the accounting posting would be lost — a payment could remain
 * `paid` with no GL.
 *
 * The existing durable outbox mechanism (outbox poller → BullMQ subscribers →
 * `processed_events` idempotency) already replays events after a crash for the
 * entitlement listeners. These registrations route the SAME accounting events
 * through that same durable infrastructure: on normal operation the in-memory
 * handler posts immediately; if the process dies before it runs, the outbox
 * poller re-delivers the event to the BullMQ worker which re-dispatches to the
 * same in-memory handler function (single source of logic — no duplicated
 * Accounting Engine code). Replay is idempotent via `processed_events` +
 * `hasPosting` + `uk_dedup`, so a re-delivered event that was already posted is
 * a safe no-op.
 */
const ACCOUNTING_REPLAY_EVENTS = [
  'payment:succeeded',
  'payment:refunded',
  // R5-D2-C — per-allocation partial refund line (crash-safe durable replay).
  'payment:allocation-refunded',
'payment:gateway-settled',
  'payment:gateway-settlement-reversed',
  'marketplace:order-processing',
  'marketplace:order-delivered',
  'marketplace:order-refunded',
  'marketplace:order-cancelled',
  'wallet:withdrawal-submitted',
  'wallet:withdrawal-completed',
  'settlement:paid',
  'booking:paid',
  'booking:refunded',
  // G11.5 — prize award lifecycle postings replay through the same durable
  // outbox → BullMQ channel (award commits and the postings must never be lost
  // to a process crash between commit and the in-memory handler).
  'tournament:prize-awarded',
  'tournament:prize-refunded',
] as const;

const ACCOUNTING_REPLAY_QUEUE = 'accounting-replay';

function replayDispatch(eventName: string, payload: unknown): Promise<void> {
  const handlers = eventBusV2.getInMemoryHandlers(eventName);
  const results: Promise<unknown>[] = [];
  for (const h of handlers) {
    try {
      results.push(Promise.resolve(h(payload)));
    } catch (err) {
      log.error({ err, eventName }, 'Accounting replay dispatch failed');
    }
  }
  return Promise.all(results).then(() => undefined);
}

export function registerAccountingReplaySubscribers(): void {
  for (const eventName of ACCOUNTING_REPLAY_EVENTS) {
    eventBusV2.subscribe({
      subscriberId: ACCOUNTING_REPLAY_QUEUE,
      eventName,
      queueName: ACCOUNTING_REPLAY_QUEUE,
      handler: (envelope) => replayDispatch(envelope.eventName, envelope.payload),
      options: { attempts: 6, backoffDelay: 2000, startingCursor: 'latest', concurrency: 2 },
    });
  }
  log.info({ events: ACCOUNTING_REPLAY_EVENTS.length }, 'Accounting replay subscribers registered');
}

export async function createAccountingReplayWorkers(): Promise<any[]> {
  // Lazy dynamic import: subscriber.worker pulls redis.client → config/env which
  // is not needed at listener import time and would break unit specs that mock
  // the DB layer without full env.
  const { createSubscriberWorker } = await import('../../../shared/event-bus/subscriber.worker.js');
  const worker = createSubscriberWorker({
    subscriberId: ACCOUNTING_REPLAY_QUEUE,
    queueName: ACCOUNTING_REPLAY_QUEUE,
    handler: async (envelope) => {
      await replayDispatch(envelope.eventName, envelope.payload);
    },
    concurrency: 2,
    attempts: 6,
    backoffDelay: 2000,
  });
  log.info('Accounting replay worker created');
  return [worker];
}

export { postAccountingEvent, postGatewaySettlementAccounting, postGatewaySettlementReversalAccounting, postMarketplacePaymentAccounting, postMarketplaceRefundAccounting, postMarketplaceCashCommissionAccounting, postMarketplaceCashReversalAccounting, postSeriesCashAccounting };
