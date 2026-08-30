import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { accountingEngineService } from './accounting-engine.service.js';
import { ledgerRepository } from '../infrastructure/repositories/ledger.repository.js';
import { glProjectionService } from './gl-projection.service.js';
import { bookingAccounting } from './booking-accounting.service.js';
import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import type { SourceType, LedgerLineInput, EntrySide, LedgerEntry } from '../domain/ledger-aggregate.js';
import { createLedgerLines, validateLedgerBalance } from '../domain/ledger-aggregate.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('accounting-listener');
type RowData = RowDataPacket[];

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
 * Post marketplace CARD/WALLET payment accounting for EVERY seller-order in the
 * checkout group. CourtZon collects the full customer amount (clearing), owes
 * each beneficiary its merchandise net (2202) + shipping (2400), and retains
 * its commission (4160, platform-scoped). Each seller-order is posted
 * independently and idempotently.
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
    await postAccountingEvent(
      eventType, 'marketplace', oid, null,
      {
        merchant_payable: econ.merchantNet,
        shipping: econ.shipping,
        platform_commission: econ.commission,
        tax_liability: econ.tax,
        payment_clearing: eventType === 'marketplace_card_payment' ? econ.grossAmount : 0,
        wallet_liability_spend: eventType === 'marketplace_wallet_payment' ? econ.grossAmount : 0,
      },
      currency,
      `Order #${oid} payment (custody: ${econ.cashHolder})`,
      undefined,
      {
        merchant_payable: econ.merchantId,
        shipping: econ.merchantId,
        platform_commission: null,
        payment_clearing: null,
        tax_liability: null,
        wallet_liability_spend: null,
      },
    );
  }
}

async function postMarketplaceRefundAccounting(orderId: number, currency: string): Promise<void> {
  const orderIds = await resolveCheckoutOrderIds(orderId);
  for (const oid of orderIds) {
    const econ = await resolveOrderEconomics(oid);
    if (!econ) {
      log.error({ orderId: oid }, 'Marketplace order economics not found — skipping refund accounting');
      continue;
    }
    // Reverse merchant merchandise payable + shipping + commission + tax.
    // Wallet orders return funds to the customer's wallet (wallet_liability
    // credit); card orders reverse the payment_clearing asset.
    const isWallet = econ.paymentMethod === 'wallet';
    const eventType = isWallet ? 'marketplace_wallet_refund' : 'marketplace_merchant_refund';
    await postAccountingEvent(
      eventType, 'marketplace', oid, null,
      {
        merchant_payable: econ.merchantNet,
        shipping: econ.shipping,
        platform_commission: econ.commission,
        tax_liability: econ.tax,
        payment_clearing: isWallet ? 0 : econ.grossAmount,
        wallet_liability: isWallet ? econ.grossAmount : 0,
      },
      currency,
      `Order #${oid} refunded (custody reversal)`,
      undefined,
      {
        merchant_payable: econ.merchantId,
        shipping: econ.merchantId,
        platform_commission: null,
        payment_clearing: null,
        tax_liability: null,
        wallet_liability: null,
      },
    );
  }
}

/**
 * Post marketplace CASH/COD commission receivable. The seller collected the
 * customer's cash directly, so CourtZon is owed only its commission (a
 * receivable from the seller). The full customer amount NEVER enters 1100.
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
      `Order #${oid} delivered (cash — commission receivable)`,
      undefined,
      { marketplace_receivable: econ.merchantId, platform_commission: null },
    );
  }
}

/**
 * Reverse a marketplace cash/COD commission receivable on refund/cancel.
 * Reverses 1161 (receivable) and 4160 (platform revenue) — per-seller-order.
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
      { platform_commission: null, marketplace_receivable: econ.merchantId },
    );
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
  const entryDate = recordedAt.slice(0, 10);
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
  const econ = await bookingAccounting.resolveBookingEconomics(bookingId);
  if (!econ) {
    log.error({ bookingId }, 'Booking economics not found — skipping booking accounting');
    return;
  }
  const isCOD = paymentMethod === 'cod' || paymentMethod === 'cash';
  const eventType = paymentMethod === 'wallet' ? 'booking_wallet_payment'
    : isCOD ? 'booking_cod_payment'
    : 'booking_card_payment';

  // The debit (payment side) must equal the sum of credits.
  const grossPayable = econ.orgAmount + econ.commissionAmount + econ.taxAmount;

  if (isCOD) {
    // COD — the org collects the cash directly. CourtZon is owed only
    // commission + tax (a receivable from the org). The org share is the
    // org's own revenue and never enters CourtZon's canonical ledger.
    await postAccountingEvent(
      eventType, 'booking', bookingId, econ.organisationId,
      {
        receivable_from_org: econ.commissionAmount + econ.taxAmount,
        platform_commission: econ.commissionAmount,
        tax_liability: econ.taxAmount,
      },
      currency,
      `Booking #${bookingId} COD payment (commission receivable)`,
    );
    return;
  }

  await postAccountingEvent(
    eventType, 'booking', bookingId, econ.organisationId,
    {
      org_payable: econ.orgAmount,
      platform_commission: econ.commissionAmount,
      tax_liability: econ.taxAmount,
      payment_clearing: eventType === 'booking_card_payment' ? grossPayable : 0,
      wallet_liability_spend: eventType === 'booking_wallet_payment' ? grossPayable : 0,
    },
    currency,
    `Booking #${bookingId} payment`,
  );

  // Coach payable (separate explicit event, only when coach share exists)
  if (econ.coachAmount > 0) {
    await postAccountingEvent(
      'booking_coach_payout', 'booking', bookingId, econ.organisationId,
      { coach_expense: econ.coachAmount, coach_payable: econ.coachAmount },
      currency,
      `Booking #${bookingId} coach payout`,
    );
  }
}

async function postBookingRefundAccounting(bookingId: number, refundAmount: number, currency: string): Promise<void> {
  const refund = await bookingAccounting.computeRefundEconomics(bookingId, refundAmount);
  if (!refund) {
    log.error({ bookingId }, 'Booking refund economics not found — skipping refund accounting');
    return;
  }
  if (refund.refundedAmount <= 0) return;

  // ── COD refund: reverse the COD economics (receivable + commission + tax) ──
  // COD bookings never created org_payable or payment_clearing; they created
  // receivable_from_org. Reversing them through booking_refund (card/wallet)
  // would fabricate org_payable/payment_clearing entries for money that was
  // never in CourtZon's custody.
  const isCOD = refund.paymentMethod === 'cash' || refund.paymentMethod === 'cod';
  if (isCOD) {
    await postAccountingEvent(
      'booking_cod_reversal', 'booking', bookingId, refund.organisationId,
      {
        platform_commission: refund.commissionAmount,
        tax_liability: refund.taxAmount,
        receivable_from_org: refund.commissionAmount + refund.taxAmount,
      },
      currency,
      `Booking #${bookingId} COD refund`,
    );
    return;
  }

  // Reverse the proportional economic components (debit side).
  const isWallet = refund.paymentMethod === 'wallet';
  const eventType = isWallet ? 'booking_wallet_refund' : 'booking_refund';
  await postAccountingEvent(
    eventType, 'booking', bookingId, refund.organisationId,
    {
      org_payable: refund.orgAmount,
      platform_commission: refund.commissionAmount,
      tax_liability: refund.taxAmount,
      payment_clearing: isWallet ? 0 : refund.paymentAmount,
      wallet_liability: isWallet ? refund.paymentAmount : 0,
    },
    currency,
    `Booking #${bookingId} refund`,
  );

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

export function registerAccountingEventListeners(): void {
  // ── Payment Events ──

  eventBusV2.on('payment:succeeded', async (data: any) => {
    try {
      const paymentMethod: string = data.metadata?.paymentMethod || 'card';
      const referenceType: string = data.referenceType;
      const referenceId: number = data.referenceId;
      const amount: number = Number(data.amount);
      const currency: string = data.metadata?.currency || 'EGP';
      if (!referenceType || !referenceId || !amount) return;

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

  eventBusV2.on('marketplace:order-delivered', async (data: any) => {
    try {
      const orderId = data.orderId || data.id;
      const currency = data.currency || 'EGP';
      if (!orderId) return;

      const econ = await resolveOrderEconomics(orderId);
      if (!econ) return;

      // Only COD/cash orders need delivery recognition (card/wallet were already
      // recognized at payment time via marketplace_card/wallet_payment). Cash is
      // recognised as a commission RECEIVABLE from the seller (1161) — the seller
      // collected the customer's cash, so the full amount never enters 1100.
      if (econ.cashHolder !== 'org') return;

      await postMarketplaceCashCommissionAccounting(orderId, currency);
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

  // ── Settlement Events ──

  eventBusV2.on('settlement:paid', async (data: any) => {
    try {
      const settlementId = data.settlementId;
      const amount = Number(data.amount || 0);
      const direction: string = data.direction || 'courtzon_to_org';
      const orgId = data.organisationId || null;
      const currency = data.currency || 'EGP';
      if (!settlementId || amount <= 0) return;

      // When both components are present (online net vs COD fee), post an
      // explicit offset entry — clear the FULL payable and the FULL receivable
      // against the net cash movement. Never silently net down.
      const onlineNet = Number(data.onlineNet || 0);
      const codFee = Number(data.codFee || 0);
      const hasOffset = onlineNet > 0 && codFee > 0;

      if (hasOffset) {
        const eventType = direction === 'org_to_courtzon' ? 'settlement_paid_otc_offset' : 'settlement_paid_offset';
        const conceptAmounts = direction === 'org_to_courtzon'
          ? ({ cash_bank: amount, org_payable: onlineNet, receivable_from_org: codFee } as Record<string, number>)
          : ({ org_payable: onlineNet, cash_bank: amount, receivable_from_org: codFee } as Record<string, number>);
        await postAccountingEvent(
          eventType, 'settlement', settlementId, orgId,
          conceptAmounts, currency,
          `Settlement #${settlementId} paid (offset: online ${onlineNet} vs COD ${codFee})`,
        );
        return;
      }

      const eventType = direction === 'org_to_courtzon' ? 'settlement_paid_otc' : 'settlement_paid';
      const conceptAmounts: Record<string, number> = eventType === 'settlement_paid_otc'
        ? ({ cash_bank: amount, receivable_from_org: amount } as Record<string, number>)
        : ({ org_payable: amount, cash_bank: amount } as Record<string, number>);

      await postAccountingEvent(
        eventType, 'settlement', settlementId, orgId,
        conceptAmounts, currency,
        `Settlement #${settlementId} paid`,
      );
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
  'marketplace:order-delivered',
  'marketplace:order-refunded',
  'marketplace:order-cancelled',
  'wallet:withdrawal-submitted',
  'wallet:withdrawal-completed',
  'settlement:paid',
  'booking:paid',
  'booking:refunded',
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

export { postAccountingEvent, postMarketplacePaymentAccounting, postMarketplaceRefundAccounting, postMarketplaceCashCommissionAccounting };
