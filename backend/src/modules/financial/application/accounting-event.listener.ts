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
  merchantShare: number;
  commission: number;
  tax: number;
  grossAmount: number;
  paymentMethod: string;
  cashHolder: string;
}

/**
 * Resolve marketplace order economics for custody-correct accounting.
 * CourtZon revenue = commission only; merchant share = payable; tax = liability.
 */
async function resolveOrderEconomics(orderId: number): Promise<OrderEconomics | null> {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT o.id, o.total, o.tax_amount, o.commission_amount, o.courtzon_fee, o.payment_method, o.cash_holder
     FROM orders o WHERE o.id = ? LIMIT 1`,
    [orderId],
  );
  if (!rows.length) return null;
  const o = rows[0] as any;
  const [items] = await pool.execute<RowData>(
    `SELECT DISTINCT seller_id FROM order_items WHERE order_id = ? LIMIT 1`, [orderId],
  );
  const merchantId = (items as any[])[0]?.seller_id ?? null;
  const grossAmount = Number(o.total || 0);
  const tax = Number(o.tax_amount || 0);
  // commission_amount is persisted at order creation; courtzon_fee is only set
  // later during confirmation (after payment:succeeded fires) — prefer the
  // creation-time snapshot, fall back to courtzon_fee for older rows.
  const commission = Number(o.commission_amount || o.courtzon_fee || 0);
  const merchantShare = Math.round((grossAmount - commission - tax) * 100) / 100;

  // cash_holder is only set during confirmation — derive from payment_method
  // for the payment-time custody decision (cash/COD ⇒ org holds cash).
  const paymentMethod = o.payment_method || 'card';
  const cashHolder = o.cash_holder || (paymentMethod === 'cash' ? 'org' : 'courtzon');

  return {
    orderId,
    merchantId,
    merchantShare,
    commission,
    tax,
    grossAmount,
    paymentMethod,
    cashHolder,
  };
}

async function postMarketplacePaymentAccounting(orderId: number, paymentMethod: string, currency: string): Promise<void> {
  const econ = await resolveOrderEconomics(orderId);
  if (!econ) {
    log.error({ orderId }, 'Marketplace order economics not found — skipping accounting');
    return;
  }
  // CourtZon collected payment: commission = revenue, merchant share = payable.
  // (COD/cash orders never emit payment:succeeded — they are recognized at delivery.)
  const eventType = paymentMethod === 'wallet' ? 'marketplace_wallet_payment' : 'marketplace_card_payment';
  await postAccountingEvent(
    eventType, 'marketplace', orderId, econ.merchantId,
    {
      merchant_payable: econ.merchantShare,
      platform_commission: econ.commission,
      tax_liability: econ.tax,
      payment_clearing: eventType === 'marketplace_card_payment' ? econ.grossAmount : 0,
      wallet_liability_spend: eventType === 'marketplace_wallet_payment' ? econ.grossAmount : 0,
    },
    currency,
    `Order #${orderId} payment (custody: ${econ.cashHolder})`,
  );
}

async function postMarketplaceRefundAccounting(orderId: number, currency: string): Promise<void> {
  const econ = await resolveOrderEconomics(orderId);
  if (!econ) {
    log.error({ orderId }, 'Marketplace order economics not found — skipping refund accounting');
    return;
  }
  // Reverse merchant payable + commission + tax. Wallet orders return funds to
  // the customer's wallet (wallet_liability credit); card orders reverse the
  // payment_clearing asset.
  const isWallet = econ.paymentMethod === 'wallet';
  const eventType = isWallet ? 'marketplace_wallet_refund' : 'marketplace_merchant_refund';
  await postAccountingEvent(
    eventType, 'marketplace', orderId, econ.merchantId,
    {
      merchant_payable: econ.merchantShare,
      platform_commission: econ.commission,
      tax_liability: econ.tax,
      payment_clearing: isWallet ? 0 : econ.grossAmount,
      wallet_liability: isWallet ? econ.grossAmount : 0,
    },
    currency,
    `Order #${orderId} refunded (custody reversal)`,
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
): Promise<void> {
  const alreadyPosted = await ledgerRepository.hasPosting(sourceType, sourceId, eventType);
  if (alreadyPosted) {
    log.info({ eventType, sourceType, sourceId }, 'Accounting posting already exists — idempotent skip');
    return;
  }

  const mapping = await accountingEngineService.resolveMapping(eventType, organisationId);
  const accountIds = mapping.map(m => m.accountId);
  await accountingEngineService.validateAccounts(accountIds, organisationId);

  const resolved = accountingEngineService.buildLedgerLines(eventType, mapping, conceptAmounts);
  accountingEngineService.validateBalance(resolved);

  const transactionId = `acct_${eventType}_${sourceType}_${sourceId}_${Date.now()}`;
  const lines: LedgerLineInput[] = resolved.map(l => ({
    transactionId,
    sourceType,
    sourceId,
    eventType,
    organisationId,
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

      const paymentMethod: string = data.metadata?.paymentMethod || 'card';
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

      // Only COD orders need delivery recognition (card/wallet were already
      // recognized at payment time via marketplace_card/wallet_payment).
      if (econ.cashHolder !== 'org') return;

      await postAccountingEvent(
        'marketplace_delivery', 'marketplace', orderId, econ.merchantId,
        { receivable_from_org: econ.commission + econ.tax, platform_commission: econ.commission, tax_liability: econ.tax },
        currency,
        `Order #${orderId} delivered (COD — commission receivable)`,
      );
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

      // Only reverse a COD receivable if delivery recognition actually posted.
      // A COD order cancelled/refunded before delivery never posted
      // marketplace_delivery, so reversing it would create a phantom credit.
      const delivered = await ledgerRepository.hasPosting('marketplace', orderId, 'marketplace_delivery');
      if (!delivered) return;

      await postAccountingEvent(
        'marketplace_reversal', 'marketplace', orderId, econ.merchantId,
        { platform_commission: econ.commission, tax_liability: econ.tax, receivable_from_org: econ.commission + econ.tax },
        currency,
        `Order #${orderId} refunded (COD — commission receivable reversed)`,
      );
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

      // Same guard: only reverse if delivery recognition actually posted.
      const delivered = await ledgerRepository.hasPosting('marketplace', orderId, 'marketplace_delivery');
      if (!delivered) return;

      await postAccountingEvent(
        'marketplace_reversal', 'marketplace', orderId, econ.merchantId,
        { platform_commission: econ.commission, tax_liability: econ.tax, receivable_from_org: econ.commission + econ.tax },
        currency,
        `Order #${orderId} cancelled (COD — commission receivable reversed)`,
      );
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

export { postAccountingEvent };
