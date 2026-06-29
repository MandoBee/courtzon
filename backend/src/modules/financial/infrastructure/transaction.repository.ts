import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../shared/utils/pagination.js';

type RowData = mysql.RowDataPacket[];

export interface CreateTransactionInput {
  type: string;
  sourceType?: string;
  sourceId?: number;
  currencyId?: number;
  totalAmount: number;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateEntryInput {
  transactionId: number;
  side: 'debit' | 'credit';
  entityType: 'user_wallet' | 'platform_account' | 'branch';
  entityId: number;
  amount: number;
  currencyId?: number;
  branchId?: number;
  organisationId?: number;
  description?: string;
}

export const transactionRepository = {
  async createTransaction(input: CreateTransactionInput): Promise<number> {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO transactions (type, source_type, source_id, currency_id, total_amount, status, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [input.type, input.sourceType ?? null, input.sourceId ?? null,
       input.currencyId ?? 2, input.totalAmount, input.status ?? 'pending',
       input.metadata ? JSON.stringify(input.metadata) : null],
    );
    return result.insertId;
  },

  async createEntries(entries: CreateEntryInput[]): Promise<void> {
    if (entries.length === 0) return;
    const pool = getPool();
    const sql = `INSERT INTO transaction_entries
      (transaction_id, side, entity_type, entity_id, amount, currency_id, branch_id, organisation_id, description)
      VALUES ${entries.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}`;
    const params = entries.flatMap(e => [
      e.transactionId, e.side, e.entityType, e.entityId, e.amount,
      e.currencyId ?? 2, e.branchId ?? null, e.organisationId ?? null, e.description ?? null,
    ]);
    await pool.execute(sql, params);
  },

  async updateTransactionStatus(id: number, status: string): Promise<void> {
    const pool = getPool();
    await pool.execute('UPDATE transactions SET status = ? WHERE id = ?', [status, id]);
  },

  async findById(id: number): Promise<any | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM transactions WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const txn = rows[0] as any;
    const [entries] = await pool.execute<RowData>(
      'SELECT * FROM transaction_entries WHERE transaction_id = ?', [id],
    );
    return { ...txn, entries };
  },

  async findBySource(sourceType: string, sourceId: number): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM transactions WHERE source_type = ? AND source_id = ? ORDER BY created_at DESC',
      [sourceType, sourceId],
    );
    return rows;
  },

  async getUserEntries(userId: number, page = 1, limit = 20): Promise<{ data: any[]; total: number }> {
    const pool = getPool();
    const pag = buildPagination(page, limit);
    const [countRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) as cnt FROM transaction_entries te
       JOIN user_wallets uw ON te.entity_type = 'user_wallet' AND te.entity_id = uw.id
       WHERE uw.user_id = ?`,
      [userId],
    );
    const total = (countRows[0] as any).cnt;

    const [rows] = await pool.execute<RowData>(
      `SELECT te.*, t.type as txn_type, t.status as txn_status, t.created_at as txn_created_at
       FROM transaction_entries te
       JOIN transactions t ON t.id = te.transaction_id
       JOIN user_wallets uw ON te.entity_type = 'user_wallet' AND te.entity_id = uw.id
       WHERE uw.user_id = ?
       ORDER BY te.created_at DESC${paginationClause(pag)}`,
      [userId],
    );
    return { data: rows, total };
  },

  async getBranchEntries(branchId: number, page = 1, limit = 20): Promise<{ data: any[]; total: number }> {
    const pool = getPool();
    const pag = buildPagination(page, limit);
    const [countRows] = await pool.execute<RowData>(
      'SELECT COUNT(*) as cnt FROM transaction_entries WHERE branch_id = ?',
      [branchId],
    );
    const total = (countRows[0] as any).cnt;

    const [rows] = await pool.execute<RowData>(
      `SELECT te.*, t.type as txn_type, t.status as txn_status
       FROM transaction_entries te
       JOIN transactions t ON t.id = te.transaction_id
       WHERE te.branch_id = ?
       ORDER BY te.created_at DESC${paginationClause(pag)}`,
      [branchId],
    );
    return { data: rows, total };
  },

  async getAllEntries(filters: {
    page: number;
    limit: number;
    type?: string;
    orgId?: number;
    branchId?: number;
    settlementStatus?: string;
    search?: string;
    from?: string;
    to?: string;
  }): Promise<{ data: any[]; total: number }> {
    const pool = getPool();
    const conditions: string[] = [];
    const params: any[] = [];
    let extraJoin = '';

    if (filters.type) { conditions.push('t.type = ?'); params.push(filters.type); }
    if (filters.orgId) { conditions.push('te.organisation_id = ?'); params.push(filters.orgId); }
    if (filters.branchId) { conditions.push('te.branch_id = ?'); params.push(filters.branchId); }
    if (filters.search) { conditions.push('te.description LIKE ?'); params.push(`%${filters.search}%`); }
    if (filters.from) { conditions.push('t.created_at >= ?'); params.push(filters.from); }
    if (filters.to) { conditions.push('t.created_at <= ?'); params.push(filters.to); }

    if (filters.settlementStatus) {
      if (filters.settlementStatus === 'settled') {
        extraJoin = 'JOIN orders ord ON t.source_type = \'marketplace\' AND t.source_id = ord.id AND ord.settlement_status = \'settled\'';
      } else if (filters.settlementStatus === 'unsettled') {
        extraJoin = 'JOIN orders ord ON t.source_type = \'marketplace\' AND t.source_id = ord.id AND ord.settlement_status = \'pending\'';
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) as total FROM transaction_entries te
      JOIN transactions t ON t.id = te.transaction_id
      LEFT JOIN branches b ON b.id = te.branch_id
      LEFT JOIN organisations o ON o.id = te.organisation_id
      ${extraJoin}
      ${where}`;

    const [countRows] = await pool.execute<RowData>(countSql, params);
    const total = (countRows[0] as any).total;

    const pag = buildPagination(filters.page, filters.limit);
    const [rows] = await pool.execute<RowData>(
      `SELECT te.*, t.type as txn_type, t.status as txn_status, t.source_type, t.source_id,
              t.created_at as txn_created_at, t.total_amount as txn_total,
              b.name as branch_name, o.name as org_name, ord.payment_method
       FROM transaction_entries te
       JOIN transactions t ON t.id = te.transaction_id
       LEFT JOIN branches b ON b.id = te.branch_id
       LEFT JOIN organisations o ON o.id = te.organisation_id
       LEFT JOIN orders ord ON t.source_type = 'marketplace' AND t.source_id = ord.id
       ${extraJoin}
       ${where}
       ORDER BY t.created_at DESC${paginationClause(pag)}`,
      params,
    );
    return { data: rows, total };
  },
};
