import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { generateUUID } from '../../../../shared/utils/token.js';

interface Row extends RowDataPacket { [column: string]: any; }

export interface OrgMembershipSettingsRow {
  organisation_id: number;
  enabled_durations: string;
  allowed_payment_methods: string;
}

export interface MembershipPlanRow extends Row {
  id: number;
  code: string;
  name: string;
  description: string | null;
  category: string;
  organisation_id: number | null;
  is_public: number;
  status: string;
  created_at: string;
}

export function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

class MembershipP1Repository {
  // ── Organisation settings ────────────────────────────────────────────────
  async getOrgSettings(orgId: number): Promise<OrgMembershipSettingsRow | null> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      'SELECT organisation_id, enabled_durations, allowed_payment_methods FROM organisation_membership_settings WHERE organisation_id = ?',
      [orgId],
    );
    return (rows[0] as OrgMembershipSettingsRow) || null;
  }

  async upsertOrgSettings(orgId: number, enabledDurations: string[], allowedPaymentMethods: string[]): Promise<void> {
    const pool = getPool();
    await pool.execute<ResultSetHeader>(
      `INSERT INTO organisation_membership_settings (organisation_id, enabled_durations, allowed_payment_methods)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE enabled_durations = VALUES(enabled_durations), allowed_payment_methods = VALUES(allowed_payment_methods)`,
      [orgId, JSON.stringify(enabledDurations), JSON.stringify(allowedPaymentMethods)],
    );
  }

  // ── Plans ────────────────────────────────────────────────────────────────
  async findPlanById(planId: number): Promise<MembershipPlanRow | null> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT id, code, name, description, category, organisation_id, is_public, status, created_at
       FROM membership_plans WHERE id = ? LIMIT 1`,
      [planId],
    );
    return (rows[0] as MembershipPlanRow) || null;
  }

  async findPlanByOrgAndCode(orgId: number, code: string): Promise<MembershipPlanRow | null> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT id, code, name, description, category, organisation_id, is_public, status, created_at
       FROM membership_plans WHERE organisation_id = ? AND code = ? LIMIT 1`,
      [orgId, code],
    );
    return (rows[0] as MembershipPlanRow) || null;
  }

  async listPlansByOrg(orgId: number): Promise<MembershipPlanRow[]> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT id, code, name, description, category, organisation_id, is_public, status, created_at
       FROM membership_plans
       WHERE organisation_id = ?
       ORDER BY created_at DESC`,
      [orgId],
    );
    return rows as MembershipPlanRow[];
  }

  async createPlan(
    orgId: number,
    data: { name: string; code: string; description?: string | null; category: string; isPublic: boolean },
    actorId: number,
  ): Promise<number> {
    const pool = getPool();
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO membership_plans
       (code, name, description, category, duration_type, duration_value, duration_days, plan_type,
        price, currency, status, is_public, organisation_id, created_by, updated_by)
       VALUES (?, ?, ?, ?, 'years', 1, 365, 'annual', 0, 'EGP', 'active', ?, ?, ?, ?)`,
      [data.code, data.name, data.description ?? null, data.category, data.isPublic ? 1 : 0, orgId, actorId, actorId],
    );
    return result.insertId;
  }

  async updatePlanBasic(planId: number, data: { name?: string; description?: string | null; category?: string; isPublic?: boolean }): Promise<void> {
    const pool = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description ?? null); }
    if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category); }
    if (data.isPublic !== undefined) { fields.push('is_public = ?'); values.push(data.isPublic ? 1 : 0); }
    if (!fields.length) return;
    values.push(planId);
    await pool.execute(`UPDATE membership_plans SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  // ── Plan versions (+ components + branches) ────────────────────────────────
  async findVersion(planVersionId: number): Promise<Row | null> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(`SELECT * FROM membership_plan_versions WHERE id = ? LIMIT 1`, [planVersionId]);
    return rows[0] || null;
  }

  async listVersionsByPlan(planId: number): Promise<Row[]> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT * FROM membership_plan_versions WHERE membership_plan_id = ? ORDER BY version_no DESC`,
      [planId],
    );
    return rows;
  }

  async listComponentsByVersionId(versionId: number): Promise<Row[]> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT * FROM membership_plan_components WHERE plan_version_id = ? ORDER BY sort_order, id`,
      [versionId],
    );
    return rows;
  }

  async listBranchIdsByVersionId(versionId: number): Promise<number[]> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      'SELECT branch_id FROM membership_plan_branches WHERE plan_version_id = ?',
      [versionId],
    );
    return (rows as { branch_id: number }[]).map((r) => Number(r.branch_id));
  }

  /** Next version number for a plan. */
  async nextVersionNo(planId: number): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      'SELECT COALESCE(MAX(version_no), 0) AS mx FROM membership_plan_versions WHERE membership_plan_id = ?',
      [planId],
    );
    return Number((rows[0] as { mx: number }).mx) + 1;
  }

  async countActiveVersions(planId: number): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT COUNT(*) AS c FROM membership_plan_versions WHERE membership_plan_id = ? AND status = 'active'`,
      [planId],
    );
    return Number((rows[0] as { c: number }).c);
  }

  /**
   * Create a version atomically with its components and branch scope.
   * `versionId` returned. All parts share one transaction.
   */
  async createVersionWithParts(
    planId: number,
    input: {
      versionNo: number;
      status: string;
      effectiveFrom: string;
      durationType: string;
      durationPeriods: number;
      renewalModel: string;
      fixedRenewalMonth?: number | null;
      fixedRenewalDay?: number | null;
      initialChargeType: string;
      initialChargePercent?: number | null;
      graceDays: number;
      branchScope: string;
      allowedPaymentMethods: string[];
      currency: string;
      installmentsEnabled: boolean;
      actorId: number;
      components: Array<{ code: string; name: string; category?: string | null; amount: number; quantity: number; isRequired: boolean; sortOrder: number }>;
      branchIds: number[];
    },
  ): Promise<number> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [res] = await conn.execute<ResultSetHeader>(
        `INSERT INTO membership_plan_versions
         (membership_plan_id, version_no, status, effective_from, duration_type, duration_periods,
          renewal_model, fixed_renewal_month, fixed_renewal_day, initial_charge_type, initial_charge_percent,
          grace_days, branch_scope, allowed_payment_methods, currency, installments_enabled, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          planId, input.versionNo, input.status, input.effectiveFrom, input.durationType, input.durationPeriods,
          input.renewalModel, input.fixedRenewalMonth ?? null, input.fixedRenewalDay ?? null,
          input.initialChargeType, input.initialChargePercent ?? null, input.graceDays, input.branchScope,
          JSON.stringify(input.allowedPaymentMethods), input.currency, input.installmentsEnabled ? 1 : 0, input.actorId,
        ],
      );
      const versionId = res.insertId;

      for (const c of input.components) {
        await conn.execute(
          `INSERT INTO membership_plan_components (plan_version_id, code, name, category, amount, is_required, quantity, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [versionId, c.code, c.name, c.category ?? null, c.amount, c.isRequired ? 1 : 0, c.quantity, c.sortOrder],
        );
      }
      for (const branchId of input.branchIds) {
        await conn.execute(
          'INSERT INTO membership_plan_branches (plan_version_id, branch_id) VALUES (?, ?)',
          [versionId, branchId],
        );
      }
      await conn.commit();
      return versionId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async updateDraftVersionParts(
    planVersionId: number,
    input: {
      durationType: string;
      durationPeriods: number;
      renewalModel: string;
      fixedRenewalMonth?: number | null;
      fixedRenewalDay?: number | null;
      initialChargeType: string;
      initialChargePercent?: number | null;
      graceDays: number;
      branchScope: string;
      allowedPaymentMethods: string[];
      currency: string;
      installmentsEnabled: boolean;
      actorId: number;
      components: Array<{ code: string; name: string; category?: string | null; amount: number; quantity: number; isRequired: boolean; sortOrder: number }>;
      branchIds: number[];
    },
  ): Promise<void> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `UPDATE membership_plan_versions SET
           duration_type = ?, duration_periods = ?, renewal_model = ?, fixed_renewal_month = ?, fixed_renewal_day = ?,
           initial_charge_type = ?, initial_charge_percent = ?, grace_days = ?, branch_scope = ?,
           allowed_payment_methods = ?, currency = ?, installments_enabled = ?
         WHERE id = ?`,
        [
          input.durationType, input.durationPeriods, input.renewalModel, input.fixedRenewalMonth ?? null,
          input.fixedRenewalDay ?? null, input.initialChargeType, input.initialChargePercent ?? null,
          input.graceDays, input.branchScope, JSON.stringify(input.allowedPaymentMethods), input.currency,
          input.installmentsEnabled ? 1 : 0, planVersionId,
        ],
      );
      await conn.execute('DELETE FROM membership_plan_components WHERE plan_version_id = ?', [planVersionId]);
      await conn.execute('DELETE FROM membership_plan_branches WHERE plan_version_id = ?', [planVersionId]);
      for (const c of input.components) {
        await conn.execute(
          `INSERT INTO membership_plan_components (plan_version_id, code, name, category, amount, is_required, quantity, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [planVersionId, c.code, c.name, c.category ?? null, c.amount, c.isRequired ? 1 : 0, c.quantity, c.sortOrder],
        );
      }
      for (const branchId of input.branchIds) {
        await conn.execute(
          'INSERT INTO membership_plan_branches (plan_version_id, branch_id) VALUES (?, ?)',
          [planVersionId, branchId],
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async setVersionStatus(planVersionId: number, status: string): Promise<void> {
    const pool = getPool();
    await pool.execute('UPDATE membership_plan_versions SET status = ? WHERE id = ?', [status, planVersionId]);
  }

  /** Supersede any active versions of a plan (keeps single-active invariant). */
  async supersedeActiveVersions(planId: number, actorId: number): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `UPDATE membership_plan_versions SET status = 'superseded'
       WHERE membership_plan_id = ? AND status = 'active'`,
      [planId],
    );
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────
  async createSubscriptionWithParts(
    input: {
      organisationId: number;
      userId: number;
      planId: number;
      planVersionId: number;
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
          commission_rate_value_snapshot, commission_amount, org_net_amount, payment_status, payment_method, created_by)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?)`,
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
          input.paymentMethod, input.actorId,
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
      await conn.commit();
      return subscriptionId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async findSubscription(subscriptionId: number): Promise<Row | null> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(`SELECT * FROM membership_subscriptions WHERE id = ? LIMIT 1`, [subscriptionId]);
    return rows[0] || null;
  }

  async listSubscriptionsByOrg(orgId: number): Promise<Row[]> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT ms.*, mp.name AS plan_name, u.full_name AS member_name
       FROM membership_subscriptions ms
       JOIN membership_plans mp ON mp.id = ms.plan_id
       LEFT JOIN users u ON u.id = ms.user_id
       WHERE ms.organisation_id = ?
       ORDER BY ms.created_at DESC`,
      [orgId],
    );
    return rows;
  }

  async listSubscriptionsByUser(userId: number): Promise<Row[]> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      `SELECT ms.*, mp.name AS plan_name
       FROM membership_subscriptions ms
       JOIN membership_plans mp ON mp.id = ms.plan_id
       WHERE ms.user_id = ?
       ORDER BY ms.created_at DESC`,
      [userId],
    );
    return rows;
  }

  async listSubscriptionComponents(subscriptionId: number): Promise<Row[]> {
    const pool = getPool();
    const [rows] = await pool.execute<Row[]>(
      'SELECT * FROM membership_subscription_components WHERE subscription_id = ? ORDER BY sort_order, id',
      [subscriptionId],
    );
    return rows;
  }

  async activateSubscription(subscriptionId: number, invoiceId: number | null, paymentMethod: string): Promise<void> {
    const pool = getPool();
    await pool.execute<ResultSetHeader>(
      `UPDATE membership_subscriptions
       SET status = 'active', payment_status = 'paid', invoice_id = ?, payment_method = ?,
           aggregate_version = aggregate_version + 1
       WHERE id = ? AND status = 'pending'`,
      [invoiceId, paymentMethod, subscriptionId],
    );
  }

  // ── Payments (reuse payment_transactions) ────────────────────────────────
  async createPayment(
    input: {
      userId: number;
      referenceId: number;
      amount: number;
      currency: string;
      paymentMethod: string;
      gatewayProvider?: string | null;
      gatewayReference?: string | null;
      idempotencyKey: string;
      status: string;
    },
  ): Promise<number> {
    const pool = getPool();
    const [res] = await pool.execute<ResultSetHeader>(
      `INSERT INTO payment_transactions
       (user_id, reference_id, reference_type, idempotency_key, payment_method, gateway_provider,
        gateway_reference, amount, currency, payment_status, trace_id)
       VALUES (?, ?, 'membership_subscription', ?, ?, ?, ?, ?, ?, ?, UUID())`,
      [
        input.userId, input.referenceId, input.idempotencyKey, input.paymentMethod,
        input.gatewayProvider ?? null, input.gatewayReference ?? null, input.amount, input.currency, input.status,
      ],
    );
    return res.insertId;
  }

  async markPaymentPaid(paymentId: number): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `UPDATE payment_transactions SET payment_status = 'paid', paid_at = NOW() WHERE id = ? AND payment_status != 'paid'`,
      [paymentId],
    );
  }

  // ── Invoice (reuse invoices + invoice_items) ─────────────────────────────
  async createInvoice(
    input: {
      organisationId: number;
      userId: number;
      invoiceNumber: string;
      issueDate: string;
      subtotal: number;
      total: number;
      referenceType: string;
      referenceId: number;
      actorId: number;
      items: Array<{ description: string; quantity: number; unitPrice: number; netAmount: number; totalAmount: number; taxRateId?: number | null }>;
    },
  ): Promise<number> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [res] = await conn.execute<ResultSetHeader>(
        `INSERT INTO invoices
         (organisation_id, user_id, invoice_number, invoice_type, status, issue_date, subtotal, tax_amount, total,
          reference_type, reference_id, created_by)
         VALUES (?, ?, ?, 'sales', 'paid', ?, ?, 0, ?, ?, ?, ?)`,
        [
          input.organisationId, input.userId, input.invoiceNumber, input.issueDate,
          input.subtotal, input.total, input.referenceType, input.referenceId, input.actorId,
        ],
      );
      const invoiceId = res.insertId;
      for (const item of input.items) {
        await conn.execute(
          `INSERT INTO invoice_items (invoice_id, description, quantity, price_type, tax_treatment, net_amount, unit_price, tax_rate, tax_amount, tax_rate_id, total)
           VALUES (?, ?, ?, 'net', 'zero_rated', ?, ?, 0, 0, NULL, ?)`,
          [invoiceId, item.description, item.quantity, item.netAmount, item.unitPrice, item.totalAmount],
        );
      }
      // Reuse invoice_items for the CourtZon commission line when present.
      await conn.commit();
      return invoiceId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

export const membershipP1Repository = new MembershipP1Repository();