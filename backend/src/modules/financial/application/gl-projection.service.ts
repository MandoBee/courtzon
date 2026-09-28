import type mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('gl-projection');
type RowData = RowDataPacket[];

/**
 * `general_ledger.reference_type` is `VARCHAR(50)` (indexed by `idx_reference`,
 * but NOT unique — so shortening a value can never collide with another row's
 * key). The natural forensic key is `<source_type>_<event_type>`, and every
 * existing posting in the system already fits inside 50 characters.
 *
 * Long event types are legitimate and unavoidable — e.g. G11.4's
 * `tournament_registration_card_refund_settled` composes to 53 characters.
 * Without a guard here, MySQL rejects the INSERT with ER_DATA_TOO_LONG and the
 * ENTIRE journal fails to project to the GL, silently losing a balanced,
 * already-validated accounting entry.
 *
 * Resolution order (only ever engaged when the composed key does NOT fit, so
 * behaviour for every currently-valid event type is byte-for-byte unchanged):
 *   1. the composed `<source_type>_<event_type>` key;
 *   2. the event type alone — it is the most specific part of the key, and since
 *      the dropped prefix is always the same source type it stays unambiguous
 *      for a given event type;
 *   3. a hard truncation of the event type, which is logged so the loss of
 *      forensic detail is always observable rather than silent.
 */
const GL_REFERENCE_TYPE_MAX = 50;

function buildReferenceType(sourceType: string, eventType?: string | null): string {
  const src = String(sourceType ?? '');
  const evt = eventType ? String(eventType) : '';
  const composed = evt ? `${src}_${evt}` : src;
  if (composed.length <= GL_REFERENCE_TYPE_MAX) return composed;

  if (evt && evt.length <= GL_REFERENCE_TYPE_MAX) {
    log.warn(
      { sourceType: src, eventType: evt, composedLength: composed.length, max: GL_REFERENCE_TYPE_MAX },
      'GL reference_type composite exceeded the column width — using the event type alone',
    );
    return evt;
  }

  log.error(
    { sourceType: src, eventType: evt, max: GL_REFERENCE_TYPE_MAX },
    'GL reference_type exceeded the column width even without the source type — truncating (forensic detail lost)',
  );
  return (evt || src).slice(0, GL_REFERENCE_TYPE_MAX);
}

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
      const refType = buildReferenceType(entry.sourceType, entry.eventType);

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
