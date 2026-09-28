import { getPool } from '../../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

type RowData = RowDataPacket[];

export interface TournamentRefundRequest {
  id: number;
  tournamentId: number;
  registrationId: number;
  requestedBy: number | null;
  requestedAt: string;
  reviewedBy: number | null;
  reviewedAt: string | null;
  executedAt: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  reason: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(r: any): TournamentRefundRequest {
  return {
    id: Number(r.id),
    tournamentId: Number(r.tournament_id),
    registrationId: Number(r.registration_id),
    requestedBy: r.requested_by != null ? Number(r.requested_by) : null,
    requestedAt: String(r.requested_at),
    reviewedBy: r.reviewed_by != null ? Number(r.reviewed_by) : null,
    reviewedAt: r.reviewed_at ? String(r.reviewed_at) : null,
    executedAt: r.executed_at ? String(r.executed_at) : null,
    status: r.status,
    reason: r.reason,
    rejectionReason: r.rejection_reason,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

/**
 * G11.3 — persistence for the player-request → organisation-approval refund
 * workflow (`tournament_registration_refund_requests`). The one-open-per-
 * registration invariant is DB-enforced via the generated open_flag + the
 * UNIQUE(registration_id, open_flag) key, exactly like replacement requests.
 */
export const tournamentRefundRequestRepository = {
  async create(input: {
    tournamentId: number;
    registrationId: number;
    requestedBy: number;
    reason?: string | null;
  }): Promise<TournamentRefundRequest> {
    const [res] = await getPool().execute<ResultSetHeader>(
      `INSERT INTO tournament_registration_refund_requests
         (tournament_id, registration_id, requested_by, reason)
       VALUES (?, ?, ?, ?)`,
      [input.tournamentId, input.registrationId, input.requestedBy, input.reason ?? null],
    );
    const row = await this.findById(Number(res.insertId));
    if (!row) throw new Error(`Refund request ${res.insertId} not readable after insert`);
    return row;
  },

  async findById(id: number): Promise<TournamentRefundRequest | null> {
    const [rows] = await getPool().execute<RowData>(
      'SELECT * FROM tournament_registration_refund_requests WHERE id = ? LIMIT 1',
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  },

  /** One open (pending/approved) request per registration. */
  async findOpenByRegistration(registrationId: number): Promise<TournamentRefundRequest | null> {
    const [rows] = await getPool().execute<RowData>(
      `SELECT * FROM tournament_registration_refund_requests
       WHERE registration_id = ? AND status IN ('pending','approved')
       ORDER BY id DESC LIMIT 1`,
      [registrationId],
    );
    return rows.length ? mapRow(rows[0]) : null;
  },

  async findByIdForUpdate(id: number, conn: PoolConnection): Promise<TournamentRefundRequest | null> {
    const [rows] = await conn.execute<RowData>(
      'SELECT * FROM tournament_registration_refund_requests WHERE id = ? FOR UPDATE',
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  },

  /** Requests for an organisation's tournaments (own org only — caller filters by orgId). */
  async listForOrganisation(orgId: number, status?: string): Promise<Array<TournamentRefundRequest & { tournamentName: string; playerName: string | null; registrationPaid: boolean }>> {
    const where = ['t.organisation_id = ?'];
    const params: any[] = [orgId];
    if (status) { where.push('rfr.status = ?'); params.push(status); }
    const [rows] = await getPool().execute<RowData>(
      `SELECT rfr.*, t.name AS tournament_name, u.full_name AS player_name,
              (r.payment_status = 'paid') AS registration_paid
       FROM tournament_registration_refund_requests rfr
       JOIN tournaments t ON t.id = rfr.tournament_id
       JOIN tournament_registrations r ON r.id = rfr.registration_id
       LEFT JOIN users u ON u.id = rfr.requested_by
       WHERE ${where.join(' AND ')}
       ORDER BY rfr.created_at DESC`,
      params,
    );
    return (rows as any[]).map((r) => ({
      ...mapRow(r),
      tournamentName: String(r.tournament_name ?? ''),
      playerName: r.player_name != null ? String(r.player_name) : null,
      registrationPaid: Number(r.registration_paid) === 1,
    }));
  },

  async updateStatus(
    id: number,
    data: {
      status: 'pending' | 'approved' | 'rejected' | 'executed';
      reviewedBy?: number | null;
      reviewedAt?: boolean;
      executedAt?: boolean;
      rejectionReason?: string | null;
    },
    conn?: PoolConnection,
  ): Promise<void> {
    const db = conn ?? getPool();
    const fields: string[] = ['status = ?'];
    const params: any[] = [data.status];
    if (data.reviewedBy !== undefined) { fields.push('reviewed_by = ?'); params.push(data.reviewedBy); }
    if (data.reviewedAt) { fields.push('reviewed_at = NOW()'); }
    if (data.executedAt) { fields.push('executed_at = NOW()'); }
    if (data.rejectionReason !== undefined) { fields.push('rejection_reason = ?'); params.push(data.rejectionReason); }
    params.push(id);
    await db.execute(`UPDATE tournament_registration_refund_requests SET ${fields.join(', ')} WHERE id = ?`, params);
  },
};