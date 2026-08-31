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
  /** Per-line organisation override (e.g. seller-scoped payable vs platform-scoped revenue). */
  organisationId?: number | null;
}

/**
 * Code-level concept → account CODE fallback for concepts intentionally resolved
 * in code rather than the DB mapping table. Keyed by EVENT TYPE so it never
 * leaks into other accounting domains (e.g. booking platform_commission must stay
 * 4110, subscription revenue 4170). Marketplace uses:
 *   `shipping` → 2400 Accounts Payable
 *   `marketplace_receivable` → 1161 Marketplace Receivable
 * These have no DB mapping row and require no migration; the accounts already
 * exist globally (no COA/schema/migration change).
 */
const CONCEPT_ACCOUNT_CODE_DEFAULTS: Record<string, Record<string, string>> = {
  marketplace_card_payment: { shipping: '2400' },
  marketplace_wallet_payment: { shipping: '2400' },
  marketplace_merchant_refund: { shipping: '2400' },
  marketplace_wallet_refund: { shipping: '2400' },
  // New cash events have no DB mapping rows at all — resolve the full concept set
  // from code (platform_commission → 4160, marketplace_receivable → 1161).
  marketplace_cash_commission: { marketplace_receivable: '1161', platform_commission: '4160' },
  marketplace_cash_reversal: { marketplace_receivable: '1161', platform_commission: '4160' },
  // Payment-gateway settlement has no DB mapping row — resolve from code so the
  // clearing → bank transfer posts without a migration. 1100 Payment Clearing is
  // the existing gateway-clearing asset; 1120 Cash / Bank is the destination;
  // 5210 Payment Gateway Fees (existing COA L4) receives the gateway fee
  // expense. CourtZon book only (org NULL); org books never carry these accounts.
  payment_gateway_settlement: { cash_bank: '1120', payment_clearing: '1100', payment_gateway_fee: '5210' },
};

/**
 * Organization-Book account codes per concept (org-scoped L4 accounts).
 * These are provisioned per organisation (idempotently) and used ONLY in the
 * organisation's own book — never in CourtZon's book (org NULL).
 */
export const ORG_MARKETPLACE_ACCOUNT_CODES: Record<string, { code: string; name: string; type: string; normalSide: 'debit' | 'credit'; parentCode: string; description: string }> = {
  sales_revenue: {
    code: 'MKT-SALES',
    name: 'Marketplace Sales Revenue',
    type: 'revenue',
    normalSide: 'credit',
    parentCode: 'REVENUE-COURT',
    description: 'Organization marketplace product/service sales revenue',
  },
  commission_expense: {
    code: 'MKT-COMM-EXP',
    name: 'Marketplace Commission Expense',
    type: 'expense',
    normalSide: 'debit',
    parentCode: 'EXPENSES-GENERAL',
    description: 'CourtZon marketplace commission charged to this organization',
  },
  shipping_liability: {
    code: 'MKT-SHIP-LIAB',
    name: 'Shipping Liability',
    type: 'liability',
    normalSide: 'credit',
    parentCode: 'LIABILITIES-PAYABLES',
    description: 'Organization shipping collected from customers, owed to the shipping party',
  },
  marketplace_receivable: {
    code: '1161',
    name: 'Marketplace Receivable',
    type: 'asset',
    normalSide: 'debit',
    parentCode: 'ASSETS-RECEIVABLES',
    description: 'Amount due from CourtZon for marketplace sales (organization book)',
  },
  courtzon_payable: {
    code: 'MKT-CZ-PAY',
    name: 'CourtZon Payable',
    type: 'liability',
    normalSide: 'credit',
    parentCode: 'LIABILITIES-PAYABLES',
    description: 'CourtZon marketplace commission owed by this organization (organization book)',
  },
};

/** Organization-book event types and the concepts they require (org-scoped). */
export const ORG_BOOK_EVENTS: Record<string, string[]> = {
  marketplace_org_receivable: ['marketplace_receivable', 'commission_expense', 'sales_revenue', 'shipping_liability'],
  marketplace_org_receivable_reversal: ['sales_revenue', 'shipping_liability', 'marketplace_receivable', 'commission_expense'],
  marketplace_org_cash_receivable: ['marketplace_receivable', 'commission_expense', 'sales_revenue', 'shipping_liability', 'courtzon_payable'],
  marketplace_org_cash_receivable_rev: ['sales_revenue', 'shipping_liability', 'courtzon_payable', 'marketplace_receivable', 'commission_expense'],
};

export class AccountingEngineService {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  /**
   * Resolve the mapping for an event_type + organisation_id.
   * Returns the set of {concept, accountId} lines.
   * Complete-override model: org rows replace global rows entirely.
   *
   * Code-level fallback: if a concept required by the event (per EVENT_CONCEPTS)
   * has no DB mapping row but a code-level account CODE default exists, the
   * account is resolved by code (global scope) and appended. This lets the
   * marketplace shipping (2400) and cash receivable (1161) post without a
   * migration/DB row, while keeping the DB mapping authoritative for everything
   * else.
   */
  async resolveMapping(eventType: string, organisationId: number | null): Promise<MappingLine[]> {
    let rows: RowData;

    if (organisationId != null) {
      // Organization-Book events require org-scoped mappings. Auto-provision the
      // org's marketplace COA accounts + mappings idempotently so the org book
      // never falls back to CourtZon's accounts (book separation).
      if (ORG_BOOK_EVENTS[eventType]) {
        await this.provisionOrganisationMarketplaceAccounts(organisationId);
      }
      [rows] = await this.pool.execute<RowData>(
        `SELECT concept, account_id AS accountId
         FROM accounting_event_mapping_lines
         WHERE event_type = ? AND organisation_id = ? AND is_active = 1
         ORDER BY concept`,
        [eventType, organisationId],
      );
      if ((rows as any[]).length > 0) {
        await this.applyConceptCodeDefaults(eventType, rows as any[]);
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
    await this.applyConceptCodeDefaults(eventType, rows as any[]);
    return this.validateAndReturn(eventType, rows as any[], organisationId);
  }

  /**
   * Idempotently provision the organization's marketplace COA accounts and the
   * org-book event mappings. Safe to run repeatedly. Creates:
   *   - org-scoped L4 accounts (MKT-SALES, MKT-COMM-EXP, MKT-SHIP-LIAB, 1161)
   *   - org-scoped accounting_event_mapping_lines for the org-book events
   * Never touches CourtZon (org NULL) rows, other orgs, or existing org custom
   * accounts.
   */
  async provisionOrganisationMarketplaceAccounts(organisationId: number): Promise<void> {
    if (!organisationId) return;

    // 1. Provision org-scoped L4 accounts (INSERT IGNORE on (organisation_id, code)).
    const accountIdByConcept = new Map<string, number>();
    for (const [concept, def] of Object.entries(ORG_MARKETPLACE_ACCOUNT_CODES)) {
      const [existing] = await this.pool.execute<RowData>(
        `SELECT id FROM chart_of_accounts WHERE organisation_id = ? AND code = ? LIMIT 1`,
        [organisationId, def.code],
      );
      if ((existing as any[]).length > 0) {
        accountIdByConcept.set(concept, Number((existing as any[])[0].id));
        continue;
      }
      const [parent] = await this.pool.execute<RowData>(
        `SELECT id FROM chart_of_accounts WHERE code = ? AND organisation_id IS NULL AND is_active = 1 LIMIT 1`,
        [def.parentCode],
      );
      if (!(parent as any[]).length) {
        log.error({ orgId: organisationId, code: def.code, parentCode: def.parentCode }, 'Org-book parent account not found — skipping provision');
        continue;
      }
      const [res] = await this.pool.execute<RowData>(
        `INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`,
        [organisationId, def.code, def.name, def.type, def.normalSide, (parent as any[])[0].id, def.description || null],
      );
      accountIdByConcept.set(concept, (res as any).insertId);
    }

    // 2. Provision org-scoped mapping lines for the org-book events.
    for (const [eventType, concepts] of Object.entries(ORG_BOOK_EVENTS)) {
      for (const concept of concepts) {
        const accountId = accountIdByConcept.get(concept);
        if (accountId == null) continue;
        await this.pool.execute<RowData>(
          `INSERT IGNORE INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
           VALUES (?, ?, ?, ?, 1)`,
          [eventType, organisationId, concept, accountId],
        );
      }
    }
    log.info({ organisationId }, 'Organisation marketplace accounts provisioned (idempotent)');
  }

  /** Append code-level concept→account fallback lines for any missing required concept. */
  private async applyConceptCodeDefaults(eventType: string, rows: { concept: string; accountId: number }[]): Promise<void> {
    const defaults = CONCEPT_ACCOUNT_CODE_DEFAULTS[eventType];
    if (!defaults) return;
    const required = getEventConcepts(eventType).map(c => c.concept);
    const present = new Set(rows.map(r => r.concept));
    const missing = required.filter(c => !present.has(c) && defaults[c]);
    if (!missing.length) return;

    const codes = [...new Set(missing.map(c => defaults[c]))];
    const placeholders = codes.map(() => '?').join(',');
    const [acctRows] = await this.pool.execute<RowData>(
      `SELECT id, code FROM chart_of_accounts
       WHERE code IN (${placeholders}) AND organisation_id IS NULL AND is_active = 1`,
      codes,
    );
    const codeToId = new Map((acctRows as any[]).map(a => [a.code, a.id]));
    for (const c of missing) {
      const code = defaults[c];
      const id = codeToId.get(code);
      if (id != null) rows.push({ concept: c, accountId: Number(id) });
    }
  }

  /**
   * Resolve the effective set of tax account IDs (concepts `tax_liability` and
   * `input_tax`) for a scope. Applies the same complete-override model as
   * resolveMapping: org-owned lines replace global lines per event_type, and
   * event types without an org override fall back to global lines.
   * No account codes/names/IDs are hard-coded — only the stable concepts.
   */
  async resolveTaxAccountIds(organisationId: number | null): Promise<number[]> {
    let [rows] = await this.pool.execute<RowData>(
      `SELECT DISTINCT account_id
       FROM accounting_event_mapping_lines
       WHERE is_active = 1
         AND concept IN ('tax_liability', 'input_tax')
         AND (
           organisation_id = ?
           OR (
             organisation_id IS NULL
             AND event_type NOT IN (
               SELECT DISTINCT event_type
               FROM accounting_event_mapping_lines
               WHERE organisation_id = ? AND is_active = 1
             )
           )
         )`,
      [organisationId ?? null, organisationId ?? null],
    );
    return (rows as any[]).map((r: any) => Number(r.account_id));
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
   * Merges lines with the same (side, accountId) — but keeps lines with
   * different organisation attribution separate (seller-scoped vs platform).
   */
  buildLedgerLines(
    eventType: string,
    mapping: MappingLine[],
    conceptAmounts: Record<string, number>,
    conceptOrganisations?: Record<string, number | null>,
  ): ResolvedConcept[] {
    const concepts = getEventConcepts(eventType);
    const conceptMap = new Map(concepts.map(c => [c.concept, c]));
    const mappingMap = new Map(mapping.map(m => [m.concept, m.accountId]));

    const lines: { side: 'debit' | 'credit'; accountId: number; amount: number; organisationId?: number | null }[] = [];

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

      const orgOverride = conceptOrganisations ? conceptOrganisations[conceptName] : undefined;
      const line: { side: 'debit' | 'credit'; accountId: number; amount: number; organisationId?: number | null } = {
        side: conceptDef.side,
        accountId,
        amount,
      };
      // Only set organisationId when an explicit per-line override exists, so
      // the caller's event-level organisationId remains the default.
      if (orgOverride !== undefined) line.organisationId = orgOverride;
      lines.push(line);
    }

    // Merge lines with same side + accountId + organisation (per-line attribution preserved)
    const merged = new Map<string, { side: 'debit' | 'credit'; accountId: number; amount: number; organisationId?: number | null }>();
    for (const line of lines) {
      const key = `${line.side}:${line.accountId}:${line.organisationId ?? 'null'}`;
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
      organisationId: l.organisationId,
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
