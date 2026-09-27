/**
 * R5-B — ONE card payment for ONE recurring series.
 *
 * Business model enforced here:
 *
 *   ONE recurring series
 *          ↓
 *   ONE player                 (payment_transactions.user_id = the PLAYER)
 *          ↓
 *   ONE payment_transactions row
 *   reference_type = 'booking_series'
 *   reference_id   = booking_series.id
 *   booking_id     = NULL
 *   amount         = AUTHORITATIVE series GROSS (subtotal + tax —
 *                    Σ persisted occurrence total_amount + tax_amount)
 *   idempotency_key= deterministic, series-scoped
 *          ↓
 *   ONE gateway transaction     (never one per occurrence)
 *          ↓
 *   N canonical booking occurrences
 *
 * DESIGN CONSTRAINTS (deliberate):
 *  - The canonical Payment Service stays the owner of payment lifecycle,
 *    gateway lifecycle, webhook, confirmation, recovery and idempotency. This
 *    service never touches the gateway directly — it calls `paymentService.charge`.
 *  - The CLIENT never controls the total, the payment owner, the series
 *    reference, the currency, or the gateway amount. Every one of those is
 *    resolved server-side from persisted rows.
 *  - NO accounting, NO ledger, NO cash, NO refund, NO per-occurrence payment
 *    rows, NO allocation tables. R5-C owns series accounting/cash,
 *    R5-D owns refunds.
 */
import { getPool } from '../../../database/mysql.js';
import { paymentRepository } from '../../payment/infrastructure/repositories/payment.repository.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';
import { bookingSeriesRepository } from '../infrastructure/repositories/booking-series.repository.js';
import { PricingEngine } from '../domain/pricing-engine.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../../shared/errors/app-error.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { TimeEngine } from '../../time/index.js';
import type { Command } from '../../../shared/command/command-base.js';
import { commandPipeline } from '../../../shared/command/command-pipeline.js';
import { confirmBookingHandler } from '../commands/confirm-booking.command.js';
import { cancelBookingHandler } from '../commands/cancel-booking.command.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
// NOTE: `booking.service.js` is imported DYNAMICALLY inside
// `assertSeriesPaymentAuthority` (below) rather than statically. `booking.service`
// needs `loadSeriesPayment` from this module for the authoritative series read,
// so a static import here would create a module-initialisation cycle. The
// dynamic import also matches the existing convention in booking.service.ts.

const log = createModuleLogger('recurring-payment');

/** R5-B — the single canonical payment reference type for a recurring series. */
export const SERIES_PAYMENT_REFERENCE_TYPE = 'booking_series';

/** R5-B — card only. Cash/series accounting is R5-C. */
export const SERIES_PAYMENT_METHOD = 'card' as const;

/** Canonical platform currency (matches the single-booking card path). */
export const SERIES_PAYMENT_CURRENCY = 'EGP';

/**
 * R5-B — terminal booking states. Mirrors the R4 `cancelRecurringSeries`
 * TERMINAL set so a series payment failure can never rewrite a completed /
 * no-show / already-cancelled / expired occurrence.
 */
export const SERIES_TERMINAL_BOOKING_STATUSES = new Set(['cancelled', 'expired', 'no_show', 'completed']);

/** States an occurrence can be confirmed FROM by a series payment success. */
export const SERIES_CONFIRMABLE_BOOKING_STATUSES = new Set(['pending', 'pending_payment']);

/** Series statuses that accept a NEW payment attempt. */
const SERIES_PAYMENT_BLOCKED_STATUSES = new Set(['cancelled', 'completed']);

/** Payment states that mean the money already moved. */
const PAYMENT_FINAL_STATES = new Set(['paid', 'failed', 'cancelled', 'expired', 'refunded']);

/**
 * R5-B — deterministic, series-scoped payment idempotency key.
 *
 * Reusing the EXISTING `payment_transactions.idempotency_key` (UNIQUE, varchar(64))
 * — no second idempotency table. The key is a pure function of the series id, so
 * ANY retry for the same intended series payment converges on the same row and
 * therefore the same gateway transaction. Length is bounded well under 64.
 */
export function seriesPaymentIdempotencyKey(seriesId: number): string {
  return `series-card-${seriesId}`;
}

/** Read `start_at_utc` (MySQL timestamp | ISO string | Date) as epoch ms. */
function startMsOf(occ: any): number | null {
  const raw = occ?.start_at_utc;
  if (raw == null) return null;
  if (raw instanceof Date) return raw.getTime();
  const str = String(raw);
  const ms = new Date(str.includes('T') ? str : str.replace(' ', 'T') + 'Z').getTime();
  return Number.isFinite(ms) ? ms : null;
}

export interface SeriesPaymentSummary {
  paymentId: number | null;
  status: string | null;
  amount: number;
  currency: string;
  paymentMethod: string | null;
  gatewayProvider: string | null;
  gatewayReference: string | null;
  /** R5-D1 — null until the gateway settlement rail settles this payment. */
  gatewaySettlementId: number | null;
  paidAt: string | null;
  createdAt: string | null;
}

/** Read-only view of the single series payment row (never creates anything). */
export async function loadSeriesPayment(seriesId: number): Promise<SeriesPaymentSummary> {
  const row = await paymentRepository.findByReference(SERIES_PAYMENT_REFERENCE_TYPE, seriesId);
  if (!row) {
    return {
      paymentId: null, status: null, amount: 0, currency: SERIES_PAYMENT_CURRENCY,
      paymentMethod: null, gatewayProvider: null, gatewayReference: null,
      gatewaySettlementId: null, paidAt: null, createdAt: null,
    };
  }
  return {
    paymentId: Number(row.id),
    status: row.payment_status,
    amount: Number(row.amount || 0),
    currency: row.currency || SERIES_PAYMENT_CURRENCY,
    paymentMethod: row.payment_method,
    gatewayProvider: row.gateway_provider,
    gatewayReference: row.gateway_reference,
    gatewaySettlementId: row.gateway_settlement_id != null ? Number(row.gateway_settlement_id) : null,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

export interface SeriesPaymentContext {
  seriesId: number;
  organisationId: number;
  branchId: number;
  seriesStatus: string;
  /** The PLAYER (booking owner / beneficiary). Never the operator. */
  playerUserId: number;
  occurrenceCount: number;
  /**
   * AUTHORITATIVE pre-tax series subtotal = Σ persisted `bookings.total_amount`.
   * Kept for backward compatibility (R5-A/R5-B consumers); semantically the
   * PRE-TAX subtotal — never the amount charged.
   */
  seriesTotal: number;
  /** R5-C1 — authoritative pre-tax subtotal = seriesTotal (aliased for clarity). */
  seriesSubtotal: number;
  /**
   * R5-C1 — authoritative series tax = Σ of the ALREADY-rounded persisted
   * occurrence `tax_amount` snapshots. Deliberately NOT recomputed from the
   * aggregate net (preserves the exact economics of paying each occurrence).
   */
  seriesTax: number;
  /** R5-C1 — authoritative gross = round2(seriesSubtotal + seriesTax). THE amount charged. */
  seriesGross: number;
  currency: string;
  occurrences: any[];
}

/**
 * Load the persisted series + its occurrences and compute the authoritative
 * totals. Everything derives ONLY from persisted `bookings.total_amount` and
 * `bookings.tax_amount` snapshots written by R5-A, aggregated through the
 * canonical `PricingEngine.sumOccurrenceTotals` (one 2dp round, no float
 * accumulation) — never from a client value, and never recomputed from an
 * aggregate (no recurring tax engine).
 */
export async function loadSeriesPaymentContext(seriesId: number): Promise<SeriesPaymentContext> {
  const series = await bookingSeriesRepository.findById(seriesId);
  if (!series) throw new NotFoundError('Recurring series');

  const occurrences = await bookingRepository.findBySeries(seriesId);
  if (!occurrences.length) {
    throw new ConflictError('Recurring series has no occurrence bookings — nothing to pay for');
  }

  // The player is the occurrence owner. Defensive: every occurrence of a series
  // must belong to the same player, otherwise the series total would be charged
  // to an ambiguous owner.
  const playerUserId = Number((occurrences[0] as any).user_id);
  const mixed = occurrences.some((o: any) => Number(o.user_id) !== playerUserId);
  if (mixed) {
    log.error({ seriesId }, 'Series occurrences have mixed owners — refusing to charge');
    throw new ConflictError('Recurring series occurrences have inconsistent players — cannot charge a single payment');
  }

  // R5-C1 — authoritative series economics from the persisted snapshots.
  //   subtotal_i = bookings.total_amount (pre-tax court price)
  //   tax_i      = bookings.tax_amount    (already 2dp, per occurrence)
  //   gross_i    = round2(subtotal_i + tax_i)
  // Series (the money the player actually pays):
  //   seriesSubtotal = Σ subtotal_i
  //   seriesTax      = Σ tax_i                 — SUM of the persisted values,
  //                                              never round(aggregateNet × rate)
  //   seriesGross    = round2(subtotal + tax)  — THE amount charged.
  const seriesSubtotal = PricingEngine.sumOccurrenceTotals(
    occurrences.map((o: any) => Number(o.total_amount || 0)),
  );
  const seriesTax = PricingEngine.sumOccurrenceTotals(
    occurrences.map((o: any) => Number(o.tax_amount || 0)),
  );
  const seriesGross = Math.round((seriesSubtotal + seriesTax) * 100) / 100;
  if (!(seriesGross > 0)) {
    throw new ConflictError('Recurring series gross amount is zero — nothing to charge');
  }

  return {
    seriesId: series.id,
    organisationId: series.organisationId,
    branchId: series.branchId,
    seriesStatus: series.status,
    playerUserId,
    occurrenceCount: occurrences.length,
    // Backward-compat view of the subtotal — never the amount charged.
    seriesTotal: seriesSubtotal,
    seriesSubtotal,
    seriesTax,
    seriesGross,
    currency: SERIES_PAYMENT_CURRENCY,
    occurrences,
  };
}

/**
 * R5-B — tenant + operator authorization for acting on a series payment.
 *
 * Two independent checks (defense in depth):
 *  1. the R3/R4 responsible-user model (`canBypassPlayerBookingWindow`), and
 *  2. explicit organisation access (platform admin OR org member) so a
 *     platform-level operator permission alone cannot reach another tenant's or
 *     another branch's series. Mirrors the R2 `listRecurringSeries` isolation
 *     model, using the canonical `canAccessBranch` helper so a legitimately
 *     branch-scoped operator is not locked out.
 *
 * The OPERATOR is never the payment owner — see `initiateSeriesCardPayment`.
 */
export async function assertSeriesPaymentAuthority(operatorId: number, ctx: SeriesPaymentContext): Promise<void> {
  const { bookingService } = await import('./booking.service.js');
  if (!(await bookingService.canBypassPlayerBookingWindow(operatorId))) {
    throw new ForbiddenError('Only authorised responsible users can operate recurring series payments');
  }
  // Tenant + branch isolation. `canAccessBranch` is the canonical helper: it
  // grants access to the org owner, a platform admin, ANY org-scoped operator
  // (across all of that org's branches) and a branch-scoped operator for exactly
  // that branch. Using it (rather than org access alone) keeps a legitimately
  // branch-scoped operator working while still refusing every operator outside
  // the series' organisation/branch. The branch id comes from the PERSISTED
  // series row, never from the request.
  const { isPlatformAdmin, canAccessBranch } = await import('../../../shared/middleware/org-access.js');
  if (!(await isPlatformAdmin(operatorId)) && !(await canAccessBranch(operatorId, ctx.branchId))) {
    throw new ForbiddenError('Not authorized to operate payments for this recurring series');
  }
}

export interface InitiateSeriesPaymentResult {
  seriesId: number;
  paymentId: number;
  /** PLAYER owns the payment — returned explicitly so the UI can prove it. */
  playerUserId: number;
  operatorId: number;
  occurrenceCount: number;
  /**
   * AUTHORITATIVE pre-tax series subtotal. Retained for backward compatibility
   * with R5-B consumers — it is the subtotal, never the amount charged.
   */
  seriesTotal: number;
  /** R5-C1 — authoritative pre-tax subtotal (alias of seriesTotal). */
  seriesSubtotal: number;
  /** R5-C1 — authoritative tax (Σ persisted occurrence tax_amount). */
  seriesTax: number;
  /** R5-C1 — authoritative gross. THE amount submitted to the gateway. */
  seriesGross: number;
  currency: string;
  paymentMethod: typeof SERIES_PAYMENT_METHOD;
  referenceType: typeof SERIES_PAYMENT_REFERENCE_TYPE;
  referenceId: number;
  idempotencyKey: string;
  status: string;
  paymentUrl: string | null;
  clientSecret: string | null;
  /** True when an existing payment was reused instead of creating a new one. */
  alreadyCharged: boolean;
}

/**
 * R5-B — initiate (or idempotently re-resolve) the ONE card payment for a
 * recurring series. The client sends NOTHING but the series id (and an optional
 * return URL); the amount, owner, reference, currency and method are all
 * resolved here from persisted state.
 *
 * Idempotency boundary: the deterministic `series-card-<seriesId>` key. Before
 * touching the Payment Service we inspect the existing row so a retry can NEVER
 * produce a second gateway transaction:
 *   paid                        → return the same payment (already settled)
 *   created/pending/processing  → return the same payment, NO new gateway call
 *   failed/cancelled/expired/…  → 409 (terminal; re-charge is R5-D, and a new
 *                                 key would violate the one-payment invariant)
 *   absent                      → charge through the canonical Payment Service
 */
export async function initiateSeriesCardPayment(
  seriesId: number,
  operatorId: number,
  returnUrl?: string,
): Promise<InitiateSeriesPaymentResult> {
  const ctx = await loadSeriesPaymentContext(seriesId);
  await assertSeriesPaymentAuthority(operatorId, ctx);

  if (SERIES_PAYMENT_BLOCKED_STATUSES.has(ctx.seriesStatus)) {
    throw new ConflictError(`Recurring series is ${ctx.seriesStatus} — card payment is not available`);
  }

  const idempotencyKey = seriesPaymentIdempotencyKey(seriesId);

  const buildResult = (paymentId: number, status: string, paymentUrl: string | null, clientSecret: string | null, alreadyCharged: boolean): InitiateSeriesPaymentResult => ({
    seriesId: ctx.seriesId,
    paymentId,
    playerUserId: ctx.playerUserId,
    operatorId,
    occurrenceCount: ctx.occurrenceCount,
    seriesTotal: ctx.seriesTotal,       // == seriesSubtotal (pre-tax)
    seriesSubtotal: ctx.seriesSubtotal,
    seriesTax: ctx.seriesTax,
    seriesGross: ctx.seriesGross,
    currency: ctx.currency,
    paymentMethod: SERIES_PAYMENT_METHOD,
    referenceType: SERIES_PAYMENT_REFERENCE_TYPE,
    referenceId: ctx.seriesId,
    idempotencyKey,
    status,
    paymentUrl,
    clientSecret,
    alreadyCharged,
  });

  // ── Idempotency: converge on the existing payment, never create a second one ──
  const existing = await paymentRepository.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    const existingStatus = String(existing.payment_status);
    if (existingStatus === 'paid') {
      log.info({ seriesId, paymentId: existing.id }, 'Series payment already paid — idempotent reuse');
      return buildResult(Number(existing.id), 'paid', null, null, true);
    }
    if (existingStatus === 'created' || existingStatus === 'pending' || existingStatus === 'processing') {
      // The gateway session already exists. Re-charging would create a SECOND
      // gateway transaction for the same series money, which R5-B forbids.
      log.info({ seriesId, paymentId: existing.id, status: existingStatus }, 'Series payment already in flight — idempotent reuse (no second gateway call)');
      return buildResult(Number(existing.id), existingStatus, null, null, true);
    }
    if (PAYMENT_FINAL_STATES.has(existingStatus)) {
      log.warn({ seriesId, paymentId: existing.id, status: existingStatus }, 'Series payment is in a terminal state — refusing to create a second payment');
      throw new ConflictError(
        `This series already has a ${existingStatus} payment (#${existing.id}). A recurring series accepts exactly one payment; refunds and re-charging are handled separately.`,
      );
    }
    log.warn({ seriesId, paymentId: existing.id, status: existingStatus }, 'Series payment in an unexpected state — refusing to create a second payment');
    throw new ConflictError(`Existing series payment #${existing.id} is in state "${existingStatus}" — manual reconciliation required`);
  }

  // ── Player details for the gateway (resolved server-side) ──
  const pool = getPool();
  const [userRows] = await pool.execute<any[]>(
    'SELECT full_name, email, full_phone FROM users WHERE id = ? LIMIT 1',
    [ctx.playerUserId],
  );
  const user: any = (userRows as any[])[0] || {};

  // ── ONE gateway transaction for the whole series GROSS amount ──
  // R5-C1 — the customer pays `seriesGross` (subtotal + tax), exactly what they
  // would have paid if each occurrence had been charged individually. The
  // gateway NEVER sees per-occurrence subtotals or a client-supplied amount.
  const { paymentService } = await import('../../payment/application/payment.service.js');
  const result = await paymentService.charge(ctx.playerUserId, {
    referenceType: SERIES_PAYMENT_REFERENCE_TYPE,
    referenceId: ctx.seriesId,
    amount: ctx.seriesGross,              // authoritative GROSS (incl. tax)
    currency: ctx.currency,               // canonical
    paymentMethod: SERIES_PAYMENT_METHOD, // card
    returnUrl,
    customerName: user?.full_name,
    customerPhone: user?.full_phone,
    customerEmail: user?.email,
    idempotencyKey,
  });

  if (!result.success) {
    log.error({ seriesId, error: (result as any).errorMessage }, 'Series card payment charge failed');
    throw new ConflictError((result as any).errorMessage || 'Could not initiate payment for this recurring series');
  }
  if (!result.paymentId) {
    throw new ConflictError('Payment could not be created for this recurring series');
  }

  log.info(
    { seriesId, paymentId: result.paymentId, playerId: ctx.playerUserId, operatorId, amount: ctx.seriesGross, subtotal: ctx.seriesSubtotal, tax: ctx.seriesTax, occurrences: ctx.occurrenceCount },
    'Series card payment initiated — ONE payment row, ONE gateway transaction (gross incl. tax)',
  );

  return buildResult(
    result.paymentId,
    result.status || 'pending',
    // `charge()` is a union across the wallet / gateway / CQRS paths. Card is
    // routed to `chargeByGateway`, the only branch that returns a checkout URL
    // and client secret, so read them defensively.
    (result as any).paymentUrl ?? null,
    (result as any).clientSecret ?? null,
    false,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// R5-B — series-aware occurrence eligibility (single source of truth)
// ─────────────────────────────────────────────────────────────────────────────

export interface OccurrenceOutcome {
  bookingId: number;
  outcome: 'applied' | 'skipped';
  reason?: string;
}

/**
 * R5-B — occurrences a series payment SUCCESS may confirm.
 *
 * Eligible = belongs to this series (guaranteed by the caller), currently
 * pending / pending_payment, not cancelled / completed / expired / no_show,
 * and not already paid. Already-confirmed occurrences are skipped so a replayed
 * `payment:succeeded` never reconfirms or duplicates a financial event.
 */
export function isOccurrenceConfirmable(occ: any): { eligible: boolean; reason?: string } {
  const status = String(occ?.booking_status || '');
  if (SERIES_TERMINAL_BOOKING_STATUSES.has(status)) return { eligible: false, reason: `terminal_${status}` };
  if (status === 'confirmed') return { eligible: false, reason: 'already_confirmed' };
  if (status === 'checked_in') return { eligible: false, reason: 'already_checked_in' };
  if (!SERIES_CONFIRMABLE_BOOKING_STATUSES.has(status)) return { eligible: false, reason: `unexpected_${status}` };
  if (String(occ?.payment_status || '') === 'paid') return { eligible: false, reason: 'already_paid' };
  return { eligible: true };
}

/**
 * R5-B — occurrences a series payment FAILURE / CANCEL / EXPIRY may cancel.
 *
 * This is exactly the R4 `cancelRecurringSeries` rule: future, non-terminal
 * occurrences only. Completed, past, already-cancelled and no-show occurrences
 * are never rewritten, and already-paid occurrences are never cancelled.
 */
export function isOccurrenceCancellable(occ: any, nowMs: number): { eligible: boolean; reason?: string } {
  const status = String(occ?.booking_status || '');
  if (SERIES_TERMINAL_BOOKING_STATUSES.has(status)) return { eligible: false, reason: `already_${status}` };
  const startMs = startMsOf(occ);
  if (startMs == null) return { eligible: false, reason: 'no_start_time' };
  if (startMs <= nowMs) return { eligible: false, reason: 'past_or_not_yet_started' };
  if (String(occ?.payment_status || '') === 'paid') return { eligible: false, reason: 'already_paid' };
  return { eligible: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// R5-C4 — ONE operator-confirmed series CASH payment.
//
// Normal Cash has NO payment_transactions row: the canonical source of truth is
// bookings.payment_status + booking:paid. A recurring series paid in Cash
// follows the SAME contract: one responsible operator confirms receipt of the
// full authoritative seriesGross; every eligible occurrence is transitioned
// through the canonical ConfirmBooking command (paymentStatus 'paid'),
// per-occurrence booking:confirmed/booking:paid fire (entitlements + realtime +
// notifications), and ONE series-level Cash accounting posting is created.
//
// Exactly like R5-B's card success, the occurrence-level econ.seriesId guard
// keeps per-occurrence booking:paid a financial no-op; series Cash accounting
// posts once via hasPosting('booking', seriesId, event_type).
// ─────────────────────────────────────────────────────────────────────────────

export interface ConfirmSeriesCashResult {
  seriesId: number;
  /** The PLAYER (booking owner / beneficiary) — the money is theirs. */
  playerId: number;
  seriesSubtotal: number;
  seriesTax: number;
  seriesGross: number;
  currency: string;
  occurrenceCount: number;
  confirmedOccurrenceIds: number[];
  skippedOccurrenceIds: Array<{ bookingId: number; reason: string }>;
  status: string;
  alreadyConfirmed: boolean;
}

function newCommandId(type: string): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function confirmSeriesCash(seriesId: number, operatorId: number): Promise<ConfirmSeriesCashResult> {
  const ctx = await loadSeriesPaymentContext(seriesId);
  await assertSeriesPaymentAuthority(operatorId, ctx);

  if (SERIES_PAYMENT_BLOCKED_STATUSES.has(ctx.seriesStatus)) {
    throw new ConflictError(`Recurring series is ${ctx.seriesStatus} — cash payment is not available`);
  }

  const confirmed: number[] = [];
  const skipped: Array<{ bookingId: number; reason: string }> = [];

  // 1. Stamp the cash method on the ELIGIBLE occurrences BEFORE any canonical
  //    confirmation runs, so the ConfirmBooking command and every booking:
  //    confirmed consumer (entitlement listener reads bookings.payment_method
  //    → collector 'org' for cash) observe the correct method. No
  //    payment_transactions row is created.
  const eligibleIds = ctx.occurrences
    .filter((o: any) => isOccurrenceConfirmable(o).eligible)
    .map((o: any) => Number(o.id));
  if (eligibleIds.length) {
    await getPool().execute(`UPDATE bookings SET payment_method = 'cash' WHERE id IN (${eligibleIds.join(',')})`, []);
  }

  // 2. Confirm every ELIGIBLE occurrence through the canonical ConfirmBooking
  //    command (already-confirmed/paid/terminal occurrences are skipped — R4
  //    eligible-only; cancelled occurrences are NEVER rewritten).
  for (const occ of ctx.occurrences) {
    const bookingId = Number(occ.id);
    const eligibility = isOccurrenceConfirmable(occ);
    if (!eligibility.eligible) {
      skipped.push({ bookingId, reason: eligibility.reason ?? 'ineligible' });
      continue;
    }
    try {
      const confirmCommand: Command = {
        commandId: newCommandId('ConfirmBooking'),
        commandType: 'ConfirmBooking',
        aggregateType: 'booking',
        aggregateId: String(bookingId),
        // 'paid' is applied atomically with the transition.
        payload: { bookingId, paymentStatus: 'paid' },
        correlationId: `corr_${Date.now()}`,
      };
      const confirmResult = await commandPipeline.execute(confirmCommand, {
        validate: async () => confirmBookingHandler.validate(confirmCommand),
        execute: async (cmd, conn) => confirmBookingHandler.execute(cmd, conn),
        events: (cmd, res) => confirmBookingHandler.events!(cmd, res),
      });
      if (confirmResult.status === 'error') {
        throw new Error(`ConfirmBooking failed: ${confirmResult.message}`);
      }
      confirmed.push(bookingId);
    } catch (err: any) {
      log.error({ err, seriesId, bookingId, operatorId }, 'Recurring series: cash confirm occurrence failed');
      skipped.push({ bookingId, reason: 'confirm_failed' });
    }
  }

  // 3. Canonical per-occurrence realtime/notification events (financial no-op
  //    via the seriesId guard). Reuses the exact R5-B producer shape.
  for (const bookingId of confirmed) {
    const occ = ctx.occurrences.find((o: any) => Number(o.id) === bookingId);
    if (!occ) continue;
    eventBusV2.emit('booking:paid', {
      bookingId,
      userId: occ.user_id,
      organisationId: occ.organisation_id || undefined,
      branchId: occ.branch_id || undefined,
      resourceId: occ.resource_id || undefined,
      courtId: occ.resource_id || undefined,
      paymentMethod: 'cash',
      grossAmount: Number(occ.total_amount || 0),
      taxAmount: Number(occ.tax_amount || 0),
      coachAmount: Number(occ.coach_amount || 0),
      organisationAmount: Number(occ.club_amount || 0),
      commissionAmount: Number(occ.commission_amount || 0),
      currency: 'EGP',
      sourceId: bookingId,
      seriesId,
      seriesCashConfirmed: true,
    } as any);
  }

  // 4. ONE series-level Cash accounting recognition. If it fails we surface the
  //    error loudly rather than leaving the series financially unposted; the
  //    accounting itself is hasPosting-idempotent so a retry converges.
  const { postSeriesCashAccounting } = await import('../../financial/application/accounting-event.listener.js');
  await postSeriesCashAccounting(seriesId, SERIES_PAYMENT_CURRENCY);

  log.info(
    { seriesId, operatorId, amount: ctx.seriesGross, subtotal: ctx.seriesSubtotal, tax: ctx.seriesTax, confirmed: confirmed.length, skipped: skipped.length },
    'Recurring series cash confirmed — ONE operator action, ONE series-level recognition',
  );

  return {
    seriesId,
    playerId: ctx.playerUserId,
    seriesSubtotal: ctx.seriesSubtotal,
    seriesTax: ctx.seriesTax,
    seriesGross: ctx.seriesGross,
    currency: ctx.currency,
    occurrenceCount: ctx.occurrenceCount,
    confirmedOccurrenceIds: confirmed,
    skippedOccurrenceIds: skipped,
    status: 'paid',
    alreadyConfirmed: confirmed.length === 0,
  };
}

/** Canonical "now" so tests can freeze time. */
export function seriesNowMs(): number {
  return new Date(TimeEngine.now()).getTime();
}

// ─────────────────────────────────────────────────────────────────────────────
// R5-D1 — FULL recurring series CARD refund.
//
// Reuses the canonical PaymentService.refund() lifecycle (gateway refund +
// status transition + T1/T2/T3 idempotency). Once the canonical
// `payment:refunded` event fires, the accounting listener reverses the R5-C2
// series recognition exactly once, every occurrence entitlement is cancelled
// through the canonical entitlement service, and the eligible occurrences are
// cancelled via the canonical CancelBooking command.
//
// STRICT ELIGIBILITY (R5-D1):
//   - tenant/org/branch authority (same as every responsible recurring action)
//   - series not cancelled/completed
//   - a booking_series Card payment exists, payment_status='paid',
//     amount === seriesGross, booking_id NULL
//   - NOT already gateway-settled (post-settlement refund is BLOCKED)
//   - no prior series refund
//   - series accounting recognition exists (booking_series_card_payment posted)
//   - NO completed occurrence and NO prior occurrence cancellation — a full
//     series refund may not overlap ambiguous partial state (occurrence-level
//     refund is blocked by the absent allocation model). Any such series is
//     REJECTED with a clear domain error; nothing is partially refunded.
//
// NO payment amount is accepted from the client: seriesGross is authoritative.
// ─────────────────────────────────────────────────────────────────────────────

export interface RefundSeriesCardResult {
  seriesId: number;
  playerId: number;
  paymentId: number;
  seriesSubtotal: number;
  seriesTax: number;
  seriesGross: number;
  currency: string;
  occurrenceCount: number;
  affectedOccurrenceIds: number[];
  refundStatus: string;
  alreadyRefunded: boolean;
}

export async function refundSeriesCard(seriesId: number, operatorId: number): Promise<RefundSeriesCardResult> {
  const ctx = await loadSeriesPaymentContext(seriesId);
  await assertSeriesPaymentAuthority(operatorId, ctx);

  if (SERIES_PAYMENT_BLOCKED_STATUSES.has(ctx.seriesStatus)) {
    throw new ConflictError(`Recurring series is ${ctx.seriesStatus} — full-series card refund is not available`);
  }

  // Authoritative series payment state.
  const payment = await paymentRepository.findByReference(SERIES_PAYMENT_REFERENCE_TYPE, seriesId);
  if (!payment) {
    throw new ConflictError('Recurring series has no card payment to refund');
  }
  const paymentId = Number(payment.id);
  const paymentStatus = String(payment.payment_status);

  // Already refunded → idempotent, no gateway call.
  if (paymentStatus === 'refunded') {
    log.info({ seriesId, paymentId }, 'Series card payment already refunded — idempotent result');
    return {
      seriesId, playerId: ctx.playerUserId, paymentId,
      seriesSubtotal: ctx.seriesSubtotal, seriesTax: ctx.seriesTax, seriesGross: ctx.seriesGross,
      currency: ctx.currency, occurrenceCount: ctx.occurrenceCount,
      affectedOccurrenceIds: ctx.occurrences.map((o: any) => Number(o.id)),
      refundStatus: 'refunded', alreadyRefunded: true,
    };
  }
  if (paymentStatus !== 'paid') {
    throw new ConflictError(`Series card payment is ${paymentStatus} — only 'paid' payments can be refunded`);
  }

  // R5-D1 strict guards.
  if (payment.gateway_settlement_id != null && Number(payment.gateway_settlement_id) !== 0) {
    throw new ConflictError('This series payment has already been gateway-settled — post-settlement refunds are not supported (R5-D1).');
  }
  const charged = Number(payment.amount || 0);
  if (Math.abs(charged - ctx.seriesGross) >= 0.01) {
    throw new ConflictError(`Series payment amount ${charged} does not match the authoritative seriesGross ${ctx.seriesGross} — refund blocked`);
  }

  // Series accounting recognition must exist (R5-C2 posted the card recognition).
  const { ledgerRepository } = await import('../../financial/infrastructure/repositories/ledger.repository.js');
  if (!(await ledgerRepository.hasPosting('booking', seriesId, 'booking_series_card_payment'))) {
    throw new ConflictError('Series card accounting recognition is missing — cannot refund a financially inconsistent series');
  }

  // Conservative full-series guard: NO completed occurrence and NO prior
  // occurrence cancellation (occurrence/partial refund is blocked by the
  // absent allocation model; a full refund overlapping such state is rejected).
  const SERIES_TERMINAL = new Set(['cancelled', 'completed', 'no_show', 'expired']);
  for (const occ of ctx.occurrences) {
    if (SERIES_TERMINAL.has(String(occ.booking_status))) {
      throw new ConflictError(
        `Full-series card refund blocked: occurrence #${occ.id} is '${occ.booking_status}'. Occurrence-level refunds require an allocation model (not supported in R5-D1).`,
      );
    }
  }

  // 1. Refund through the CANONICAL Payment Service (owns the status change,
  //    the gateway call and the refund idempotency). No direct gateway call.
  const { paymentService } = await import('../../payment/application/payment.service.js');
  const result = await paymentService.refund(paymentId, ctx.seriesGross, 'Full recurring series card refund');
  if (!result?.success) {
    throw new Error(`Series card refund failed: ${(result as any)?.errorMessage || 'unknown error'}`);
  }

  log.info({ seriesId, paymentId, operatorId, amount: ctx.seriesGross }, 'Series card refund executed via canonical Payment Service');

  // 2. Cancel EVERY occurrence entitlement through the canonical service. The
  //    payment:refunded event (async) triggers the series accounting reversal
  //    in the listener; occurrence entitlements are cancelled here explicitly
  //    (per-occurrence booking:refunded is NO-OP for series occurrences).
  const { financialEntitlementService } = await import('../../financial/application/financial-entitlement.service.js');
  const affectedIds: number[] = [];
  for (const occ of ctx.occurrences) {
    const bookingId = Number(occ.id);
    affectedIds.push(bookingId);
    await financialEntitlementService.cancelBySource('booking', bookingId, `Recurring series #${seriesId} full refund`);
  }

  // 3. Cancel every occurrence through the canonical CancelBooking command
  //    (future, non-terminal only — eligibility already rejected any
  //    terminal/partial state, so every occurrence here can be cancelled).
  const cancelResults: number[] = [];
  for (const occ of ctx.occurrences) {
    const bookingId = Number(occ.id);
    try {
      const cancelCommand: Command = {
        commandId: newCommandId('CancelBooking'),
        commandType: 'CancelBooking',
        aggregateType: 'booking',
        aggregateId: String(bookingId),
        payload: { bookingId, reason: 'series_full_refund', actorId: operatorId },
        correlationId: `corr_${Date.now()}`,
      };
      const res = await commandPipeline.execute(cancelCommand, {
        validate: async () => cancelBookingHandler.validate(cancelCommand),
        execute: async (cmd, conn) => cancelBookingHandler.execute(cmd, conn),
        events: (cmd, res) => cancelBookingHandler.events!(cmd, res),
      });
      if (res.status !== 'error') cancelResults.push(bookingId);
    } catch (err: any) {
      log.warn({ err, seriesId, bookingId }, 'Series refund: occurrence cancellation skipped');
    }
  }

  return {
    seriesId,
    playerId: ctx.playerUserId,
    paymentId,
    seriesSubtotal: ctx.seriesSubtotal,
    seriesTax: ctx.seriesTax,
    seriesGross: ctx.seriesGross,
    currency: ctx.currency,
    occurrenceCount: ctx.occurrenceCount,
    affectedOccurrenceIds: affectedIds,
    refundStatus: 'refunded',
    alreadyRefunded: false,
  };
}

/** Audit-friendly shape of the outcome list. */
export function summariseOutcomes(outcomes: OccurrenceOutcome[]) {
  return {
    applied: outcomes.filter((o) => o.outcome === 'applied').map((o) => o.bookingId),
    skipped: outcomes.filter((o) => o.outcome === 'skipped').map((o) => ({ bookingId: o.bookingId, reason: o.reason })),
  };
}
