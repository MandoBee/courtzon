import type mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { getPool } from '../../../../database/mysql.js';
import { buildPagination, paginationClause } from '../../../../shared/utils/pagination.js';
import { ConflictError } from '../../../../shared/errors/app-error.js';
import { aggregateVersionConflictsTotal } from '../../../../infrastructure/metrics/metrics.js';
import type { EntitlementRecord, EntitlementType, SourceType, EntitlementStatus, CreateEntitlementInput } from '../../domain/financial-entitlement-aggregate.js';

type RowData = mysql.RowDataPacket[];
type Executor = mysql.Pool | mysql.PoolConnection;

function resolvePool(conn?: mysql.PoolConnection): Executor {
  return conn ?? getPool();
}

export class EntitlementVersionConflict extends ConflictError {
  constructor(id: number, expectedVersion: number, actualVersion: number) {
    super(`Entitlement ${id} version conflict: expected ${expectedVersion}, actual ${actualVersion}`);
  }
}

function mapRow(row: any): EntitlementRecord {
  return {
    id: row.id,
    public_id: row.public_id,
    organisation_id: row.organisation_id,
    branch_id: row.branch_id,
    entitlement_type: row.entitlement_type,
    source_type: row.source_type,
    source_id: row.source_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    hold_reason: row.hold_reason,
    cancelled_reason: row.cancelled_reason,
    available_at: row.available_at,
    settled_at: row.settled_at,
    settled_by: row.settled_by,
    settlement_id: row.settlement_id,
    description: row.description,
    metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
    aggregate_version: row.aggregate_version,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const financialEntitlementRepository = {
  // ── Create ──

  async create(data: CreateEntitlementInput, conn?: mysql.PoolConnection): Promise<number> {
    const db = resolvePool(conn);
    const publicId = randomUUID();
    const [result] = await db.execute<mysql.ResultSetHeader>(
      `INSERT INTO financial_entitlements
        (public_id, organisation_id, branch_id, entitlement_type, source_type, source_id,
         amount, currency, status, available_at, description, metadata, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
      [
        publicId,
        data.organisationId,
        data.branchId ?? null,
        data.entitlementType,
        data.sourceType,
        data.sourceId ?? null,
        data.amount,
        data.currency ?? 'EGP',
        data.availableAt ?? null,
        data.description ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
        data.createdBy ?? null,
      ],
    );
    return result.insertId;
  },

  // ── Read ──

  async findById(id: number, conn?: mysql.PoolConnection): Promise<EntitlementRecord | null> {
    const db = resolvePool(conn);
    const [rows] = await db.execute<RowData>(
      'SELECT * FROM financial_entitlements WHERE id = ?',
      [id],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async findByPublicId(publicId: string): Promise<EntitlementRecord | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM financial_entitlements WHERE public_id = ?',
      [publicId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async findBySource(sourceType: SourceType, sourceId: number): Promise<EntitlementRecord[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM financial_entitlements WHERE source_type = ? AND source_id = ? ORDER BY id',
      [sourceType, sourceId],
    );
    return rows.map(mapRow);
  },

  async findByOrganisation(filters: {
    orgId: number;
    status?: EntitlementStatus;
    entitlementType?: EntitlementType;
    page: number;
    limit: number;
  }): Promise<{ data: EntitlementRecord[]; total: number; page: number; limit: number }> {
    const pool = getPool();
    const conditions: string[] = ['organisation_id = ?'];
    const params: any[] = [filters.orgId];

    if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
    if (filters.entitlementType) { conditions.push('entitlement_type = ?'); params.push(filters.entitlementType); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [countRows] = await pool.execute<RowData>(
      `SELECT COUNT(*) as total FROM financial_entitlements ${where}`,
      params,
    );
    const total = (countRows[0] as any).total;

    const pag = buildPagination(filters.page, filters.limit);
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM financial_entitlements ${where} ORDER BY created_at DESC${paginationClause(pag)}`,
      params,
    );

    return { data: rows.map(mapRow), total, page: pag.page, limit: pag.limit };
  },

  async findPendingForActivation(batchSize: number = 200): Promise<EntitlementRecord[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM financial_entitlements
       WHERE status = 'PENDING'
         AND (available_at IS NULL OR available_at <= NOW())
       ORDER BY created_at ASC
       LIMIT ?`,
      [batchSize],
    );
    return rows.map(mapRow);
  },

  async sumByOrganisation(orgId: number, status: EntitlementStatus): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM financial_entitlements
       WHERE organisation_id = ? AND status = ?`,
      [orgId, status],
    );
    return Number((rows[0] as any).total);
  },

  // ── Update with optimistic locking ──

  async persistTransition(
    id: number,
    status: EntitlementStatus,
    expectedVersion: number,
    extra?: Record<string, any>,
    conn?: mysql.PoolConnection,
  ): Promise<void> {
    const db = resolvePool(conn);
    const fields: string[] = ['status = ?', 'aggregate_version = aggregate_version + 1'];
    const params: any[] = [status];

    if (status === 'AVAILABLE') { fields.push('available_at = NOW()'); }
    if (status === 'SETTLED') { fields.push('settled_at = NOW()'); }

    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    }

    params.push(id, expectedVersion);
    const [result] = await db.execute<mysql.ResultSetHeader>(
      `UPDATE financial_entitlements SET ${fields.join(', ')} WHERE id = ? AND aggregate_version = ?`,
      params,
    );

    if (result.affectedRows === 0) {
      const [rows] = await db.execute<RowData>(
        'SELECT aggregate_version, status FROM financial_entitlements WHERE id = ?',
        [id],
      );
      const actual = (rows[0] as any);
      aggregateVersionConflictsTotal.inc({ aggregate_type: 'financial_entitlement' });
      throw new EntitlementVersionConflict(id, expectedVersion, actual?.aggregate_version ?? 0);
    }
  },

  // ── Bulk ──

  async batchActivate(ids: number[]): Promise<number> {
    if (!ids.length) return 0;
    const pool = getPool();
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `UPDATE financial_entitlements
       SET status = 'AVAILABLE', available_at = NOW(), aggregate_version = aggregate_version + 1
       WHERE id IN (${placeholders}) AND status = 'PENDING'`,
      ids,
    );
    return result.affectedRows;
  },

  // ── Settlement linkage ──

  async linkToSettlement(ids: number[], settlementId: number): Promise<void> {
    if (!ids.length) return;
    const pool = getPool();
    const placeholders = ids.map(() => '?').join(',');
    await pool.execute(
      `UPDATE financial_entitlements SET settlement_id = ? WHERE id IN (${placeholders})`,
      [settlementId, ...ids],
    );
  },

  async findBySettlement(settlementId: number): Promise<EntitlementRecord[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM financial_entitlements WHERE settlement_id = ? ORDER BY id',
      [settlementId],
    );
    return rows.map(mapRow);
  },
};
