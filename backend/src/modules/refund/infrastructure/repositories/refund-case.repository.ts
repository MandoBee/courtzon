import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import type {
  RefundCaseRecord,
  RefundCaseLineRecord,
  RefundPayoutRecord,
} from '../../domain/refund-case.aggregate.js';

type RowData = mysql.RowDataPacket[];
type Executor = mysql.Pool | mysql.PoolConnection;

const poolRow = (r: any): RefundCaseRecord => ({
  ...r,
  id: Number(r.id),
  source_id: Number(r.source_id),
  original_payment_id: r.original_payment_id != null ? Number(r.original_payment_id) : null,
  organisation_id: Number(r.organisation_id),
  requested_by: Number(r.requested_by),
  canceled_value_cents: Number(r.canceled_value_cents),
  approved_refund_cents: Number(r.approved_refund_cents),
  fee_cents: Number(r.fee_cents),
  discount_cents: Number(r.discount_cents),
  paid_cents: Number(r.paid_cents),
  approved_by: r.approved_by != null ? Number(r.approved_by) : null,
  aggregate_version: Number(r.aggregate_version),
  policy_snapshot:
    r.policy_snapshot == null
      ? null
      : typeof r.policy_snapshot === 'string'
        ? JSON.parse(r.policy_snapshot)
        : r.policy_snapshot,
});

const lineRow = (r: any): RefundCaseLineRecord => ({
  ...r,
  id: Number(r.id),
  case_id: Number(r.case_id),
  line_no: Number(r.line_no),
  source_id: Number(r.source_id),
  canceled_value_cents: Number(r.canceled_value_cents),
  approved_cents: Number(r.approved_cents),
});

const payoutRow = (r: any): RefundPayoutRecord => ({
  ...r,
  id: Number(r.id),
  case_id: Number(r.case_id),
  amount_cents: Number(r.amount_cents),
  executed_by: r.executed_by != null ? Number(r.executed_by) : null,
});

export interface CreateRefundCaseInput {
  publicId: string;
  domain: string;
  sourceType: string;
  sourceId: number;
  originalPaymentId: number | null;
  organisationId: number;
  requestedBy: number;
  reason: string;
  policySnapshot: Record<string, unknown> | null;
  canceledValueCents: number;
  approvedRefundCents: number;
  feeCents: number;
  discountCents: number;
  currency: string;
  idempotencyKey: string;
  lines: Array<{
    lineNo: number;
    lineType: string;
    sourceId: number;
    canceledValueCents: number;
    approvedCents: number;
  }>;
}

export const refundCaseRepository = {
  async create(input: CreateRefundCaseInput, conn: mysql.PoolConnection): Promise<number> {
    const [res] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO refund_cases
        (public_id, domain, source_type, source_id, original_payment_id, organisation_id,
         requested_by, reason, policy_snapshot, canceled_value_cents, approved_refund_cents,
         fee_cents, discount_cents, paid_cents, currency, status, operational_status,
         payout_status, aggregate_version, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'REQUESTED', 'PENDING', 'PENDING', 1, ?)`,
      [
        input.publicId,
        input.domain,
        input.sourceType,
        input.sourceId,
        input.originalPaymentId,
        input.organisationId,
        input.requestedBy,
        input.reason,
        input.policySnapshot ? JSON.stringify(input.policySnapshot) : null,
        input.canceledValueCents,
        input.approvedRefundCents,
        input.feeCents,
        input.discountCents,
        input.currency,
        input.idempotencyKey,
      ],
    );
    for (const line of input.lines) {
      await conn.execute(
        `INSERT INTO refund_case_lines
          (case_id, line_no, line_type, source_id, canceled_value_cents, approved_cents,
           operational_status)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
        [res.insertId, line.lineNo, line.lineType, line.sourceId, line.canceledValueCents, line.approvedCents],
      );
    }
    return res.insertId;
  },

  async lockById(id: number, conn: mysql.PoolConnection): Promise<RefundCaseRecord | null> {
    const [rows] = await conn.execute<RowData>('SELECT * FROM refund_cases WHERE id = ? FOR UPDATE', [id]);
    return rows.length ? poolRow(rows[0]) : null;
  },

  async findById(id: number): Promise<RefundCaseRecord | null> {
    const [rows] = await getPool().execute<RowData>('SELECT * FROM refund_cases WHERE id = ?', [id]);
    return rows.length ? poolRow(rows[0]) : null;
  },

  async findByPublicId(publicId: string): Promise<RefundCaseRecord | null> {
    const [rows] = await getPool().execute<RowData>(
      'SELECT * FROM refund_cases WHERE public_id = ?',
      [publicId],
    );
    return rows.length ? poolRow(rows[0]) : null;
  },

  async findByIdempotencyKey(key: string): Promise<RefundCaseRecord | null> {
    const [rows] = await getPool().execute<RowData>(
      'SELECT * FROM refund_cases WHERE idempotency_key = ?',
      [key],
    );
    return rows.length ? poolRow(rows[0]) : null;
  },

  async list(filter: {
    organisationId?: number;
    status?: string;
    domain?: string;
    page: number;
    limit: number;
  }): Promise<{ rows: RefundCaseRecord[]; total: number }> {
    const conditions: string[] = ['1=1'];
    const params: any[] = [];
    if (filter.organisationId != null) {
      conditions.push('organisation_id = ?');
      params.push(filter.organisationId);
    }
    if (filter.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter.domain) {
      conditions.push('domain = ?');
      params.push(filter.domain);
    }
    const where = conditions.join(' AND ');
    const [countRows] = await getPool().execute<RowData>(
      `SELECT COUNT(*) AS total FROM refund_cases WHERE ${where}`,
      params,
    );
    const offset = (filter.page - 1) * filter.limit;
    const [rows] = await getPool().query<RowData>(
      `SELECT * FROM refund_cases WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, filter.limit, offset],
    );
    return {
      rows: (rows as any[]).map(poolRow),
      total: Number((countRows as any[])[0]?.total ?? 0),
    };
  },

  async listLines(caseId: number, executor?: Executor): Promise<RefundCaseLineRecord[]> {
    const db = executor ?? getPool();
    const [rows] = await db.execute<RowData>(
      'SELECT * FROM refund_case_lines WHERE case_id = ? ORDER BY line_no',
      [caseId],
    );
    return (rows as any[]).map(lineRow);
  },

  async updateLine(
    id: number,
    fields: { operational_status?: string; cancellation_ref?: string | null },
    conn: mysql.PoolConnection,
  ): Promise<void> {
    const sets: string[] = [];
    const params: any[] = [];
    if (fields.operational_status !== undefined) {
      sets.push('operational_status = ?');
      params.push(fields.operational_status);
    }
    if (fields.cancellation_ref !== undefined) {
      sets.push('cancellation_ref = ?');
      params.push(fields.cancellation_ref);
    }
    if (!sets.length) return;
    params.push(id);
    await conn.execute(`UPDATE refund_case_lines SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  async updateCase(
    id: number,
    expectedVersion: number,
    fields: Record<string, unknown>,
    conn: mysql.PoolConnection,
  ): Promise<void> {
    const allowed = new Set([
      'status',
      'operational_status',
      'payout_status',
      'approved_refund_cents',
      'paid_cents',
      'approved_by',
      'approved_at',
      'rejected_reason',
    ]);
    const sets: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(fields)) {
      if (!allowed.has(key)) throw new Error(`Unsupported refund case field: ${key}`);
      sets.push(`${key} = ?`);
      params.push(value);
    }
    if (!sets.length) return;
    sets.push('aggregate_version = aggregate_version + 1');
    params.push(id, expectedVersion);
    const [res] = await conn.execute<mysql.ResultSetHeader>(
      `UPDATE refund_cases SET ${sets.join(', ')} WHERE id = ? AND aggregate_version = ?`,
      params,
    );
    if (res.affectedRows === 0) {
      throw new Error(`Refund case ${id} version conflict (expected ${expectedVersion})`);
    }
  },

  async insertPayout(
    input: {
      caseId: number;
      method: 'cash' | 'bank_transfer';
      amountCents: number;
      reference: string | null;
      evidenceUrl: string | null;
      executedBy: number;
      idempotencyKey: string;
    },
    conn: mysql.PoolConnection,
  ): Promise<number> {
    const [res] = await conn.execute<mysql.ResultSetHeader>(
      `INSERT INTO refund_case_payouts
        (case_id, method, amount_cents, status, reference, evidence_url, executed_by,
         executed_at, idempotency_key)
       VALUES (?, ?, ?, 'PROCESSING', ?, ?, ?, NULL, ?)`,
      [input.caseId, input.method, input.amountCents, input.reference, input.evidenceUrl, input.executedBy, input.idempotencyKey],
    );
    return res.insertId;
  },

  async lockPayout(id: number, conn: mysql.PoolConnection): Promise<RefundPayoutRecord | null> {
    const [rows] = await conn.execute<RowData>(
      'SELECT * FROM refund_case_payouts WHERE id = ? FOR UPDATE',
      [id],
    );
    return rows.length ? payoutRow(rows[0]) : null;
  },

  async updatePayout(
    id: number,
    fields: { status?: string; executed_by?: number | null; executed_at?: Date | null },
    conn: mysql.PoolConnection,
  ): Promise<void> {
    const sets: string[] = [];
    const params: any[] = [];
    for (const [key, value] of Object.entries(fields)) {
      sets.push(`${key} = ?`);
      params.push(value);
    }
    if (!sets.length) return;
    params.push(id);
    await conn.execute(`UPDATE refund_case_payouts SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  async listPayouts(caseId: number): Promise<RefundPayoutRecord[]> {
    const [rows] = await getPool().execute<RowData>(
      'SELECT * FROM refund_case_payouts WHERE case_id = ? ORDER BY id',
      [caseId],
    );
    return (rows as any[]).map(payoutRow);
  },

  /**
   * Sum of approved refunds already committed for one service unit (excluding
   * rejected/failed cases) — used to enforce the refundable cap across multiple
   * cases without locking the whole table.
   */
  async sumActiveApprovedForLine(
    lineType: string,
    sourceId: number,
    conn: mysql.PoolConnection,
  ): Promise<number> {
    const [rows] = await conn.execute<RowData>(
      `SELECT COALESCE(SUM(l.approved_cents), 0) AS total
       FROM refund_case_lines l
       JOIN refund_cases c ON c.id = l.case_id
       WHERE l.line_type = ?
         AND l.source_id = ?
         AND c.status NOT IN ('REJECTED', 'FAILED')`,
      [lineType, sourceId],
    );
    return Number((rows as any[])[0]?.total ?? 0);
  },
};
