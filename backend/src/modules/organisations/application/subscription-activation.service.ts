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
  /** 'RENEWAL' extends an existing future end_date while preserving the original start_date. */
  requestType?: string | null;
  /** Keep existing start/end dates unchanged (e.g. resume after suspension). */
  keepDates?: boolean;
}

function addPeriod(date: Date, billingCycle: string): Date {
  const d = new Date(date);
  if (billingCycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function toSqlDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * SINGLE authoritative writer of `subscription_status = 'active'`, `start_date` and `end_date`
 * on `organisation_subscriptions`. Every activation path (payment, admin approval, free plans,
 * direct admin assignment, resume) MUST go through here so that:
 *   - renewals extend from the existing future end_date (original start_date preserved);
 *   - expired / new subscriptions start a fresh period from the activation date;
 *   - no other code can flip a subscription active or rewrite its period.
 */
export async function writeActiveSubscription(input: WriteActiveSubscriptionInput): Promise<{
  startDate: string | null;
  endDate: string | null;
  subscriptionId: number;
}> {
  const { conn, orgId, planId, billingCycle, planSnapshot, isUnlimited, requestType, keepDates } = input;

  const today = new Date();

  const [existingRows] = await conn.execute<RowData>(
    `SELECT id, start_date, end_date FROM organisation_subscriptions
     WHERE organisation_id = ? AND subscription_status IN ('pending', 'suspended', 'active')
     ORDER BY created_at DESC LIMIT 1`,
    [orgId],
  );
  const existing = existingRows[0] as any;

  let startDate: Date;
  let endDate: Date | null;

  if (keepDates && existing) {
    startDate = existing.start_date ? new Date(existing.start_date) : today;
    endDate = existing.end_date ? new Date(existing.end_date) : (isUnlimited ? null : addPeriod(today, billingCycle));
  } else if (requestType === 'RENEWAL' && existing?.end_date && !isUnlimited) {
    const currentEnd = new Date(existing.end_date);
    if (currentEnd > today) {
      startDate = existing.start_date ? new Date(existing.start_date) : today;
      endDate = addPeriod(currentEnd, billingCycle);
    } else {
      startDate = today;
      endDate = addPeriod(today, billingCycle);
    }
  } else {
    startDate = today;
    endDate = isUnlimited ? null : addPeriod(today, billingCycle);
  }

  const newStart = toSqlDate(startDate);
  const newEnd = endDate ? toSqlDate(endDate) : null;

  if (existing) {
    await conn.execute(
      `UPDATE organisation_subscriptions
       SET plan_id = ?, billing_cycle = ?, subscription_status = 'active',
           start_date = ?, end_date = ?, plan_snapshot = ?, auto_renew = TRUE, updated_at = NOW()
       WHERE id = ?`,
      [planId, billingCycle, newStart, newEnd, planSnapshot, existing.id],
    );
    return { startDate: newStart, endDate: newEnd, subscriptionId: existing.id };
  }

  const [result] = await conn.execute(
    `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, subscription_status, start_date, end_date, plan_snapshot, auto_renew)
     VALUES (?, ?, ?, 'active', ?, ?, ?, TRUE)`,
    [orgId, planId, billingCycle, newStart, newEnd, planSnapshot],
  );
  return { startDate: newStart, endDate: newEnd, subscriptionId: (result as any).insertId };
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
 * Activate the subscription behind an upgrade/registration request.
 *
 * Concurrency-safe and event-order independent:
 *   - The request row is locked (SELECT ... FOR UPDATE) so payment events and admin approvals
 *     can never double-activate.
 *   - Accepts a request that is `pending` OR already `approved` (a late payment after an earlier
 *     run is idempotent) and never activates `rejected`/`cancelled` requests.
 *   - Applies the org-active gate (paid plans require is_active && is_verified; free plans only
 *     require is_active) and the payment gate before writing anything.
 *   - Delegates the only status/dates write to writeActiveSubscription.
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
      // A prior run already activated it — idempotent skip.
      await conn.rollback();
      return { ...baseResult(req), activated: false, alreadyProcessed: true, reason: 'Request already approved' };
    }

    // Organisation must exist and not be deleted
    const [orgRows] = await conn.execute<RowData>(
      'SELECT id, is_verified, is_active, deleted_at FROM organisations WHERE id = ? FOR UPDATE',
      [req.organisation_id],
    );
    if (!orgRows.length || orgRows[0].deleted_at) throw new ValidationError('Organisation no longer exists');
    const org = orgRows[0] as any;

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

    // Org-active gate (business rule)
    const isPaid = await isPaidPlan(conn, req);
    if (isPaid && !(org.is_active && org.is_verified)) {
      await conn.rollback();
      return {
        ...baseResult(req),
        activated: false,
        deferred: 'org-inactive',
        reason: 'Organisation must be active and verified before a paid subscription can activate',
      };
    }
    if (!isPaid && !org.is_active) {
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

    eventBusV2.emit('subscription:request-approved', {
      organisationId: req.organisation_id,
      userId: req.requested_by,
      requestId,
      requestType: req.request_type,
      requestedPlanName: req.requested_plan_name,
      billingCycle: req.requested_billing_cycle || 'monthly',
      approvedBy: adminId,
    });
    if (req.request_type === 'RENEWAL') {
      eventBusV2.emit('organisation:subscription-renewed', {
        organisationId: req.organisation_id,
        planName: req.requested_plan_name,
        billingCycle: req.requested_billing_cycle || 'monthly',
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
      },
    }).catch((err) => log.error({ err, requestId }, 'Audit failed on subscription activation'));

    return {
      ...baseResult(req),
      activated: true,
      startDate,
      endDate,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
