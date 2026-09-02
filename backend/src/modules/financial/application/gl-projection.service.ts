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

  /**
   * Resolve the posting period for a business date, organisation-scoped.
   *
   * Rules (single source of truth for every posting path — automatic and manual):
   * - When an organisation is set, the org's OWN period covering the date is
   *   authoritative. It is returned even when closed so the caller can reject
   *   posting with the proper error — a closed/locked org period must never
   *   accept a posting.
   * - When the org has no period for that date, fall back to the platform
   *   period (organisation_id NULL, open preferred) for backward compatibility
   *   with orgs that have not generated their own periods yet.
   * - Platform postings (organisationId null) use the platform period only.
   * - Another organisation's period is NEVER returned (org isolation).
   */
  async resolvePostingPeriod(entryDate: string, organisationId: number | null): Promise<{ id: number; status: string }> {
    if (organisationId != null) {
      const [orgPeriods] = await this.pool.execute<RowData>(
        `SELECT id, status FROM accounting_periods WHERE ? BETWEEN start_date AND end_date AND organisation_id = ? LIMIT 1`,
        [entryDate, organisationId],
      );
      if (orgPeriods.length) {
        return { id: (orgPeriods as any[])[0].id, status: (orgPeriods as any[])[0].status };
      }
    }
    // Platform period (open preferred; a closed platform period is returned so
    // the caller can reject posting with a meaningful error).
    const [platformPeriods] = await this.pool.execute<RowData>(
      `SELECT id, status FROM accounting_periods
       WHERE ? BETWEEN start_date AND end_date AND organisation_id IS NULL
       ORDER BY (status = 'open') DESC, id ASC LIMIT 1`,
      [entryDate],
    );
    if (platformPeriods.length) {
      return { id: (platformPeriods as any[])[0].id, status: (platformPeriods as any[])[0].status };
    }
    throw new Error(`No accounting period found for date ${entryDate}`);
  }

  async resolvePeriod(entryDate: string, organisationId: number | null): Promise<number> {
    const period = await this.resolvePostingPeriod(entryDate, organisationId);
    if (period.status !== 'open') {
      throw new Error(`Accounting period ${period.id} is not open`);
    }
    return period.id;
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
