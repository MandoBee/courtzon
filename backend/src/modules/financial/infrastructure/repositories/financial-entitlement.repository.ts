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
    collector: row.collector ?? null,
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
         collector, amount, currency, status, available_at, description, metadata, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
      [
        publicId,
        data.organisationId,
        data.branchId ?? null,
        data.entitlementType,
        data.sourceType,
        data.sourceId ?? null,
        data.collector ?? null,
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
    const safeBatch = Math.max(1, Math.floor(Number(batchSize) || 200));
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM financial_entitlements
       WHERE status = 'PENDING'
         AND (available_at IS NULL OR available_at <= NOW())
         -- Marketplace entitlements are activated by the complaint-period worker
         -- (after delivered_at + complaint window), never by the generic worker.
         AND NOT (source_type = 'marketplace' AND available_at IS NULL)
         -- G11.4: tournament entitlements have their OWN release conditions — a
         -- CARD registration is only releasable after its backing payment was
         -- gateway-settled, a CASH registration only once the current draw is
         -- locked. Their available_at is NULL (not "immediate"), so the generic
         -- worker would otherwise qualify them on the very next run and release
         -- funds CourtZon does not hold yet. They are excluded here and are
         -- activated exclusively by the tournament activation worker.
         AND source_type <> 'tournament'
       ORDER BY created_at ASC
       LIMIT ${safeBatch}`,
    );
    return rows.map(mapRow);
  },

  /**
   * G11.4 — tournament entitlements that are still PENDING AND whose business
   * release condition is already satisfied.
   *
   * CARD: the backing payment must own an ACTIVE gateway settlement
   * (`payment_transactions.gateway_settlement_id IS NOT NULL`, i.e. the funds
   * actually moved from 1100 Payment Clearing into 1120 Cash/Bank). "Customer
   * paid" is deliberately NOT enough — Customer Paid ≠ Gateway Settled, and
   * paying the organisation before the funds arrive would overdraw the bank leg.
   *
   * CASH: the organisation already holds the money (G11.2), so the only release
   * condition is the tournament's CURRENT draw reaching `locked`
   * (`is_current = 1 AND status = 'locked'`) — the same authoritative "refunds
   * are closed" state G11.3 uses as its refund cutoff. Cash never depends on the
   * gateway, and the EXISTS makes a tournament with no current locked draw fail
   * closed (the entitlement simply stays PENDING).
   *
   * The payment method is read from the entitlement's own immutable metadata
   * snapshot, so an upstream change can never silently re-route an
   * already-created entitlement.
   */
  async findPendingTournamentDueForActivation(
    paymentMethod: 'card' | 'cash',
    batchSize: number = 200,
  ): Promise<EntitlementRecord[]> {
    const pool = getPool();
    const safeBatch = Math.max(1, Math.floor(Number(batchSize) || 200));
    const method = paymentMethod === 'cash' ? 'cash' : 'card';
    const releaseCondition = method === 'cash'
      ? `AND EXISTS (
           SELECT 1
           FROM tournament_registrations tr
           JOIN tournaments t ON t.id = tr.tournament_id
           JOIN tournament_draws d ON d.tournament_id = t.id AND d.is_current = 1
           WHERE tr.id = fe.source_id AND d.status = 'locked'
         )`
      : `AND EXISTS (
           SELECT 1
           FROM payment_transactions pt
           WHERE pt.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(fe.metadata, '$.paymentId')) AS UNSIGNED)
             AND pt.payment_status = 'paid'
             AND pt.gateway_settlement_id IS NOT NULL
         )`;
    const [rows] = await pool.execute<RowData>(
      `SELECT fe.*
       FROM financial_entitlements fe
       WHERE fe.source_type = 'tournament'
         AND fe.status = 'PENDING'
         AND JSON_UNQUOTE(JSON_EXTRACT(fe.metadata, '$.paymentMethod')) = ?
         ${releaseCondition}
       ORDER BY fe.created_at ASC
       LIMIT ${safeBatch}`,
      [method],
    );
    return rows.map(mapRow);
  },

  /**
   * Marketplace entitlements that are still PENDING whose delivery complaint
   * window has passed. Joins financial_entitlements → order_items → orders so
   * activation happens only after actual delivery + complaint_period_days.
   */
  async findPendingMarketplaceDueForActivation(periodDays: number, batchSize: number = 200): Promise<EntitlementRecord[]> {
    const pool = getPool();
    const safePeriod = Math.max(0, Math.floor(Number(periodDays) || 0));
    const safeBatch = Math.max(1, Math.floor(Number(batchSize) || 200));
    const [rows] = await pool.execute<RowData>(
      `SELECT fe.*
       FROM financial_entitlements fe
       JOIN order_items oi ON fe.source_type = 'marketplace' AND oi.id = fe.source_id
       JOIN orders o ON o.id = oi.order_id
       WHERE fe.status = 'PENDING'
         AND o.status = 'delivered'
         AND o.delivered_at IS NOT NULL
         AND (o.delivered_at + INTERVAL ${safePeriod} DAY) <= NOW()
       ORDER BY fe.created_at ASC
       LIMIT ${safeBatch}`,
    );
    return rows.map(mapRow);
  },

  async findBySourceIds(sourceType: SourceType, sourceIds: number[]): Promise<EntitlementRecord[]> {
    if (!sourceIds.length) return [];
    const pool = getPool();
    const placeholders = sourceIds.map(() => '?').join(',');
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM financial_entitlements
       WHERE source_type = ? AND source_id IN (${placeholders})
       ORDER BY id`,
      [sourceType, ...sourceIds],
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

  async findBySettlement(settlementId: number): Promise<EntitlementRecord[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM financial_entitlements WHERE settlement_id = ? ORDER BY id',
      [settlementId],
    );
    return rows.map(mapRow);
  },

  /**
   * All AVAILABLE entitlements for an organisation that are not yet reserved for
   * any settlement (settlement_id IS NULL). These are the eligible pool for a
   * unified settlement.
   *
   * GATEWAY-SETTLEMENT ELIGIBILITY:
   *   Customer Paid ≠ Gateway Settled ≠ Seller Settled. An entitlement backed by
   *   a card/online payment is only eligible for seller settlement once the
   *   gateway funds have actually been settled to CourtZon (i.e. no outstanding
   *   paid card/online payment for the underlying order is still sitting in
   *   Payment Clearing). Cash/COD (collector=org) and wallet payments are not
   *   subject to this check — the seller collected the cash directly, and wallet
   *   funds are already held by CourtZon (never in 1100 clearing).
   *
   * G11.4 — TOURNAMENT entitlements carry no `orderId` (their source is
   * tournament_registrations), so the marketplace gate above silently let every
   * tournament entitlement through. They now get their OWN gate keyed on the
   * `metadata.paymentId` snapshot taken at entitlement creation: a tournament CARD
   * entitlement is settlement-eligible only while its backing payment is still
   * gateway-settled (`gateway_settlement_id IS NOT NULL`). A CASH tournament
   * entitlement never matches the card/online method list, so it is never blocked
   * by the gateway (CourtZon does not hold that cash and must never wait for a
   * gateway batch that will not exist). The marketplace orderId logic is
   * untouched.
   */
  async findAvailableForOrganisation(orgId: number): Promise<EntitlementRecord[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT fe.* FROM financial_entitlements fe
       WHERE fe.organisation_id = ?
         AND fe.status = 'AVAILABLE'
         AND fe.settlement_id IS NULL
         AND NOT EXISTS (
           SELECT 1
           FROM orders o
           JOIN payment_transactions pt ON pt.order_id = o.id
           WHERE o.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(fe.metadata, '$.orderId')) AS UNSIGNED)
             AND pt.payment_status = 'paid'
             AND pt.payment_method IN ('card','online')
             AND pt.gateway_settlement_id IS NULL
         )
         AND NOT (
           fe.source_type = 'tournament'
           AND EXISTS (
             SELECT 1
             FROM payment_transactions pt
             WHERE pt.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(fe.metadata, '$.paymentId')) AS UNSIGNED)
               AND pt.payment_method IN ('card','online')
               AND pt.gateway_settlement_id IS NULL
           )
         )
       ORDER BY fe.id`,
      [orgId],
    );
    return rows.map(mapRow);
  },
};
