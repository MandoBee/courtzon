import { getPool } from '../../../../database/mysql.js';
import type mysql from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { LedgerEntry, SettlementBatch } from '../../domain/ledger-aggregate.js';

type RowData = RowDataPacket[];

export class LedgerRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async createEntries(entries: LedgerEntry[]): Promise<void> {
    for (const entry of entries) {
      await this.pool.execute<ResultSetHeader>(
        `INSERT INTO ledger_entries (transaction_id, source_type, source_id, account_type, side, amount, currency, description, reference_id, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [entry.transactionId, entry.sourceType, entry.sourceId, entry.accountType,
         entry.side, entry.amount, entry.currency, entry.description, entry.referenceId || null, entry.recordedAt],
      );
    }
  }

  async findBySource(sourceType: string, sourceId: number): Promise<LedgerEntry[]> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT * FROM ledger_entries WHERE source_type = ? AND source_id = ? ORDER BY id',
      [sourceType, sourceId],
    );
    return rows as LedgerEntry[];
  }

  async findByDateRange(from: string, to: string, accountType?: string): Promise<LedgerEntry[]> {
    let sql = 'SELECT * FROM ledger_entries WHERE recorded_at >= ? AND recorded_at <= ?';
    const params: any[] = [from, to];
    if (accountType) { sql += ' AND account_type = ?'; params.push(accountType); }
    sql += ' ORDER BY id';
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return rows as LedgerEntry[];
  }

  async getRevenueSummary(from: string, to: string): Promise<any> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT account_type, side, SUM(amount) as total, COUNT(*) as count
       FROM ledger_entries
       WHERE recorded_at >= ? AND recorded_at <= ?
       GROUP BY account_type, side
       ORDER BY account_type`,
      [from, to],
    );
    return rows;
  }

  async createSettlementBatch(batch: SettlementBatch): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO settlement_batches (batch_type, period_start, period_end, gross_amount, discount_amount, tax_amount, commission_amount, refund_amount, net_amount, status, organisation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [batch.batchType, batch.periodStart, batch.periodEnd, batch.grossAmount,
       batch.discountAmount, batch.taxAmount, batch.commissionAmount, batch.refundAmount,
       batch.netAmount, batch.status || 'pending', batch.organisationId || null],
    );
    return result.insertId;
  }

  async findSettlementBatches(filters?: { status?: string; from?: string; to?: string }): Promise<SettlementBatch[]> {
    let sql = 'SELECT * FROM settlement_batches WHERE 1=1';
    const params: any[] = [];
    if (filters?.status) { sql += ' AND status = ?'; params.push(filters.status); }
    if (filters?.from) { sql += ' AND period_end >= ?'; params.push(filters.from); }
    if (filters?.to) { sql += ' AND period_start <= ?'; params.push(filters.to); }
    sql += ' ORDER BY period_end DESC';
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return rows as SettlementBatch[];
  }

  async updateSettlementStatus(id: number, status: string): Promise<void> {
    await this.pool.execute('UPDATE settlement_batches SET status = ? WHERE id = ?', [status, id]);
  }
}

export const ledgerRepository = new LedgerRepository();
