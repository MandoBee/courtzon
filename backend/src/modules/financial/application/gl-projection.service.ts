import type mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('gl-projection');
type RowData = RowDataPacket[];

export interface ProjectableEntry {
  sourceType: string;
  sourceId: number;
  eventType?: string | null;
  organisationId?: number | null;
  chartAccountId: number | null;
  side: 'debit' | 'credit';
  amount: number;
  description?: string;
  recordedAt: string;
  ledgerEntryId: number;
}

export class GlProjectionService {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async resolvePeriod(entryDate: string, organisationId: number | null): Promise<number> {
    let [periods] = await this.pool.execute<RowData>(
      `SELECT id FROM accounting_periods WHERE ? BETWEEN start_date AND end_date AND status = 'open' LIMIT 1`,
      [entryDate],
    );
    if (periods.length === 0 && organisationId != null) {
      [periods] = await this.pool.execute<RowData>(
        `SELECT id FROM accounting_periods WHERE ? BETWEEN start_date AND end_date AND status = 'open' AND organisation_id = ? LIMIT 1`,
        [entryDate, organisationId],
      );
    }
    if (periods.length === 0) {
      [periods] = await this.pool.execute<RowData>(
        `SELECT id FROM accounting_periods WHERE ? BETWEEN start_date AND end_date LIMIT 1`,
        [entryDate],
      );
    }
    if (periods.length === 0) {
      throw new Error(`No accounting period found for date ${entryDate}`);
    }
    return (periods as any[])[0].id;
  }

  validateOpenPeriod(periodId: number): Promise<void> {
    return this.pool.execute<RowData>(
      `SELECT 1 FROM accounting_periods WHERE id = ? AND status = 'open' LIMIT 1`,
      [periodId],
    ).then(([rows]) => {
      if (!(rows as any[]).length) {
        throw new Error(`Accounting period ${periodId} is not open`);
      }
    });
  }

  async projectEntries(
    entries: ProjectableEntry[],
    periodId: number,
    conn: mysql.PoolConnection,
  ): Promise<void> {
    for (const entry of entries) {
      const debit = entry.side === 'debit' ? entry.amount : 0;
      const credit = entry.side === 'credit' ? entry.amount : 0;
      const entryDate = entry.recordedAt.slice(0, 10);
      const refType = `${entry.sourceType}${entry.eventType ? `_${entry.eventType}` : ''}`;

      await conn.execute(
        `INSERT INTO general_ledger (ledger_entry_id, organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1)`,
        [
          entry.ledgerEntryId,
          entry.organisationId ?? null,
          periodId,
          entry.chartAccountId ?? 0,
          entryDate,
          debit,
          credit,
          refType,
          entry.sourceId,
          entry.description || '',
        ],
      );
    }
    log.info({ entries: entries.length, periodId }, 'GL projection completed');
  }
}

export const glProjectionService = new GlProjectionService();
