import type mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { getPool } from '../../../../database/mysql.js';

/**
 * Position repository — the ONLY data access layer for organisation/seller
 * financial positions (Phase 2 Step 1).
 *
 * SINGLE AUTHORITY RULE: every query here reads exclusively from
 * `financial_entitlements`. No GL tables, no bookings columns, no orders
 * financial columns, no marketplace_ledger_entries. The GL is compared
 * against these positions only by ReconciliationService (read-only).
 */
type RowData = RowDataPacket[];

export interface StatusBalanceRow {
  status: string;
  isReserved: number;
  cnt: number;
  total: string;
}

export interface CollectorBreakdownRow {
  entitlementType: string;
  collector: 'courtzon' | 'org' | null;
  status: string;
  total: string;
}

export interface OpenPositionRow {
  id: number;
  public_id: string;
  entitlement_type: string;
  collector: 'courtzon' | 'org' | null;
  status: string;
  source_type: string;
  source_id: number;
  branch_id: number | null;
  amount: string;
  currency: string;
  created_at: Date;
  available_at: Date | null;
}

/** OPEN statuses = positions not yet settled and not reversed. */
export const OPEN_POSITION_STATUSES = ['PENDING', 'AVAILABLE', 'ON_HOLD'];

export const positionRepository = {
  /** Bucketed balances by status (+ reserved split inside ON_HOLD). */
  async statusBalances(orgId: number): Promise<StatusBalanceRow[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT status,
              (settlement_id IS NOT NULL) AS isReserved,
              COUNT(*) AS cnt,
              COALESCE(SUM(amount), 0) AS total
       FROM financial_entitlements
       WHERE organisation_id = ? AND status <> 'CANCELLED'
       GROUP BY status, (settlement_id IS NOT NULL)
       ORDER BY status`,
      [orgId],
    );
    return rows as unknown as StatusBalanceRow[];
  },

  /** Signed totals grouped by entitlement_type × collector × status. */
  async collectorBreakdown(orgId: number, statuses?: string[]): Promise<CollectorBreakdownRow[]> {
    const pool = getPool();
    const statusFilter = statuses?.length
      ? `AND status IN (${statuses.map(() => '?').join(', ')})`
      : '';
    const params: any[] = [orgId, ...(statuses ?? [])];
    const [rows] = await pool.execute<RowData>(
      `SELECT entitlement_type AS entitlementType,
              collector,
              status,
              COALESCE(SUM(amount), 0) AS total
       FROM financial_entitlements
       WHERE organisation_id = ? ${statusFilter}
       GROUP BY entitlement_type, collector, status
       ORDER BY entitlement_type, collector`,
      params,
    );
    return rows as unknown as CollectorBreakdownRow[];
  },

  /** Open (unsettled, unreversed) position detail rows for an organisation. */
  async openPositions(orgId: number): Promise<OpenPositionRow[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT id, public_id, entitlement_type, collector, status,
              source_type, source_id, branch_id, amount, currency,
              created_at, available_at
       FROM financial_entitlements
       WHERE organisation_id = ?
         AND status IN ('PENDING', 'AVAILABLE', 'ON_HOLD')
       ORDER BY id`,
      [orgId],
    );
    return rows as unknown as OpenPositionRow[];
  },

  async openPositionCount(orgId: number): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM financial_entitlements
       WHERE organisation_id = ?
         AND status IN ('PENDING', 'AVAILABLE', 'ON_HOLD')`,
      [orgId],
    );
    return Number((rows as any[])[0]?.cnt ?? 0);
  },

  /** Org ids with ANY entitlement rows (for reconciliation universe). */
  async openPositionsOrgIds(): Promise<number[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT DISTINCT organisation_id AS organisationId
       FROM financial_entitlements WHERE organisation_id IS NOT NULL`,
    );
    return (rows as any[]).map((r) => Number(r.organisationId));
  },
};
