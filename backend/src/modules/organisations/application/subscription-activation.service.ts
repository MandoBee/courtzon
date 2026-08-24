import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { ValidationError } from '../../../shared/errors/app-error.js';
import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { transactionRepository } from '../../financial/infrastructure/transaction.repository.js';
import { recordAudit } from '../../audit-log/index.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { clearSubscriptionCache } from './current-subscription.service.js';

const log = createModuleLogger('subscription-activation');

type RowData = mysql.RowDataPacket[];

export interface ActivateRequestOptions {
  adminId?: number | null;
  approvalNotes?: string;
}

export interface ActivationResult {
  activated: boolean;
  alreadyProcessed?: boolean;
  deferred?: 'org-inactive' | 'payment' | 'conflict' | 'invalid';
  reason?: string;
  requestId: number;
  organisationId: number;
  requestType?: string | null;
  requestedPlanName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  /** True when this activation also flipped the organisation to verified+active (registration requests only). */
  organisationActivated?: boolean;
  /** True when an already-approved request was missing its cash posting and one was back-filled through the canonical engine. */
  accountingBackfilled?: boolean;
  // snake_case aliases preserved for existing admin controllers / audit consumers
  organisation_id?: number;
  request_type?: string | null;
  requested_plan_name?: string | null;
}

export interface WriteActiveSubscriptionInput {
  conn: mysql.PoolConnection;
  orgId: number;
  planId: number;
  billingCycle: string;
  planSnapshot: string;
  isUnlimited: boolean;
  /** 'RENEWAL' creates the NEXT period row chained from the previous period's end_date. */
  requestType?: string | null;
  /** Keep existing start/end dates unchanged (e.g. resume after suspension). */
  keepDates?: boolean;
}

/**
 * Add months to a date, clamping to the last valid day of the target month
 * (Jan 31 + 1 month = Feb 28/29, never Mar 2).
 */
export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const daysInTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), daysInTargetMonth));
  // Preserve time-of-day from the source date for same-day comparisons
  target.setHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
  return target;
}

function toSqlDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Resolve the entitlement period length of a plan in whole months.
 *   - Unlimited plans: null (no expiry).
 *   - Explicit duration_months (admin-managed, 1..12): used as-is.
 *   - Legacy rows without duration: derived from billing_cycle (monthly=1, yearly=12)
 *     so pre-existing plans keep their exact current behavior.
 */
export async function resolvePlanPeriodMonths(
  conn: mysql.PoolConnection,
  planId: number,
  billingCycle: string,
): Promise<number | null> {
  const [rows] = await conn.execute<RowData>(
    'SELECT is_unlimited, duration_months FROM subscription_plans WHERE id = ?',
    [planId],
  );
  if (!rows.length) return billingCycle === 'yearly' ? 12 : 1;
  const p = rows[0] as any;
  if (p.is_unlimited) return null;
  if (p.duration_months != null) return Number(p.duration_months);
  return billingCycle === 'yearly' ? 12 : 1;
}

/**
 * SINGLE authoritative writer of `subscription_status = 'active'|'pending'`, `start_date`
 * and `end_date` on `organisation_subscriptions`. Every activation path (payment, admin
 * approval, free plans, direct admin assignment, resume) MUST go through here so that:
 *   - renewals create the NEXT period row chained from the previous period's end_date
 *     (+1 day), never from the payment/approval date — history is preserved per period;
 *   - no automatic renewal exists: auto_renew is always written FALSE;
 *   - expired / new subscriptions start a fresh period from the activation date;
 *   - no other code can flip a subscription active or rewrite its period.
 */
export async function writeActiveSubscription(input: WriteActiveSubscriptionInput): Promise<{
  startDate: string | null;
  endDate: string | null;
  /** Effective status written for this period: 'active' or — for a scheduled future renewal — 'pending'. */
  status: 'active' | 'pending';
  subscriptionId: number;
}> {
  const { conn, orgId, planId, billingCycle, planSnapshot, isUnlimited, requestType, keepDates } = input;

  const today = startOfDay(new Date());

  const [existingRows] = await conn.execute<RowData>(
    `SELECT id, start_date, end_date FROM organisation_subscriptions
     WHERE organisation_id = ? AND subscription_status IN ('pending', 'suspended', 'active')
     ORDER BY created_at DESC LIMIT 1`,
    [orgId],
  );
  const existing = existingRows[0] as any;

  // ── Renewal: chain the NEXT period from the previous period's end ──
  if (requestType === 'RENEWAL' && !keepDates) {
    // Edge case I — never two scheduled/overlapping periods: reject when a
    // future-dated renewal is already scheduled for this organisation.
    const [futureRows] = await conn.execute<RowData>(
      `SELECT id FROM organisation_subscriptions
       WHERE organisation_id = ? AND start_date > CURDATE()
         AND subscription_status IN ('pending', 'active')
       LIMIT 1`,
      [orgId],
    );
    if (futureRows.length) {
      throw new ValidationError('A renewal is already scheduled for this organisation');
    }

    // Continuity anchor: latest known period end across history. Cancelled
    // periods are excluded — a cancellation terminates the chain deliberately.
    const [anchorRows] = await conn.execute<RowData>(
      `SELECT MAX(end_date) AS prev_end FROM organisation_subscriptions
       WHERE organisation_id = ? AND end_date IS NOT NULL AND subscription_status <> 'cancelled'`,
      [orgId],
    );
    const prevEndRaw = (anchorRows[0] as any)?.prev_end ?? null;

    // Business rule: a renewal starts the day AFTER the previous subscription
    // ends, regardless of when payment/approval happens. First-ever period
    // (no anchor) starts on the activation day.
    let startDate: Date;
    if (prevEndRaw) {
      startDate = startOfDay(new Date(prevEndRaw));
      startDate.setDate(startDate.getDate() + 1);
    } else {
      startDate = today;
    }
    const months = isUnlimited ? null : await resolvePlanPeriodMonths(conn, planId, billingCycle);
    const endDate = months == null ? null : addMonths(startDate, months);
    const newStart = toSqlDate(startDate);
    const newEnd = endDate ? toSqlDate(endDate) : null;
    const newStatus = startDate.getTime() > today.getTime() ? 'pending' : 'active';

    const [result] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO organisation_subscriptions
        (organisation_id, plan_id, billing_cycle, subscription_status, start_date, end_date, plan_snapshot, auto_renew)
       VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)`,
      [orgId, planId, billingCycle, newStatus, newStart, newEnd, planSnapshot],
    );
    const newId = (result as any).insertId;

    if (newStatus === 'active') {
      // Close every earlier period so exactly one effective subscription remains.
      await conn.execute(
        `UPDATE organisation_subscriptions SET subscription_status = 'expired', updated_at = NOW()
         WHERE organisation_id = ? AND id <> ?
           AND subscription_status IN ('active', 'suspended', 'pending')`,
        [orgId, newId],
      );
    }

    return { startDate: newStart, endDate: newEnd, status: newStatus, subscriptionId: newId };
  }

  // ── Non-renewal paths (registration activation, plan change, admin assign,
  //    resume) — preserve the existing mutate-in-place semantics. ──
  let startDate: Date;
  let endDate: Date | null;

  if (keepDates && existing) {
    startDate = existing.start_date ? new Date(existing.start_date) : today;
    if (existing.end_date) {
      endDate = new Date(existing.end_date);
    } else if (isUnlimited) {
      endDate = null;
    } else {
      const months = await resolvePlanPeriodMonths(conn, planId, billingCycle);
      endDate = addMonths(startDate, months ?? 1);
    }
  } else {
    startDate = today;
    if (isUnlimited) {
      endDate = null;
    } else {
      const months = await resolvePlanPeriodMonths(conn, planId, billingCycle);
      endDate = addMonths(startDate, months ?? 1);
    }
  }

  const newStart = toSqlDate(startDate);
  const newEnd = endDate ? toSqlDate(endDate) : null;

  if (existing) {
    await conn.execute(
      `UPDATE organisation_subscriptions
       SET plan_id = ?, billing_cycle = ?, subscription_status = 'active',
           start_date = ?, end_date = ?, plan_snapshot = ?, auto_renew = FALSE, updated_at = NOW()
       WHERE id = ?`,
      [planId, billingCycle, newStart, newEnd, planSnapshot, existing.id],
    );
    return { startDate: newStart, endDate: newEnd, status: 'active', subscriptionId: existing.id };
  }

  const [result] = await conn.execute(
    `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, subscription_status, start_date, end_date, plan_snapshot, auto_renew)
     VALUES (?, ?, ?, 'active', ?, ?, ?, FALSE)`,
    [orgId, planId, billingCycle, newStart, newEnd, planSnapshot],
  );
  return { startDate: newStart, endDate: newEnd, status: 'active', subscriptionId: (result as any).insertId };
}

export async function buildPlanSnapshot(
  conn: mysql.PoolConnection,
  planId: number,
  billingCycle: string,
  fallbackName?: string | null,
): Promise<{ isUnlimited: boolean; snapshot: Record<string, unknown> }> {  const [planRows] = await conn.execute<RowData>(
    `SELECT sp.*, GROUP_CONCAT(DISTINCT JSON_OBJECT('feature_key', sf.feature_key, 'label', sf.label, 'value', spf.value, 'value_type', sf.value_type) SEPARATOR '||') as _features
     FROM subscription_plans sp
     LEFT JOIN subscription_plan_features spf ON spf.plan_id = sp.id
     LEFT JOIN subscription_features sf ON sf.id = spf.feature_id
     WHERE sp.id = ?
     GROUP BY sp.id`,
    [planId],
  );
  const planRow = planRows[0] as any;
  const features: any[] = [];
  if (planRow?._features) {
    for (const raw of String(planRow._features).split('||')) {
      try { features.push(JSON.parse(raw)); } catch { /* skip malformed row */ }
    }
  }

  const [rateRows] = await conn.execute<RowData>(
    'SELECT applicable_entity, amount, rate_type FROM subscription_plan_rates WHERE plan_id = ?',
    [planId],
  );

  const snapshot: Record<string, unknown> = {
    planName: planRow?.plan_name || fallbackName || 'Unknown',
    priceMonthly: planRow?.price_monthly ? Number(planRow.price_monthly) : null,
    priceYearly: planRow?.price_yearly ? Number(planRow.price_yearly) : null,
    isUnlimited: !!planRow?.is_unlimited,
    durationMonths: planRow?.duration_months != null ? Number(planRow.duration_months) : null,
    billingCycle,
    features,
    commissionRates: rateRows.map((r: any) => ({
      entity: r.applicable_entity,
      amount: Number(r.amount),
      rateType: r.rate_type,
    })),
  };

  return { isUnlimited: !!planRow?.is_unlimited, snapshot };
}

/** Paid iff a price is on the plan OR a requested price was recorded on the request. */
async function isPaidPlan(conn: mysql.PoolConnection, req: any): Promise<boolean> {
  if (Number(req.requested_price) > 0) return true;
  if (req.requested_plan_id) {
    const [planRows] = await conn.execute<RowData>(
      'SELECT is_unlimited, price_monthly, price_yearly FROM subscription_plans WHERE id = ?',
      [req.requested_plan_id],
    );
    const p = planRows[0] as any;
    if (p && !p.is_unlimited && (Number(p.price_monthly) > 0 || Number(p.price_yearly) > 0)) return true;
  }
  return false;
}

/**
 * Payment gate — returns true when payment for this request is satisfied:
 *   - Free plans: always satisfied.
 *   - Cash / bank transfer / unknown method: satisfied only when an admin explicitly approves
 *     (admin confirmation is the payment evidence for offline payments).
 *   - Card: satisfied when the linked payment_transactions row is 'paid'. If no transaction was
 *     ever created (gateway down / payment never initiated) an admin approval may decide it.
 *     A concrete pending/failed/cancelled transaction can never be overridden by an admin.
 */
async function isPaymentSatisfied(
  conn: mysql.PoolConnection,
  req: any,
  adminId: number | null,
): Promise<boolean> {
  if (!(await isPaidPlan(conn, req))) return true;
  const method = String(req.chosen_payment_method || '').trim().toLowerCase();
  if (method !== 'card') return adminId != null;

  const [txnRows] = await conn.execute<RowData>(
    `SELECT id, payment_status FROM payment_transactions
     WHERE reference_type = 'subscription' AND reference_id = ?
     ORDER BY id DESC LIMIT 1`,
    [req.id],
  );
  const txn = txnRows[0] as any;
  if (!txn) return adminId != null;
  return txn.payment_status === 'paid';
}

/**
 * Registration request types: the organisation is BORN is_active=FALSE/is_verified=FALSE
 * (auth.service) and the pending registration approval is its only blocking condition.
 * Activating such a request therefore also activates the organisation — in the same
 * transaction, regardless of which admin surface triggered it (Registrations page,
 * Subscription Management, "activate pending", or a card payment listener).
 */
const REGISTRATION_REQUEST_TYPES = new Set(['organization', 'seller']);

function baseResult(req: any, extras: Partial<Omit<ActivationResult, 'activated'>> = {}): ActivationResult {
  return {
    activated: false,
    requestId: req.id,
    organisationId: req.organisation_id,
    requestType: req.request_type ?? null,
    requestedPlanName: req.requested_plan_name ?? null,
    organisation_id: req.organisation_id,
    request_type: req.request_type ?? null,
    requested_plan_name: req.requested_plan_name ?? null,
    ...extras,
  };
}

/**
 * Cash amount for the accounting posting: prefer the explicit requested_price
 * captured at creation time; fall back to the requested plan's price for legacy
 * rows created before registration flows persisted prices (their
 * requested_price is NULL, which must NOT silently skip the posting).
 */
async function resolveRequestAmount(
  executor: mysql.Pool | mysql.PoolConnection,
  req: any,
): Promise<number> {
  const direct = Number(req.requested_price);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (!req.requested_plan_id) return 0;
  const [rows] = await executor.execute<RowData>(
    'SELECT price_monthly, price_yearly FROM subscription_plans WHERE id = ?',
    [req.requested_plan_id],
  );
  if (!rows.length) return 0;
  const cycle = String(req.requested_billing_cycle || '').trim().toLowerCase() === 'yearly';
  const price = Number(cycle ? (rows[0] as any).price_yearly : (rows[0] as any).price_monthly);
  return Number.isFinite(price) ? price : 0;
}

/**
 * Activate the subscription behind an upgrade/registration request.
 *
 * Concurrency-safe and event-order independent:
 *   - The request row is locked (SELECT ... FOR UPDATE) so payment events and admin approvals
 *     can never double-activate; an already-approved request short-circuits (idempotent skip).
 *   - Accepts a request that is `pending` OR already `approved` (a late payment after an earlier
 *     run is idempotent) and never activates `rejected`/`cancelled` requests.
 *   - Applies the org-active gate (non-registration requests require is_active) and the payment
 *     gate before writing anything. Registration requests ('organization'/'seller') activate the
 *     organisation (verified + active) in the same transaction — subscription active ⇒ org active.
 *   - Delegates the only status/dates write to writeActiveSubscription.
 *   - Cash subscriptions post a `subscription_cash_payment` ledger entry inside the same
 *     transaction, so accounting can never exist without activation or vice versa.
 *   - An already-approved request that is missing its cash posting (activated before this
 *     guarantee existed) is healed on the next approval call: the posting is back-filled
 *     through the canonical engine, idempotently.
 */
export async function tryActivateSubscriptionRequest(
  requestId: number,
  opts: ActivateRequestOptions = {},
): Promise<ActivationResult> {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [reqRows] = await conn.execute<RowData>(
      'SELECT * FROM organisation_upgrade_requests WHERE id = ? FOR UPDATE',
      [requestId],
    );
    if (!reqRows.length) throw new ValidationError('Subscription request not found');
    const req = reqRows[0] as any;

    if (req.status === 'rejected' || req.status === 'cancelled') {
      throw new ValidationError(`Cannot activate a ${req.status} subscription request`);
    }
    if (req.status === 'approved') {
      // A prior run already activated it — idempotent skip, EXCEPT for the
      // legacy-consistency repair below: requests activated before atomic cash
      // accounting existed (or by an older deployed build) would otherwise stay
      // forever Active-without-ledger, which is unacceptable for a Cash subscription.
      await conn.rollback();

      const approvedMethod = String(req.chosen_payment_method || '').trim().toLowerCase();
      const approvedAmount = await resolveRequestAmount(pool, req);
      if (approvedMethod === 'cash' && approvedAmount > 0) {
        const { ledgerRepository } = await import('../../financial/infrastructure/repositories/ledger.repository.js');
        const posted = await ledgerRepository.hasPosting('subscription', requestId, 'subscription_cash_payment');
        if (!posted) {
          // Heal through the SAME canonical engine in its own committed transaction
          // (the original activation transaction is long gone). Idempotent via the
          // hasPosting pre-check above + ledger_entries.uk_dedup. A failure here
          // propagates so the admin sees the accounting error instead of silent success.
          const { postAccountingEvent } = await import('../../financial/application/accounting-event.listener.js');
          await postAccountingEvent(
            'subscription_cash_payment',
            'subscription',
            requestId,
            req.organisation_id,
            { cash_bank: approvedAmount, revenue: approvedAmount },
            'EGP',
            `Cash subscription payment (back-fill) — request #${requestId}${req.requested_plan_name ? ` (${req.requested_plan_name})` : ''}`,
          );
          return {
            ...baseResult(req),
            activated: false,
            alreadyProcessed: true,
            accountingBackfilled: true,
            reason: 'Request already approved — missing cash accounting entry back-filled',
          };
        }
      }
      return { ...baseResult(req), activated: false, alreadyProcessed: true, reason: 'Request already approved' };
    }

    // Organisation must exist and not be deleted
    const [orgRows] = await conn.execute<RowData>(
      'SELECT id, name, owner_id, is_verified, is_active, deleted_at FROM organisations WHERE id = ? FOR UPDATE',
      [req.organisation_id],
    );
    if (!orgRows.length || orgRows[0].deleted_at) throw new ValidationError('Organisation no longer exists');
    const org = orgRows[0] as any;
    const isRegistration = REGISTRATION_REQUEST_TYPES.has(String(req.registration_type || '').toLowerCase());

    // Requested plan must still be available
    if (req.requested_plan_id) {
      const [planRows] = await conn.execute<RowData>(
        'SELECT id, is_active FROM subscription_plans WHERE id = ?',
        [req.requested_plan_id],
      );
      if (!planRows.length || !planRows[0].is_active) {
        throw new ValidationError('Requested plan is no longer available');
      }
    }

    // No conflicting pending request for the same organisation
    const [conflictRows] = await conn.execute<RowData>(
      `SELECT id FROM organisation_upgrade_requests
       WHERE organisation_id = ? AND status = 'pending' AND id != ? LIMIT 1`,
      [req.organisation_id, requestId],
    );
    if (conflictRows.length) {
      await conn.rollback();
      return { ...baseResult(req), activated: false, deferred: 'conflict', reason: 'Another pending request exists for this organisation' };
    }

    // Org-active gate — subscription status is independent of org verification status.
    // Only require the org to exist and be active (not suspended/deleted).
    // Paid plans no longer require is_verified: subscription approval is a separate workflow.
    // Registration requests are exempt: the org was born inactive and THIS pending request
    // is its only blocking condition — activation below also activates the organisation.
    if (!org.is_active && !isRegistration) {
      await conn.rollback();
      return { ...baseResult(req), activated: false, deferred: 'org-inactive', reason: 'Organisation must be active before a subscription can activate' };
    }

    // Payment gate
    const adminId = opts.adminId ?? null;
    const paymentOk = await isPaymentSatisfied(conn, req, adminId);
    if (!paymentOk) {
      await conn.rollback();
      return { ...baseResult(req), activated: false, deferred: 'payment', reason: 'Payment not confirmed' };
    }

    // ── Write the active subscription (single authoritative writer) ──
    let startDate: string | null;
    let endDate: string | null;
    if (req.requested_plan_id) {
      const billingCycle = req.requested_billing_cycle || 'monthly';
      const { isUnlimited, snapshot } = await buildPlanSnapshot(conn, req.requested_plan_id, billingCycle, req.requested_plan_name);
      const dates = await writeActiveSubscription({
        conn,
        orgId: req.organisation_id,
        planId: req.requested_plan_id,
        billingCycle,
        planSnapshot: JSON.stringify(snapshot),
        isUnlimited,
        requestType: req.request_type,
      });
      startDate = dates.startDate;
      endDate = dates.endDate;
    } else {
      // No plan requested — activate the existing subscription untouched (keep its period + snapshot).
      const [subRows] = await conn.execute<RowData>(
        `SELECT id, plan_id, billing_cycle, plan_snapshot FROM organisation_subscriptions
         WHERE organisation_id = ? ORDER BY created_at DESC LIMIT 1`,
        [req.organisation_id],
      );
      if (!subRows.length) {
        await conn.rollback();
        return { ...baseResult(req), activated: false, deferred: 'invalid', reason: 'No subscription to activate' };
      }
      const sub = subRows[0] as any;
      const dates = await writeActiveSubscription({
        conn,
        orgId: req.organisation_id,
        planId: sub.plan_id,
        billingCycle: sub.billing_cycle || 'monthly',
        planSnapshot: sub.plan_snapshot || '{}',
        isUnlimited: false,
        keepDates: true,
      });
      startDate = dates.startDate;
      endDate = dates.endDate;
    }

    // Mark the request approved (only reached when the subscription actually activated)
    await conn.execute(
      `UPDATE organisation_upgrade_requests
       SET status = 'approved', approved_by = ?, approved_at = NOW(),
           approval_notes = COALESCE(?, approval_notes), updated_at = NOW()
       WHERE id = ?`,
      [adminId, opts.approvalNotes || null, requestId],
    );

    // Registration requests: activate the organisation in the SAME transaction.
    // Subscription active ⇒ organisation active — for an org whose only blocking
    // condition was this pending registration. Admin suspensions of existing orgs
    // are unaffected (non-registration requests still defer with 'org-inactive').
    let organisationActivated = false;
    if (isRegistration && (!org.is_verified || !org.is_active)) {
      await conn.execute(
        `UPDATE organisations SET is_verified = TRUE, is_active = TRUE WHERE id = ?`,
        [req.organisation_id],
      );
      organisationActivated = true;
    }

    // Cash accounting — admin confirmation of a cash subscription IS the collection
    // evidence: CourtZon received the money. Post through the canonical engine
    // INSIDE this transaction (atomic with activation). Idempotent: hasPosting
    // pre-check + ledger_entries.uk_dedup(source_type='subscription', source_id=requestId).
    const paymentMethod = String(req.chosen_payment_method || '').trim().toLowerCase();
    const cashAmount = await resolveRequestAmount(conn, req);
    if (paymentMethod === 'cash' && cashAmount > 0) {
      // Lazy import: the accounting listener pulls in queue/redis clients at module load.
      const { postAccountingEvent } = await import('../../financial/application/accounting-event.listener.js');
      await postAccountingEvent(
        'subscription_cash_payment',
        'subscription',
        requestId,
        req.organisation_id,
        { cash_bank: cashAmount, revenue: cashAmount },
        'EGP',
        `Cash subscription payment — request #${requestId}${req.requested_plan_name ? ` (${req.requested_plan_name})` : ''}`,
        conn,
      );
    }

    // Financial audit trail (only for requests with a requested price)
    if (Number(req.requested_price) > 0) {
      await transactionRepository.createTransaction({
        type: 'subscription',
        sourceType: 'organisation_upgrade_request',
        sourceId: requestId,
        totalAmount: Number(req.requested_price),
        status: 'completed',
        metadata: {
          organisationId: req.organisation_id,
          requestType: req.request_type,
          requestedPlanName: req.requested_plan_name,
          previousPlanName: req.current_plan_name,
          approvedBy: adminId,
        },
      }, conn);
    }

    await conn.commit();
    clearSubscriptionCache();

    // The cash posting above participated in THIS transaction (outerConn) —
    // announce it only now that the commit is durable, so finance screens
    // never refresh on an uncommitted entry.
    if (paymentMethod === 'cash' && cashAmount > 0) {
      eventBusV2.emit('accounting:entry-recorded', {
        eventType: 'subscription_cash_payment',
        sourceType: 'subscription',
        sourceId: requestId,
        organisationId: req.organisation_id,
      });
    }

    eventBusV2.emit('subscription:request-approved', {
      organisationId: req.organisation_id,
      userId: req.requested_by,
      requestId,
      requestType: req.request_type,
      requestedPlanName: req.requested_plan_name,
      billingCycle: req.requested_billing_cycle || 'monthly',
      approvedBy: adminId,
    });
    if (organisationActivated) {
      // Registration approval completed — mirrors the event previously emitted by
      // ApprovalService.approveRegistration, now from the single authoritative path.
      eventBusV2.emit('organisation:approved', {
        organisationId: req.organisation_id,
        name: org.name,
        userId: org.owner_id ?? req.requested_by ?? adminId,
      });
    }
    if (req.request_type === 'RENEWAL') {
      // The renewal event means the next period is secured. When the chained
      // start is still in the future the current period keeps serving until
      // the daily lifecycle job promotes the scheduled row to 'active'
      // (which emits organisation:subscription-status-changed).
      eventBusV2.emit('organisation:subscription-renewed', {
        organisationId: req.organisation_id,
        planName: req.requested_plan_name,
        billingCycle: req.requested_billing_cycle || 'monthly',
        startDate,
        endDate,
      });
    }

    recordAudit({
      actorId: adminId ?? 0,
      action: 'SUBSCRIPTION.REQUEST.APPROVED',
      entityType: 'organisation_upgrade_request',
      entityId: requestId,
      afterState: {
        organisationId: req.organisation_id,
        requestType: req.request_type,
        requestedPlanId: req.requested_plan_id,
        requestedPlanName: req.requested_plan_name,
        approvedBy: adminId,
        activatedAt: startDate,
        organisationActivated,
        cashAccountingPosted: paymentMethod === 'cash' && cashAmount > 0,
      },
    }).catch((err) => log.error({ err, requestId }, 'Audit failed on subscription activation'));

    return {
      ...baseResult(req),
      activated: true,
      startDate,
      endDate,
      organisationActivated,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
