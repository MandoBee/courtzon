import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';

type RowData = mysql.RowDataPacket[];

export const settlementRepository = {
  // ── Read ──

  async getSettlementDetail(settlementId: number) {
    const pool = getPool();
    const [settlementRows] = await pool.execute<RowData>(
      `SELECT s.*, o.name as organisation_name
       FROM settlements s
       JOIN organisations o ON o.id = s.organisation_id
       WHERE s.id = ?`,
      [settlementId],
    );
    if (!settlementRows.length) return null;
    const settlement = settlementRows[0] as any;

    const [orders] = await pool.execute<RowData>(
      `SELECT so.*, o.public_id as order_public_id, o.status as order_status,
              o.created_at as order_date
       FROM settlement_orders so
       JOIN orders o ON o.id = so.order_id
       WHERE so.settlement_id = ?
       ORDER BY so.id`,
      [settlementId],
    );

    const [transfers] = await pool.execute<RowData>(
      'SELECT * FROM settlement_transfers WHERE settlement_id = ? ORDER BY id',
      [settlementId],
    );

    return { ...settlement, orders, transfers };
  },

  async findSettlements(filters: {
    status?: string;
    orgId?: number;
    orgIds?: number[];
    branchId?: number;
    from?: string;
    to?: string;
    page: number;
    limit: number;
  }) {
    const pool = getPool();
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.status) { conditions.push('s.settlement_status = ?'); params.push(filters.status); }
    if (filters.orgId) { conditions.push('s.organisation_id = ?'); params.push(filters.orgId); }
    if (filters.orgIds?.length) {
      const placeholders = filters.orgIds.map(() => '?').join(',');
      conditions.push(`s.organisation_id IN (${placeholders})`);
      params.push(...filters.orgIds);
    }
    if (filters.branchId) { conditions.push('s.branch_id = ?'); params.push(filters.branchId); }
    if (filters.from) { conditions.push('s.requested_at >= ?'); params.push(filters.from); }
    if (filters.to) { conditions.push('s.requested_at <= ?'); params.push(filters.to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) as total FROM settlements s ${where}`,
      params,
    );
    const total = (countRows[0] as any).total;

    const pag = buildPagination(filters.page, filters.limit);
    const [rows] = await pool.execute<RowData>(
      `SELECT s.*, o.name as organisation_name,
              (SELECT COUNT(*) FROM settlement_orders so WHERE so.settlement_id = s.id) as order_count
       FROM settlements s
       JOIN organisations o ON o.id = s.organisation_id
       ${where}
       ORDER BY s.requested_at DESC${paginationClause(pag)}`,
      params,
    );

    return { data: rows, total, page: pag.page, limit: pag.limit };
  },

  async findOrgSettlements(orgId: number, page: number, limit: number) {
    return this.findSettlements({ orgId, page, limit });
  },

  /** Settlements across multiple organisations (used by multi-org sellers). */
  async findSettlementsForOrgs(orgIds: number[], page: number, limit: number) {
    if (!orgIds.length) return { data: [], total: 0, page, limit };
    return this.findSettlements({ orgIds, page, limit });
  },
};