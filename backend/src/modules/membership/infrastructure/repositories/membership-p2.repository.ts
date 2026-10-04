import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type mysql from 'mysql2/promise';
import { generateUUID } from '../../../../shared/utils/token.js';
import type { GeneratedInstallment } from '../../domain/membership-p2.types.js';

type Row = RowDataPacket & { [column: string]: any; };

class MembershipP2Repository {
  // ── Installment templates (version-scoped, immutable once the version is active) ──
  async listInstallmentTemplates(planVersionId: number): Promise<Row[]> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT id, plan_version_id, seq, amount, due_offset_days
       FROM membership_plan_installment_templates
       WHERE plan_version_id = ? ORDER BY seq`,
      [planVersionId],
    );
    return rows;
  }

  // ── Per-subscription installments ─────────────────────────────────────────
  async createInstallmentRows(
    subscriptionId: number,
    installments: GeneratedInstallment[],
    conn?: mysql.PoolConnection,
  ): Promise<void> {
    const db: mysql.Pool | mysql.PoolConnection = conn ?? getPool();
    for (const inst of installments) {
      await db.execute<ResultSetHeader>(
        `INSERT INTO membership_installments
         (subscription_id, seq, amount, commission_amount, due_date, status, currency)
         VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
        [subscriptionId, inst.seq, inst.amount, inst.commissionAmount, inst.dueDate, inst.currency],
      );
    }
  }

  async listInstallmentsBySubscription(subscriptionId: number): Promise<Row[]> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT * FROM membership_installments WHERE subscription_id = ? ORDER BY seq`,
      [subscriptionId],
    );
    return rows;
  }

  async findInstallment(subscriptionId: number, seq: number): Promise<Row | null> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT * FROM membership_installments WHERE subscription_id = ? AND seq = ? LIMIT 1`,
      [subscriptionId, seq],
    );
    return rows[0] || null;
  }

  async findInstallmentByPayment(paymentTransactionId: number): Promise<Row | null> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT * FROM membership_installments WHERE payment_transaction_id = ? LIMIT 1`,
      [paymentTransactionId],
    );
    return rows[0] || null;
  }

  async findInstallmentPaymentId(installmentId: number): Promise<number | null> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT payment_transaction_id FROM membership_installments WHERE id = ? LIMIT 1`,
      [installmentId],
    );
    const v = rows[0]?.payment_transaction_id;
    return v != null ? Number(v) : null;
  }

  /**
   * Link an installment to its payment_transactions row BEFORE the accounting
   * event is emitted so the per-installment posting can always resolve the
   * immutable installment snapshot (no emit/persist race).
   */
  async linkInstallmentPayment(installmentId: number, paymentTransactionId: number): Promise<void> {
    const pool = getPool();
    await pool.execute<ResultSetHeader>(
      `UPDATE membership_installments SET payment_transaction_id = ?
       WHERE id = ? AND payment_transaction_id IS NULL`,
      [paymentTransactionId, installmentId],
    );
  }

  async countPendingOverdueBySubscription(subscriptionId: number): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT COUNT(*) AS c FROM membership_installments
       WHERE subscription_id = ? AND status IN ('pending','overdue')`,
      [subscriptionId],
    );
    return Number((rows[0] as Row).c);
  }

  /**
   * Mark an installment paid. Allowed from 'pending' OR 'overdue' only
   * (a post-expiry collection is a normal payment — decision #4). Idempotent
   * via the affectedRows guard; repeated confirmation is a no-op.
   */
  async markInstallmentPaid(installmentId: number, paymentTransactionId: number, at?: string): Promise<boolean> {
    const pool = getPool();
    const [res] = await pool.execute<ResultSetHeader>(
      `UPDATE membership_installments
       SET status = 'paid', paid_at = COALESCE(?, NOW()), payment_transaction_id = ?,
           aggregate_version = aggregate_version + 1
       WHERE id = ? AND status IN ('pending','overdue')`,
      [at ?? null, paymentTransactionId, installmentId],
    );
    return res.affectedRows > 0;
  }

  async markInstallmentRefunded(installmentId: number): Promise<boolean> {
    const pool = getPool();
    const [res] = await pool.execute<ResultSetHeader>(
      `UPDATE membership_installments
       SET status = 'refunded', aggregate_version = aggregate_version + 1
       WHERE id = ? AND status = 'paid'`,
      [installmentId],
    );
    return res.affectedRows > 0;
  }

  async voidPendingInstallments(subscriptionId: number): Promise<number> {
    const pool = getPool();
    const [res] = await pool.execute<ResultSetHeader>(
      `UPDATE membership_installments
       SET status = 'voided', aggregate_version = aggregate_version + 1
       WHERE subscription_id = ? AND status = 'pending'`,
      [subscriptionId],
    );
    return res.affectedRows;
  }

  async markOverdue(installmentId: number): Promise<boolean> {
    const pool = getPool();
    const [res] = await pool.execute<ResultSetHeader>(
      `UPDATE membership_installments
       SET status = 'overdue', aggregate_version = aggregate_version + 1
       WHERE id = ? AND status = 'pending' AND due_date < CURDATE()`,
      [installmentId],
    );
    return res.affectedRows > 0;
  }

  async listOverdueCandidates(): Promise<Row[]> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT id, subscription_id, seq, amount, due_date
       FROM membership_installments
       WHERE status = 'pending' AND due_date < CURDATE()
       ORDER BY due_date ASC`,
    );
    return rows;
  }

  async listInstallmentDueSoon(days: number): Promise<Row[]> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT mi.id, mi.subscription_id, mi.seq, mi.amount, mi.due_date,
              ms.user_id, ms.organisation_id
       FROM membership_installments mi
       JOIN membership_subscriptions ms ON ms.id = mi.subscription_id
       WHERE mi.status = 'pending'
         AND mi.due_date > CURDATE() AND mi.due_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
       ORDER BY mi.due_date ASC`,
      [days],
    );
    return rows;
  }

  async listActiveBranchIdsByOrg(orgId: number): Promise<number[]> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT id FROM branches WHERE organisation_id = ? AND deleted_at IS NULL AND is_active = 1 ORDER BY id`,
      [orgId],
    );
    return (rows as { id: number }[]).map((r) => Number(r.id));
  }

  // ── Subscription lifecycle transitions ───────────────────────────────────
  /** Activate on FIRST installment (decision #1) — only from 'pending'. */
  async activateSubscriptionOnFirstInstallment(
    subscriptionId: number,
    invoiceId: number | null,
    paymentMethod: string,
  ): Promise<boolean> {
    const pool = getPool();
    const [res] = await pool.execute<ResultSetHeader>(
      `UPDATE membership_subscriptions
       SET status = 'active', payment_status = 'partially_paid', invoice_id = ?,
           payment_method = ?, aggregate_version = aggregate_version + 1
       WHERE id = ? AND status = 'pending'`,
      [invoiceId, paymentMethod, subscriptionId],
    );
    return res.affectedRows > 0;
  }

  /** Recompute the invoice paid_amount/status after an installment payment or refund. */
  async updateInvoicePaidAmount(invoiceId: number, deltaPaid: number, total: number): Promise<void> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT paid_amount, total FROM invoices WHERE id = ? LIMIT 1`,
      [invoiceId],
    );
    const inv = rows[0];
    if (!inv) return;
    const newPaid = Math.round((Number(inv.paid_amount) + deltaPaid) * 100) / 100;
    const status = newPaid >= Number(total) ? 'paid' : (newPaid > 0 ? 'partially_paid' : 'issued');
    await pool.execute(
      `UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?`,
      [newPaid, status, invoiceId],
    );
  }

  async setSubscriptionCancelled(subscriptionId: number): Promise<boolean> {
    const pool = getPool();
    const [res] = await pool.execute<ResultSetHeader>(
      `UPDATE membership_subscriptions
       SET status = 'cancelled', aggregate_version = aggregate_version + 1
       WHERE id = ? AND status IN ('pending','active')`,
      [subscriptionId],
    );
    return res.affectedRows > 0;
  }

  async setSubscriptionExpired(subscriptionId: number): Promise<boolean> {
    const pool = getPool();
    const [res] = await pool.execute<ResultSetHeader>(
      `UPDATE membership_subscriptions
       SET status = 'expired', aggregate_version = aggregate_version + 1
       WHERE id = ? AND status = 'active'
         AND end_date IS NOT NULL AND end_date < CURDATE()
         AND (grace_until IS NULL OR grace_until < CURDATE())`,
      [subscriptionId],
    );
    return res.affectedRows > 0;
  }

  async listExpiredCandidates(): Promise<Row[]> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT id, user_id, organisation_id, plan_id, plan_version_id, end_date, grace_until,
              duration_type_snapshot, duration_periods_snapshot, renewal_model_snapshot,
              fixed_renewal_month_snapshot, fixed_renewal_day_snapshot, grace_days_snapshot
       FROM membership_subscriptions
       WHERE status = 'active' AND end_date IS NOT NULL AND end_date < CURDATE()
       ORDER BY end_date ASC`,
    );
    return rows;
  }

  async listGraceEndingSoon(days: number): Promise<Row[]> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT id, user_id, organisation_id, grace_until FROM membership_subscriptions
       WHERE status = 'active' AND grace_until IS NOT NULL
         AND grace_until > CURDATE() AND grace_until <= DATE_ADD(CURDATE(), INTERVAL ? DAY)`,
      [days],
    );
    return rows;
  }

  async listRenewalReminderCandidates(days: number): Promise<Row[]> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT id, user_id, organisation_id, plan_id, end_date FROM membership_subscriptions
       WHERE status = 'active' AND end_date IS NOT NULL
         AND end_date > CURDATE() AND end_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)`,
      [days],
    );
    return rows;
  }

  async findEffectivePlanVersion(planId: number, asOfISO: string): Promise<Row | null> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT * FROM membership_plan_versions
       WHERE membership_plan_id = ? AND status = 'active' AND effective_from <= ?
       ORDER BY effective_from DESC, version_no DESC LIMIT 1`,
      [planId, asOfISO],
    );
    if (rows.length) return rows[0];
    // Fallback: the newest active version (covers effective_from = future).
    const [fallback] = await pool.execute<Row[]>(
      `SELECT * FROM membership_plan_versions
       WHERE membership_plan_id = ? AND status = 'active'
       ORDER BY version_no DESC LIMIT 1`,
      [planId],
    );
    return fallback[0] || null;
  }

  /** Duplicate-renewal guard: an open (pending/active) successor already exists. */
  async countOpenRenewals(subscriptionId: number): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT COUNT(*) AS c FROM membership_subscriptions
       WHERE renewal_of_subscription_id = ? AND status IN ('pending','active')`,
      [subscriptionId],
    );
    return Number((rows[0] as Row).c);
  }

  // ── Organisation cancellation/refund policy ───────────────────────────────
  async getOrgCancellationRefundPolicy(orgId: number): Promise<string | null> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT cancellation_refund_policy FROM organisation_membership_settings WHERE organisation_id = ? LIMIT 1`,
      [orgId],
    );
    const raw = rows[0]?.cancellation_refund_policy;
    if (raw == null) return null;
    return typeof raw === 'string' ? raw : JSON.stringify(raw);
  }

  async setOrgCancellationRefundPolicy(orgId: number, policyJson: string): Promise<void> {
    const pool = getPool();
    await pool.execute<ResultSetHeader>(
      `INSERT INTO organisation_membership_settings (organisation_id, enabled_durations, allowed_payment_methods, cancellation_refund_policy)
       VALUES (?, '["monthly","quarterly","semi_annual","annual"]', '["cash","card"]', ?)
       ON DUPLICATE KEY UPDATE cancellation_refund_policy = VALUES(cancellation_refund_policy)`,
      [orgId, policyJson],
    );
  }

  /** Create a pending payment_transactions row for an installment. */
  async createInstallmentPayment(
    userId: number,
    subscriptionId: number,
    amount: number,
    currency: string,
    paymentMethod: string,
    seq: number,
  ): Promise<number> {
    const pool = getPool();
    const [res] = await pool.execute<ResultSetHeader>(
      `INSERT INTO payment_transactions
       (user_id, reference_id, reference_type, idempotency_key, payment_method, gateway_provider,
        gateway_reference, amount, currency, payment_status, trace_id)
       VALUES (?, ?, 'membership_subscription', ?, ?, ?, ?, ?, ?, 'pending', UUID())`,
      [
        userId, subscriptionId, `ms_${subscriptionId}_${seq}`, paymentMethod,
        paymentMethod === 'card' ? 'paymob' : null,
        paymentMethod === 'card' ? `ms_${subscriptionId}_${seq}_${Date.now()}` : null,
        amount, currency,
      ],
    );
    return res.insertId;
  }

  async findPendingInstallmentPayment(subscriptionId: number, method: string, userId: number): Promise<Row | null> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT id, amount FROM payment_transactions
       WHERE reference_type = 'membership_subscription' AND reference_id = ? AND payment_method = ?
         AND user_id = ? AND payment_status = 'pending'
       ORDER BY id DESC LIMIT 1`,
      [subscriptionId, method, userId],
    );
    return rows[0] || null;
  }

  async markPaymentPaid(paymentId: number): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `UPDATE payment_transactions SET payment_status = 'paid', paid_at = NOW() WHERE id = ? AND payment_status != 'paid'`,
      [paymentId],
    );
  }

  /** Cash refund (no gateway): paid → refunded guard, emits payment:refunded. */
  async markPaymentRefunded(paymentId: number): Promise<boolean> {
    const pool = getPool();
    const [res] = await pool.execute<ResultSetHeader>(
      `UPDATE payment_transactions SET payment_status = 'refunded', updated_at = NOW()
       WHERE id = ? AND payment_status = 'paid'`,
      [paymentId],
    );
    return res.affectedRows > 0;
  }

  async findPaymentById(paymentId: number): Promise<Row | null> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(`SELECT * FROM payment_transactions WHERE id = ? LIMIT 1`, [paymentId]);
    return rows[0] || null;
  }

  // ── Renewal — create a full new subscription (mirrors P1 creation) ────────
  async createRenewedSubscription(
    input: {
      organisationId: number;
      userId: number;
      planId: number;
      planVersionId: number;
      renewalOfSubscriptionId: number;
      startDate: string;
      endDate: string | null;
      graceUntil: string | null;
      snapshots: Record<string, any>;
      selectedBranchIds: number[] | null;
      allowedPaymentMethods: string[];
      currency: string;
      totalAmount: number;
      commissionRateType: string | null;
      commissionRateValue: number | null;
      commissionAmount: number;
      orgNetAmount: number;
      paymentMethod: string;
      actorId: number;
      components: Array<{
        code: string; name: string; category?: string | null; quantity: number;
        unitAmount: number; totalAmount: number; isRequired: boolean; sortOrder: number;
      }>;
      installments: GeneratedInstallment[];
    },
  ): Promise<number> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [res] = await conn.execute<ResultSetHeader>(
        `INSERT INTO membership_subscriptions
         (public_id, organisation_id, user_id, plan_id, plan_version_id, status, start_date, end_date, grace_until,
          duration_type_snapshot, duration_periods_snapshot, renewal_model_snapshot,
          fixed_renewal_month_snapshot, fixed_renewal_day_snapshot, initial_charge_type_snapshot,
          initial_charge_percent_snapshot, grace_days_snapshot, branch_scope_snapshot, selected_branch_ids,
          allowed_payment_methods_snapshot, currency, total_amount, commission_rate_type_snapshot,
          commission_rate_value_snapshot, commission_amount, org_net_amount, payment_status, payment_method,
          renewal_of_subscription_id, created_by)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?)`,
        [
          generateUUID(), input.organisationId, input.userId, input.planId, input.planVersionId,
          input.startDate, input.endDate, input.graceUntil,
          String(input.snapshots.durationType), input.snapshots.durationPeriods,
          String(input.snapshots.renewalModel), input.snapshots.fixedRenewalMonth ?? null,
          input.snapshots.fixedRenewalDay ?? null, String(input.snapshots.initialChargeType),
          input.snapshots.initialChargePercent ?? null, input.snapshots.graceDays,
          String(input.snapshots.branchScope),
          input.selectedBranchIds ? JSON.stringify(input.selectedBranchIds) : null,
          JSON.stringify(input.allowedPaymentMethods), input.currency, input.totalAmount,
          input.commissionRateType, input.commissionRateValue, input.commissionAmount, input.orgNetAmount,
          input.paymentMethod, input.renewalOfSubscriptionId, input.actorId,
        ],
      );
      const subscriptionId = res.insertId;
      for (const c of input.components) {
        await conn.execute(
          `INSERT INTO membership_subscription_components
           (subscription_id, component_code, component_name, category, quantity, unit_amount, total_amount, is_required_at_purchase, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [subscriptionId, c.code, c.name, c.category ?? null, c.quantity, c.unitAmount, c.totalAmount, c.isRequired ? 1 : 0, c.sortOrder],
        );
      }
      if (input.installments.length > 0) {
        await this.createInstallmentRows(subscriptionId, input.installments, conn);
      }
      await conn.commit();
      return subscriptionId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

export const membershipP2Repository = new MembershipP2Repository();