import { getPool } from '../../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { LedgerEntry, RevenueSummary } from '../../domain/ledger-aggregate.js';
import { buildRevenueSummary } from '../../domain/ledger-aggregate.js';

type RowData = RowDataPacket[];

export class LedgerRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async createEntries(entries: LedgerEntry[], conn?: mysql.PoolConnection): Promise<number[]> {
    const db = conn ?? this.pool;
    const ids: number[] = [];
    for (const entry of entries) {
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        [entry.transactionId, entry.sourceType, entry.sourceId,
         entry.eventType ?? null, entry.periodId ?? null,
         entry.organisationId ?? null, entry.chartAccountId ?? null,
         entry.side, entry.amount, entry.currency,
         entry.description, entry.referenceId || null, entry.recordedAt],
      );
      ids.push(result.insertId);
    }
    return ids;
  }

  async findBySource(sourceType: string, sourceId: number): Promise<LedgerEntry[]> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM ledger_entries WHERE source_type = ? AND source_id = ? ORDER BY id',
      [sourceType, sourceId],
    );
    return rows as LedgerEntry[];
  }

  /**
   * Idempotency check: returns true if an accounting posting already exists
   * for this (source_type, source_id, event_type) identity.
   */
  async hasPosting(sourceType: string, sourceId: number, eventType: string): Promise<boolean> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT 1 FROM ledger_entries WHERE source_type = ? AND source_id = ? AND event_type = ? LIMIT 1',
      [sourceType, sourceId, eventType],
    );
    return (rows as any[]).length > 0;
  }

  async findByDateRange(from: string, to: string, accountType?: string): Promise<LedgerEntry[]> {
    let sql = 'SELECT * FROM ledger_entries WHERE recorded_at >= ? AND recorded_at <= ?';
    const params: any[] = [from, to];
    if (accountType) { sql += ' AND account_type = ?'; params.push(accountType); }
    sql += ' ORDER BY id';
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return rows as LedgerEntry[];
  }

  async getRevenueSummary(from: string, to: string): Promise<RevenueSummary> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT coa.type AS account_type, le.side, SUM(le.amount) as total, COUNT(*) as count
       FROM ledger_entries le
       JOIN chart_of_accounts coa ON coa.id = le.chart_account_id
       WHERE le.recorded_at >= ? AND le.recorded_at <= ?
       GROUP BY coa.type, le.side
       ORDER BY coa.type`,
      [from, to],
    );
    return buildRevenueSummary(rows as unknown as Array<{ account_type: string; side: string; total: number | string; count: number | string }>);
  }
}

export const ledgerRepository = new LedgerRepository();
