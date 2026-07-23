import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import { ConflictError } from '../../../../shared/errors/app-error.js';
import client from 'prom-client';
import { registry } from '../../../../infrastructure/metrics/metrics.js';

const aggregateVersionConflictsTotal = new client.Counter({
  name: 'courtzon_aggregate_version_conflicts_total',
  help: 'Total number of aggregate version conflicts',
  labelNames: ['aggregate_type'] as const,
  registers: [registry],
});

type RowData = mysql.RowDataPacket[];
type Executor = mysql.Pool | mysql.PoolConnection;

function resolvePool(conn?: mysql.PoolConnection): Executor {
  return conn ?? getPool();
}

export class AggregateVersionConflict extends ConflictError {
  constructor(id: number, expectedVersion: number, actualVersion: number) {
    super(`Settlement ${id} version conflict: expected ${expectedVersion}, actual ${actualVersion}`);
  }
}

export const settlementRepository = {
  // ── Create ──

  async requestSettlement(data: {
    organisationId: number;
    branchId?: number | null;
    requestedBy: number;
    requestedByRole: string;
    periodStart?: string;
    periodEnd?: string;
    notes?: string;
  }) {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO settlements (organisation_id, branch_id, settlement_status, requested_by, requested_by_role,
        settlement_period_start, settlement_period_end, notes)
       VALUES (?, ?, 'requested', ?, ?, ?, ?, ?)`,
      [data.organisationId, data.branchId ?? null, data.requestedBy ?? null, data.requestedByRole ?? null,
       data.periodStart ?? null, data.periodEnd ?? null, data.notes ?? null]
    );
    return result.insertId;
  },

  async createSettlementOrders(items: {
    settlementId: number;
    orderId: number;
    productsPrice: number;
    shippingPrice: number;
    grossAmount: number;
    courtzonFee: number;
    organizationNet: number;
    paymentMethod: string | null;
  }[]) {
    if (!items.length) return;
    const pool = getPool();
    const placeholders = items.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const params = items.flatMap(i => [
      i.settlementId, i.orderId, i.productsPrice, i.shippingPrice,
      i.grossAmount, i.courtzonFee, i.organizationNet, i.paymentMethod ?? null,
    ]);
    await pool.execute(
      `INSERT INTO settlement_orders (settlement_id, order_id, products_price, shipping_price,
        gross_amount, courtzon_fee, organization_net, payment_method)
       VALUES ${placeholders}`,
      params,
    );
  },

  async createSettlementTransfer(data: {
    settlementId: number;
    direction: 'courtzon_to_org' | 'org_to_courtzon';
    amount: number;
    bankAccountId?: number | null;
    bankAccountSnapshot?: any;
    reference?: string;
  }) {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO settlement_transfers (settlement_id, transfer_direction, amount,
        bank_account_id, bank_account_snapshot, transfer_reference)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.settlementId, data.direction, data.amount,
       data.bankAccountId ?? null,
       data.bankAccountSnapshot ? JSON.stringify(data.bankAccountSnapshot) : null,
       data.reference ?? null],
    );
    return result.insertId;
  },

  // ── Read ──

  async findSettlementById(id: number, conn?: mysql.PoolConnection) {
    const pool = resolvePool(conn);
    const [rows] = await pool.execute<RowData>(
      'SELECT s.*, o.name as organisation_name FROM settlements s JOIN organisations o ON o.id = s.organisation_id WHERE s.id = ?',
      [id],
    );
    return rows[0] || null;
  },

  async persistTransition(id: number, status: string, expectedVersion: number, extra?: Record<string, any>, conn?: mysql.PoolConnection): Promise<void> {
    const pool = resolvePool(conn);
    const fields: string[] = ['settlement_status = ?', 'aggregate_version = aggregate_version + 1', 'updated_at = NOW()'];
    const params: any[] = [status];
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    }
    params.push(id, expectedVersion);
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE settlements SET ${fields.join(', ')} WHERE id = ? AND aggregate_version = ?`,
      params,
    );
    if (result.affectedRows === 0) {
      const [rows] = await pool.execute('SELECT aggregate_version FROM settlements WHERE id = ?', [id]);
      const actual = (rows as any[])[0]?.aggregate_version;
      aggregateVersionConflictsTotal.inc({ aggregate_type: 'settlement' });
      throw new AggregateVersionConflict(id, expectedVersion, actual ?? 0);
    }
  },

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

  // ── Update ──

  async updateSettlementStatus(id: number, status: string, extra?: Record<string, any>) {
    const pool = getPool();
    const fields: string[] = ['settlement_status = ?'];
    const params: any[] = [status];

    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    }

    params.push(id);
    await pool.execute(`UPDATE settlements SET ${fields.join(', ')} WHERE id = ?`, params);
  },

  async updateSettlementTotals(settlementId: number, totals: {
    grossAmount: number;
    shippingAmount: number;
    courtzonFee: number;
    organizationNet: number;
    codFeeTotal: number;
    onlineNetTotal: number;
    settlementDirection: 'courtzon_to_org' | 'org_to_courtzon';
    finalAmount: number;
  }) {
    const pool = getPool();
    await pool.execute(
      `UPDATE settlements SET
         gross_amount = ?, shipping_amount = ?, courtzon_fee = ?, organization_net = ?,
         cod_fee_total = ?, online_net_total = ?,
         settlement_direction = ?, final_amount = ?
       WHERE id = ?`,
      [totals.grossAmount, totals.shippingAmount, totals.courtzonFee, totals.organizationNet,
       totals.codFeeTotal, totals.onlineNetTotal,
       totals.settlementDirection, totals.finalAmount,
       settlementId],
    );
  },

  async updateSettlementBankAccount(settlementId: number, bankAccountId: number, snapshot: any) {
    const pool = getPool();
    await pool.execute(
      'UPDATE settlements SET bank_account_id = ?, bank_account_snapshot = ? WHERE id = ?',
      [bankAccountId, snapshot ? JSON.stringify(snapshot) : null, settlementId],
    );
  },

  async markOrdersSettled(orderIds: number[]) {
    if (!orderIds.length) return;
    const pool = getPool();
    await pool.execute(
      `UPDATE orders SET settlement_status = 'settled' WHERE id IN (${orderIds.map(() => '?').join(',')})`,
      orderIds,
    );
  },

  // ── Bank Account ──

  async getBankAccount(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM bank_accounts WHERE id = ?',
      [id],
    );
    return rows[0] || null;
  },

  async getBranchBankAccounts(branchId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM bank_accounts WHERE branch_id = ?',
      [branchId],
    );
    return rows;
  },

  // ── Transfer ──

  async updateTransferStatus(transferId: number, status: string, reason?: string) {
    const pool = getPool();
    if (reason) {
      await pool.execute(
        'UPDATE settlement_transfers SET transfer_status = ?, failure_reason = ?, transfer_date = NOW() WHERE id = ?',
        [status, reason, transferId],
      );
    } else {
      await pool.execute(
        'UPDATE settlement_transfers SET transfer_status = ?, transfer_date = NOW() WHERE id = ?',
        [status, transferId],
      );
    }
  },
};
