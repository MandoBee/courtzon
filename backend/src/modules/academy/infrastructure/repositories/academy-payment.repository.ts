import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import type { AcademyEnrollmentPaymentAttributes } from '../../domain/academy.types.js';

type RowData = mysql.RowDataPacket[];
type ResultSet = mysql.ResultSetHeader;

export interface AcademyPaymentContext {
  enrollmentId: number;
  playerId: number;
  programId: number;
  groupId: number | null;
  organisationId: number | null;
  branchId: number | null;
  programPrice: number;
  currency: string;
  priceType: 'FREE' | 'FIXED' | 'MEMBERS_ONLY';
  coachId: number | null;
  coachCompType: 'fixed_total' | 'fixed_per_session' | 'percent_gross' | null;
  coachCompValue: number | null;
  coachCompCurrency: string | null;
  paymentConfirmedAt: string | null;
}

export interface ConfirmedSessionTotals {
  sessionCount: number;
  courtRentalAmount: number;
  courtRentalCurrency: string | null;
  earliestStart: string | null;
}

/**
 * G8 — persistence for the immutable `academy_enrollment_payments` snapshot and
 * its supporting reads. Every write method accepts an optional connection so the
 * offline acknowledgment flow can commit the payment transaction, the snapshot
 * and the enrollment acknowledgment atomically.
 */
class AcademyPaymentRepository {
  /**
   * Loads the enrollment + program + group context needed to resolve the
   * authoritative economics of an enrollment payment. Locks the enrollment row
   * when a connection is provided (serialization point for concurrent acks).
   */
  async getPaymentContext(
    enrollmentId: number,
    conn?: mysql.PoolConnection,
    forUpdate = false,
  ): Promise<AcademyPaymentContext | null> {
    const db = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      `SELECT e.id AS enrollment_id, e.player_id, e.program_id, e.group_id,
              e.payment_confirmed_at,
              p.organisation_id, p.branch_id, p.price AS program_price,
              p.currency, p.price_type,
              g.coach_id, g.comp_type AS coach_comp_type,
              g.comp_value AS coach_comp_value, g.comp_currency AS coach_comp_currency
       FROM academy_enrollments e
       JOIN academy_programs p ON p.id = e.program_id
       LEFT JOIN academy_groups g ON g.id = e.group_id
       WHERE e.id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
      [enrollmentId],
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    return {
      enrollmentId: Number(r.enrollment_id),
      playerId: Number(r.player_id),
      programId: Number(r.program_id),
      groupId: r.group_id != null ? Number(r.group_id) : null,
      organisationId: r.organisation_id != null ? Number(r.organisation_id) : null,
      branchId: r.branch_id != null ? Number(r.branch_id) : null,
      programPrice: Number(r.program_price || 0),
      currency: r.currency || 'EGP',
      priceType: r.price_type,
      coachId: r.coach_id != null ? Number(r.coach_id) : null,
      coachCompType: r.coach_comp_type ?? null,
      coachCompValue: r.coach_comp_value != null ? Number(r.coach_comp_value) : null,
      coachCompCurrency: r.coach_comp_currency ?? null,
      paymentConfirmedAt: r.payment_confirmed_at ?? null,
    };
  }

  /**
   * Aggregates the group's non-cancelled sessions to snapshot the session count
   * (coach fixed_per_session basis) and the court rental at confirmation time.
   * `court_price_amount` is the G3 finalisation snapshot; NULL sessions
   * contribute 0 (court not yet finalised).
   */
  async getConfirmedSessionTotals(
    groupId: number,
    conn?: mysql.PoolConnection,
  ): Promise<ConfirmedSessionTotals> {
    const db = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      `SELECT COUNT(*) AS session_count,
              COALESCE(SUM(court_price_amount), 0) AS court_rental_amount,
              MAX(court_price_currency) AS court_rental_currency,
              MIN(CONCAT(session_date, ' ', COALESCE(start_time, '00:00:00'))) AS earliest_start
       FROM academy_group_sessions
       WHERE group_id = ? AND status <> 'cancelled'`,
      [groupId],
    );
    const r = (rows[0] as any) ?? {};
    return {
      sessionCount: Number(r.session_count || 0),
      courtRentalAmount: Number(r.court_rental_amount || 0),
      courtRentalCurrency: r.court_rental_currency ?? null,
      earliestStart: r.earliest_start ?? null,
    };
  }

  async hasSnapshot(enrollmentId: number, conn?: mysql.PoolConnection): Promise<boolean> {
    const db = conn ?? getPool();
    const [rows] = await db.query<RowData>(
      'SELECT id FROM academy_enrollment_payments WHERE enrollment_id = ? LIMIT 1',
      [enrollmentId],
    );
    return rows.length > 0;
  }

  async getSnapshotByEnrollment(enrollmentId: number): Promise<AcademyEnrollmentPaymentAttributes | null> {
    const pool = getPool();
    const [rows] = await pool.query<RowData>(
      'SELECT * FROM academy_enrollment_payments WHERE enrollment_id = ? LIMIT 1',
      [enrollmentId],
    );
    return rows.length ? (rows[0] as AcademyEnrollmentPaymentAttributes) : null;
  }

  /**
   * Write-once insert. `uk_sep_enrollment` makes this idempotent: a second
   * attempt (duplicate payment / retry) is a no-op that returns the existing
   * snapshot id. The row is never updated.
   */
  async createSnapshot(
    data: Omit<AcademyEnrollmentPaymentAttributes, 'id' | 'status' | 'snapshot_created_at'>,
    conn?: mysql.PoolConnection,
  ): Promise<{ id: number; created: boolean }> {
    const db = conn ?? getPool();
    try {
      const [result] = await db.execute<ResultSet>(
        `INSERT INTO academy_enrollment_payments
          (enrollment_id, program_id, group_id, organisation_id, branch_id, player_id,
           status, gross_amount, currency, program_price, price_type, session_count,
           court_rental_amount, court_rental_currency, commission_rate, commission_amount,
           organization_earning_amount, coach_comp_type, coach_comp_value, coach_comp_amount,
           collector, payment_method, cancellation_window_minutes, payment_transaction_id,
           created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'authorized', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.enrollment_id, data.program_id, data.group_id ?? null,
          data.organisation_id ?? null, data.branch_id ?? null, data.player_id,
          data.gross_amount, data.currency, data.program_price, data.price_type,
          data.session_count, data.court_rental_amount, data.court_rental_currency ?? null,
          data.commission_rate, data.commission_amount, data.organization_earning_amount,
          data.coach_comp_type ?? null, data.coach_comp_value ?? null, data.coach_comp_amount,
          data.collector, data.payment_method, data.cancellation_window_minutes ?? null,
          data.payment_transaction_id ?? null, data.created_by ?? null,
        ],
      );
      return { id: Number(result.insertId), created: true };
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        const existing = await this.getSnapshotByEnrollment(data.enrollment_id);
        if (existing?.id) return { id: Number(existing.id), created: false };
      }
      throw err;
    }
  }

  /**
   * Creates the paid, offline (`cash`) payment_transactions row for an
   * admin-acknowledged enrollment. `uk_idempotency_key` on the deterministic
   * key makes concurrent acks safe. No gateway fields are written.
   */
  async createCashPaymentTransaction(
    params: { userId: number; enrollmentId: number; amount: number; currency: string },
    conn?: mysql.PoolConnection,
  ): Promise<number> {
    const db = conn ?? getPool();
    const idempotencyKey = `academy_cash_payment_${params.enrollmentId}`;
    const [result] = await db.execute<ResultSet>(
      `INSERT INTO payment_transactions
        (user_id, reference_id, idempotency_key, reference_type, payment_method,
         amount, currency, payment_status, paid_at, trace_id, aggregate_version)
       VALUES (?, ?, ?, 'academy', 'cash', ?, ?, 'paid', NOW(), UUID(), 1)`,
      [params.userId, params.enrollmentId, idempotencyKey, params.amount, params.currency],
    );
    return Number(result.insertId);
  }

  /**
   * MAX active cancellation window for the organisation (or its branches when
   * the org uses branch-level policy). Mirrors the booking resolution. Returns
   * null when no policy exists.
   */
  async getCancellationWindowMinutes(
    organisationId: number,
    branchId: number | null,
  ): Promise<number | null> {
    const pool = getPool();
    const [orgRows] = await pool.execute<RowData>(
      'SELECT cancellation_policy_level FROM organisations WHERE id = ?',
      [organisationId],
    );
    if (!orgRows.length) return null;
    const level = (orgRows[0] as any).cancellation_policy_level;
    const col = level === 'branch' ? 'branch_id' : 'organisation_id';
    const id = level === 'branch' ? branchId : organisationId;
    if (id == null) return null;
    const [polRows] = await pool.execute<RowData>(
      `SELECT MAX(cancellation_window_minutes) AS max_window
       FROM cancellation_policies WHERE ${col} = ? AND is_active = 1`,
      [id],
    );
    const maxWindow = (polRows[0] as any)?.max_window;
    return maxWindow != null ? Number(maxWindow) : null;
  }

  /** Idempotent enrollment acknowledgment — first acknowledgment wins attribution. */
  async markEnrollmentPaymentConfirmed(
    enrollmentId: number,
    confirmedBy: number | null,
    conn?: mysql.PoolConnection,
  ): Promise<void> {
    const db = conn ?? getPool();
    await db.execute(
      `UPDATE academy_enrollments
       SET payment_confirmed_at = COALESCE(payment_confirmed_at, NOW()),
           payment_confirmed_by = COALESCE(payment_confirmed_by, ?),
           updated_at = NOW()
       WHERE id = ?`,
      [confirmedBy, enrollmentId],
    );
  }
}

export const academyPaymentRepository = new AcademyPaymentRepository();
