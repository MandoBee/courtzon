import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import type mysql from 'mysql2/promise';
import { getEventConcepts, validateCompleteMapping } from './accounting-concepts.js';
import type { AccountingConcept } from './accounting-concepts.js';
import { coaValidator, MAX_COA_DEPTH, POSTABLE_LEVEL } from './coa-validator.service.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('accounting-engine');

type RowData = RowDataPacket[];

export interface MappingLine {
  concept: string;
  accountId: number;
}

export interface ResolvedConcept {
  concept: string;
  side: 'debit' | 'credit';
  accountId: number;
  amount: number;
}

export class AccountingEngineService {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  /**
   * Resolve the mapping for an event_type + organisation_id.
   * Returns the set of {concept, accountId} lines.
   * Complete-override model: org rows replace global rows entirely.
   */
  async resolveMapping(eventType: string, organisationId: number | null): Promise<MappingLine[]> {
    let rows: RowData;

    if (organisationId != null) {
      [rows] = await this.pool.execute<RowData>(
        `SELECT concept, account_id AS accountId
         FROM accounting_event_mapping_lines
         WHERE event_type = ? AND organisation_id = ? AND is_active = 1
         ORDER BY concept`,
        [eventType, organisationId],
      );
      if ((rows as any[]).length > 0) {
        return this.validateAndReturn(eventType, rows as any[], organisationId);
      }
      log.info({ eventType, organisationId }, 'No org override — falling back to global mapping');
    }

    [rows] = await this.pool.execute<RowData>(
      `SELECT concept, account_id AS accountId
       FROM accounting_event_mapping_lines
       WHERE event_type = ? AND organisation_id IS NULL AND is_active = 1
       ORDER BY concept`,
      [eventType],
    );
    return this.validateAndReturn(eventType, rows as any[], organisationId);
  }

  private validateAndReturn(
    eventType: string,
    rows: { concept: string; accountId: number }[],
    organisationId: number | null,
  ): MappingLine[] {
    if (rows.length === 0) {
      throw new Error(`No mapping found for event_type='${eventType}', org_id=${organisationId ?? 'NULL'}`);
    }

    const mappedConcepts = rows.map(r => r.concept);
    const missing = validateCompleteMapping(eventType, mappedConcepts);
    if (missing.length > 0) {
      throw new Error(
        `Incomplete mapping for event_type='${eventType}', org_id=${organisationId ?? 'NULL'}. Missing concepts: ${missing.join(', ')}`,
      );
    }

    return rows;
  }

  /**
   * Validate that all mapped accounts exist, are active, and are in scope
   */
  async validateAccounts(accountIds: number[], organisationId: number | null): Promise<void> {
    if (accountIds.length === 0) return;

    const ids = [...new Set(accountIds)];
    const placeholders = ids.map(() => '?').join(',');

    const [rows] = await this.pool.execute<RowData>(
      `SELECT id, is_active, organisation_id
       FROM chart_of_accounts
       WHERE id IN (${placeholders})`,
      ids,
    );

    const found = new Set((rows as any[]).map((r: any) => r.id));
    for (const id of ids) {
      if (!found.has(id)) {
        throw new Error(`Chart account ${id} does not exist`);
      }
    }

    for (const row of rows as any[]) {
      if (!row.is_active) {
        throw new Error(`Chart account ${row.id} is inactive`);
      }
      if (organisationId != null && row.organisation_id != null && row.organisation_id !== organisationId) {
        throw new Error(`Chart account ${row.id} belongs to org ${row.organisation_id}, not org ${organisationId}`);
      }
    }

    // Validate all accounts are L4 postable (replaces manual child-check)
    for (const id of ids) {
      await coaValidator.validatePostable(id, 'Accounting Engine');
    }
  }

  /**
   * Build resolved ledger lines from mapping + concept amounts.
   * Merges lines with the same (side, accountId).
   */
  buildLedgerLines(
    eventType: string,
    mapping: MappingLine[],
    conceptAmounts: Record<string, number>,
  ): ResolvedConcept[] {
    const concepts = getEventConcepts(eventType);
    const conceptMap = new Map(concepts.map(c => [c.concept, c]));
    const mappingMap = new Map(mapping.map(m => [m.concept, m.accountId]));

    const lines: { side: 'debit' | 'credit'; accountId: number; amount: number }[] = [];

    for (const [conceptName, amount] of Object.entries(conceptAmounts)) {
      if (amount === 0) continue;
      if (amount < 0) throw new Error(`Negative amount for concept '${conceptName}': ${amount}`);

      const conceptDef = conceptMap.get(conceptName);
      if (!conceptDef) {
        throw new Error(`Unknown concept '${conceptName}' for event_type '${eventType}'`);
      }

      const accountId = mappingMap.get(conceptName);
      if (accountId == null) {
        throw new Error(`Concept '${conceptName}' not found in resolved mapping for event_type '${eventType}'`);
      }

      lines.push({ side: conceptDef.side, accountId, amount });
    }

    // Merge lines with same side + accountId
    const merged = new Map<string, { side: 'debit' | 'credit'; accountId: number; amount: number }>();
    for (const line of lines) {
      const key = `${line.side}:${line.accountId}`;
      const existing = merged.get(key);
      if (existing) {
        existing.amount += line.amount;
      } else {
        merged.set(key, { ...line });
      }
    }

    return Array.from(merged.values()).map(l => ({
      concept: '', // merged lines lose individual concept identity
      side: l.side,
      accountId: l.accountId,
      amount: l.amount,
    }));
  }

  /**
   * Validate that total debit equals total credit across resolved lines
   */
  validateBalance(lines: ResolvedConcept[]): void {
    const totalDebit = lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amount, 0);
    const totalCredit = lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0);
    if (Math.abs(totalDebit - totalCredit) >= 0.01) {
      throw new Error(`Ledger lines not balanced: debit=${totalDebit}, credit=${totalCredit}`);
    }
  }
}

export const accountingEngineService = new AccountingEngineService();
