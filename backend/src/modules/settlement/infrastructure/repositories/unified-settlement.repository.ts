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
  grossAmount?: number;
  courtzonFee?: number;
  organizationNet?: number;
  onlineNetTotal?: number;
  codFeeTotal?: number;
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
         net_amount, final_amount, settlement_direction, commission_amount,
         gross_amount, courtzon_fee, organization_net, online_net_total, cod_fee_total,
         notes, requested_at, created_at)
       VALUES (?, ?, 'requested', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        data.organisationId, data.branchId, data.requestedBy, data.requestedByRole,
        data.settlementType, data.batchCode, data.organizationPosition, data.courtzonPosition,
        data.net, data.finalAmount, data.direction === 'ZERO_BALANCE' ? null : (data.direction === 'COURTZON_TO_ORGANIZATION' ? 'courtzon_to_org' : 'org_to_courtzon'),
        data.commissionAmount,
        data.grossAmount ?? null, data.courtzonFee ?? null, data.organizationNet ?? null,
        data.onlineNetTotal ?? null, data.codFeeTotal ?? null,
        data.notes ?? null,
      ],
    );
    return result.insertId;
  },

  /**
   * Link a settlement's reserved entitlements (its historical composition).
   *
   * After migration 207 the unique key is `(settlement_id, entitlement_id)`, so a
   * historical link left behind by a cancelled settlement no longer blocks
   * re-use. The ACTIVE reservation is authoritative in
   * `financial_entitlements.settlement_id` (set transactionally by
   * `reserveForSettlement`).
   *
   * This method therefore:
   *   0. verifies on the CALLER'S connection that every entitlement is reserved
   *      by THIS settlement (financial_entitlements.settlement_id = settlementId);
   *   1. refuses an entitlement that is STILL actively linked to another
   *      settlement (defence in depth against a reservation bypass);
   *   2. inserts only the missing pairs (idempotent for repeated calls);
   *   3. proves inside the caller's transaction that every requested entitlement
   *      is linked — any shortfall throws, so the settlement creation rolls back.
   *
   * Pre-207 the insert silently ignored the duplicate entitlement_id and the
   * settlement was committed with ZERO links (settlement 3713). That class of
   * silent partial create is what steps 0 and 3 make impossible.
   */
  async linkEntitlements(settlementId: number, entitlementIds: number[], conn?: mysql.PoolConnection): Promise<void> {
    if (!entitlementIds.length) return;
    const db = conn ?? getPool();
    const ids = [...new Set(entitlementIds.map(Number))];
    if (!ids.length) return;
    const placeholders = ids.map(() => '?').join(', ');

    // 0. The active reservation (financial_entitlements.settlement_id) must point
    //    at THIS settlement. reserveForSettlement() runs first in the create
    //    transaction, so a mismatch here means a missing, partially reserved or
    //    foreign reservation — never a legitimate link.
    const [reserved] = await db.execute<RowData>(
      `SELECT id, settlement_id
         FROM financial_entitlements
        WHERE id IN (${placeholders})`,
      ids,
    );
    if (reserved.length !== ids.length) {
      throw new ConflictError(
        `Cannot link entitlements to settlement ${settlementId}: ` +
          `${ids.length - reserved.length} entitlement(s) not found`,
      );
    }
    const wronglyReserved = reserved.filter(
      (row: any) => Number(row.settlement_id) !== settlementId,
    );
    if (wronglyReserved.length) {
      throw new ConflictError(
        `Cannot link entitlements to settlement ${settlementId}: ` +
          `${wronglyReserved.length} entitlement(s) are not reserved for this settlement`,
      );
    }

    // 1. An entitlement actively linked to a DIFFERENT settlement is a hard
    //    conflict. Historical links are identified by `financial_entitlements
    //    .settlement_id` no longer pointing at the linked settlement.
    const [conflicts] = await db.execute<RowData>(
      `SELECT se.entitlement_id, se.settlement_id
         FROM settlement_entitlements se
         JOIN financial_entitlements fe ON fe.id = se.entitlement_id
        WHERE se.entitlement_id IN (${placeholders})
          AND se.settlement_id <> ?
          AND fe.settlement_id = se.settlement_id`,
      [...ids, settlementId],
    );
    if (conflicts.length) {
      throw new ConflictError(
        `Cannot link entitlements to settlement ${settlementId}: ` +
          `${conflicts.length} entitlement(s) are still linked to another active settlement`,
      );
    }

    // 2. Insert only the missing pairs (same-pair re-linking stays idempotent).
    const values = ids.map(() => '(?, ?)').join(', ');
    const params: any[] = [];
    for (const id of ids) params.push(settlementId, id);
    await db.execute(
      `INSERT IGNORE INTO settlement_entitlements (settlement_id, entitlement_id)
       VALUES ${values}`,
      params,
    );

    // 3. Completeness proof: never commit a settlement with a short composition.
    const [linked] = await db.execute<RowData>(
      `SELECT COUNT(DISTINCT entitlement_id) AS cnt
         FROM settlement_entitlements
        WHERE settlement_id = ? AND entitlement_id IN (${placeholders})`,
      [settlementId, ...ids],
    );
    const linkedCount = Number((linked[0] as any)?.cnt ?? 0);
    if (linkedCount !== ids.length) {
      throw new ConflictError(
        `Settlement ${settlementId} is missing entitlement links ` +
          `(expected ${ids.length}, linked ${linkedCount}) — rolling back`,
      );
    }
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