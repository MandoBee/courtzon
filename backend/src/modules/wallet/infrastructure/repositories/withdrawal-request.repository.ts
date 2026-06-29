import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export const withdrawalRequestRepository = {
  async findAll(filters: { status?: string; from?: string; to?: string; page: number; limit: number }) {
    const pool = getPool();
    if (!filters.page || filters.page < 1) filters.page = 1;
    if (!filters.limit || filters.limit < 1) filters.limit = 20;

    let sql = `SELECT wr.*, u.full_name as user_name, u.email as user_email,
               bfd.bank_account_number as account_number, bfd.bank_name
               FROM withdrawal_requests wr
               JOIN users u ON u.id = wr.user_id
               LEFT JOIN branch_financial_details bfd ON bfd.id = wr.branch_financial_details_id
               WHERE 1=1`;
    const params: any[] = [];
    if (filters.status) { sql += ' AND wr.status = ?'; params.push(filters.status); }
    if (filters.from) { sql += ' AND wr.created_at >= ?'; params.push(filters.from); }
    if (filters.to) { sql += ' AND wr.created_at <= ?'; params.push(filters.to); }
    sql += ' ORDER BY wr.created_at DESC';

    const countSql = `SELECT COUNT(*) as cnt FROM withdrawal_requests wr WHERE 1=1${
      filters.status ? ' AND wr.status = ?' : ''
    }${filters.from ? ' AND wr.created_at >= ?' : ''}${filters.to ? ' AND wr.created_at <= ?' : ''}`;
    const countParams = [...params];
    console.warn('[repo:findAll] countSql:', countSql, 'params:', JSON.stringify(countParams));
    const [countRows] = await pool.execute<RowData>(countSql, countParams);
    const total = Number((countRows[0] as any).cnt);

    const offset = (filters.page - 1) * filters.limit;
    // MySQL prepared statements do not support parameterised LIMIT/OFFSET — interpolate safely.
    const pagedSql = `${sql} LIMIT ${Number(filters.limit)} OFFSET ${Number(offset)}`;
    console.warn('[repo:findAll] mainSql:', pagedSql, 'params:', JSON.stringify(params));
    const [rows] = await pool.execute<RowData>(pagedSql, params);
    console.warn('[repo:findAll] returned', rows.length, 'rows');
    return { data: rows, total, page: filters.page, limit: filters.limit };
  },

  async findById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT wr.*, u.full_name as user_name, u.email as user_email,
       bfd.bank_account_number as account_number, bfd.bank_name
       FROM withdrawal_requests wr
       JOIN users u ON u.id = wr.user_id
       LEFT JOIN branch_financial_details bfd ON bfd.id = wr.branch_financial_details_id
       WHERE wr.id = ?`,
      [id],
    );
    return rows[0] || null;
  },

  async updateStatus(id: number, status: string, reviewedBy?: number, adminNotes?: string) {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE withdrawal_requests SET status = ?, reviewed_by = ?, admin_notes = ?, reviewed_at = NOW() WHERE id = ?`,
      [status, reviewedBy || null, adminNotes || null, id],
    );
    return result.affectedRows > 0;
  },
};
