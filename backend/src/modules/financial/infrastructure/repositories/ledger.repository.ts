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

  /**
   * Canonical ledger read — the CourtZon GL book.
   *
   * Reads from `general_ledger` joined with `chart_of_accounts` (the same
   * canonical source used by the Accounting module's trial balance / income
   * statement / journal). The old `ledger_entries.account_type` filter is
   * replaced by the COA relationship: filter by `chart_of_accounts.code`
   * (e.g. "2100") or `chart_of_accounts.type` (e.g. "liability").
   */
  async findByDateRange(from: string, to: string, filter?: { accountCode?: string; accountType?: string }): Promise<any[]> {
    let sql = `SELECT gl.id, gl.ledger_entry_id, gl.organisation_id, gl.period_id,
                      gl.account_id, gl.entry_date, gl.debit, gl.credit, gl.balance,
                      gl.reference_type AS source_type, gl.reference_id AS source_id,
                      gl.description, gl.created_at,
                      coa.code AS account_code, coa.name AS account_name, coa.type AS account_type
               FROM general_ledger gl
               JOIN chart_of_accounts coa ON coa.id = gl.account_id
               WHERE gl.entry_date >= ? AND gl.entry_date <= ?`;
    const params: any[] = [from, to];
    if (filter?.accountCode) { sql += ' AND coa.code = ?'; params.push(filter.accountCode); }
    if (filter?.accountType) { sql += ' AND coa.type = ?'; params.push(filter.accountType); }
    sql += ' ORDER BY gl.entry_date DESC, gl.id DESC';
    const [rows] = await this.pool.execute<RowData>(sql, params);
    return (rows as any[]).map((r: any) => {
      const debit = Number(r.debit || 0);
      const credit = Number(r.credit || 0);
      return {
        id: r.id,
        ledger_entry_id: r.ledger_entry_id,
        recorded_at: r.created_at,
        entry_date: r.entry_date,
        transaction_id: r.ledger_entry_id,
        source_type: r.source_type,
        source_id: r.source_id,
        account_type: r.account_type,
        account_code: r.account_code,
        account_name: r.account_name,
        side: debit > 0 ? 'debit' : 'credit',
        amount: debit > 0 ? debit : credit,
        debit,
        credit,
        balance: Number(r.balance || 0),
        organisation_id: r.organisation_id,
        period_id: r.period_id,
        account_id: r.account_id,
        description: r.description,
      };
    });
  }

  /**
   * Canonical revenue summary — from `general_ledger` + `chart_of_accounts`.
   * Groups by COA type and side (debit/credit), same classification logic as
   * the Accounting module's income statement.
   */
  async getRevenueSummary(from: string, to: string): Promise<RevenueSummary> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT coa.type AS account_type, gl.debit, gl.credit
       FROM general_ledger gl
       JOIN chart_of_accounts coa ON coa.id = gl.account_id
       WHERE gl.entry_date >= ? AND gl.entry_date <= ?`,
      [from, to],
    );
    const grouped = new Map<string, { credit: number; debit: number; count: number }>();
    for (const r of rows as any[]) {
      const key = r.account_type;
      if (!grouped.has(key)) grouped.set(key, { credit: 0, debit: 0, count: 0 });
      const g = grouped.get(key)!;
      g.credit += Number(r.credit || 0);
      g.debit += Number(r.debit || 0);
      g.count += 1;
    }
    const groups = [...grouped.entries()].flatMap(([accountType, g]) => {
      const out: Array<{ account_type: string; side: string; total: number; count: number }> = [];
      if (g.credit > 0) out.push({ account_type: accountType, side: 'credit', total: g.credit, count: g.count });
      if (g.debit > 0) out.push({ account_type: accountType, side: 'debit', total: g.debit, count: g.count });
      return out;
    });
    return buildRevenueSummary(groups);
  }
}

export const ledgerRepository = new LedgerRepository();