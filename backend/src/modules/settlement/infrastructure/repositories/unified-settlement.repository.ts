import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import { ConflictError } from '../../../../shared/errors/app-error.js';

type RowData = mysql.RowDataPacket[];

export interface CreateUnifiedSettlementData {
  organisationId: number;
  branchId: number | null;
  requestedBy: number;
  requestedByRole: string;
  batchCode: string | null;
  settlementType: string;
  organizationPosition: number;
  courtzonPosition: number;
  net: number;
  direction: 'COURTZON_TO_ORGANIZATION' | 'ORGANIZATION_TO_COURTZON' | 'ZERO_BALANCE';
  finalAmount: number;
  commissionAmount: number;
  notes?: string;
}

export interface SettlementFinancialWrite {
  grossAmount: number;
  netAmount: number;
  commissionAmount: number;
}

export const unifiedSettlementRepository = {
  async create(data: CreateUnifiedSettlementData, conn?: mysql.PoolConnection): Promise<number> {
    const db = conn ?? getPool();
    const [result] = await db.execute<mysql.ResultSetHeader>(
      `INSERT INTO settlements
        (organisation_id, branch_id, settlement_status, requested_by, requested_by_role,
         settlement_type, batch_code, organization_position, courtzon_position,
         net_amount, final_amount, settlement_direction, commission_amount, notes,
         requested_at, created_at)
       VALUES (?, ?, 'requested', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        data.organisationId, data.branchId, data.requestedBy, data.requestedByRole,
        data.settlementType, data.batchCode, data.organizationPosition, data.courtzonPosition,
        data.net, data.finalAmount, data.direction === 'ZERO_BALANCE' ? null : (data.direction === 'COURTZON_TO_ORGANIZATION' ? 'courtzon_to_org' : 'org_to_courtzon'),
        data.commissionAmount, data.notes ?? null,
      ],
    );
    return result.insertId;
  },

  async linkEntitlements(settlementId: number, entitlementIds: number[], conn?: mysql.PoolConnection): Promise<void> {
    if (!entitlementIds.length) return;
    const db = conn ?? getPool();
    const placeholders = entitlementIds.map(() => '(?, ?)').join(', ');
    const params: any[] = [];
    for (const id of entitlementIds) { params.push(settlementId, id); }
    // INSERT IGNORE: the uk_se_entitlement unique constraint prevents an
    // entitlement from being linked to a second settlement.
    await db.execute(
      `INSERT IGNORE INTO settlement_entitlements (settlement_id, entitlement_id)
       VALUES ${placeholders}`,
      params,
    );
  },

  async findEntitlementIds(settlementId: number, conn?: mysql.PoolConnection): Promise<number[]> {
    const db = conn ?? getPool();
    const [rows] = await db.execute<RowData>(
      'SELECT entitlement_id FROM settlement_entitlements WHERE settlement_id = ? ORDER BY id',
      [settlementId],
    );
    return rows.map((r: any) => r.entitlement_id);
  },

  async findBySettlementId(settlementId: number): Promise<any> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT s.*, o.name as organisation_name
       FROM settlements s
       JOIN organisations o ON o.id = s.organisation_id
       WHERE s.id = ?`,
      [settlementId],
    );
    return rows[0] || null;
  },

  async persistTransition(id: number, status: string, expectedVersion: number, extra?: Record<string, any>, conn?: mysql.PoolConnection): Promise<void> {
    const db = conn ?? getPool();
    const fields: string[] = ['settlement_status = ?', 'aggregate_version = aggregate_version + 1', 'updated_at = NOW()'];
    const params: any[] = [status];
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    }
    params.push(id, expectedVersion);
    const [result] = await db.execute<mysql.ResultSetHeader>(
      `UPDATE settlements SET ${fields.join(', ')} WHERE id = ? AND aggregate_version = ?`,
      params,
    );
    if (result.affectedRows === 0) {
      throw new ConflictError(`Settlement ${id} changed concurrently — please retry`);
    }
  },

  async findSettlements(filters: { status?: string; orgId?: number; orgIds?: number[]; batchCode?: string; page: number; limit: number }) {
    // An explicit empty org set means "no organisation is authorised" — an
    // empty result, never "all organisations". This is the tenant-isolation
    // boundary for non-platform users.
    if (filters.orgIds && filters.orgIds.length === 0) {
      const pag = buildPagination(filters.page, filters.limit);
      return { data: [], total: 0, page: pag.page, limit: pag.limit };
    }
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
    if (filters.batchCode) { conditions.push('s.batch_code = ?'); params.push(filters.batchCode); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRows] = await pool.execute<RowData>(`SELECT COUNT(*) as total FROM settlements s ${where}`, params);
    const total = Number((countRows[0] as any).total);

    const pag = buildPagination(filters.page, filters.limit);
    const [rows] = await pool.execute<RowData>(
      `SELECT s.*, o.name as organisation_name,
              (SELECT COUNT(*) FROM settlement_entitlements se WHERE se.settlement_id = s.id) as entitlement_count
       FROM settlements s
       JOIN organisations o ON o.id = s.organisation_id
       ${where}
       ORDER BY s.requested_at DESC${paginationClause(pag)}`,
      params,
    );
    return { data: rows, total, page: pag.page, limit: pag.limit };
  },
};