import type mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { getPool } from '../../../../database/mysql.js';

/**
 * GL control-account repository — READ-ONLY mirror side of the position
 * reconciliation (Phase 2 Step 1).
 *
 * Control accounts are DISCOVERED from the accounting event mapping (never
 * hard-coded): every global mapping line whose concept represents a
 * counterparty position (`org_payable`, `merchant_payable`,
 * `receivable_from_org`, `marketplace_receivable`) resolves to a control
 * account. On the current chart these resolve to 2200 Org Payable,
 * 2202 Merchant Payable, 1160 Receivable from Org and 1161 Marketplace
 * Receivable.
 *
 * This repository NEVER writes. Reconciliation is read-only by design.
 */
type RowData = RowDataPacket[];

/** Counterparty-position concepts (organisation/seller — coach excluded). */
export const CONTROL_CONCEPTS = ['org_payable', 'merchant_payable', 'receivable_from_org', 'marketplace_receivable'];

export interface ControlAccountTotals {
  code: string;
  accountId: number;
  debits: number;
  credits: number;
}

export interface ResolvedControlAccount {
  id: number;
  code: string;
  account_type: string;
  /** True when the account belongs to a single organisation (org book), not CourtZon's global book. */
  organisationScoped: boolean;
  organisationId: number | null;
}

export const glControlRepository = {
  /**
   * Resolve the control accounts to reconcile against.
   *
   * Called with NO argument this returns exactly what it has always returned —
   * the GLOBAL control accounts only — so every existing caller is unaffected.
   *
   * G11.4 (R-4): when an `orgId` is supplied, the organisation's OWN
   * organisation-scoped control accounts are resolved as well, for EVERY globally
   * discovered control CODE (1161 Marketplace Receivable, 1160 Receivable from
   * Org, 2200/2202 family, ...). The per-organisation books auto-provision their
   * own 1161 through the accounting engine, but those rows live in
   * `accounting_event_mapping_lines.organisation_id = <org>`, so the global-only
   * query could never see them — which made an organisation with a real 1161
   * balance reconcile as a FALSE ZERO.
   *
   * Guarantees:
   *   - backward compatible: omitting orgId returns the global set only;
   *   - the same globally discovered control-code set stays the source of truth —
   *     an org-scoped account is only accepted when its code is in that set, so
   *     an organisation's unrelated custom accounts never enter the universe;
   *   - no double counting: results are de-duplicated by account id, and global
   *     (organisation_id = NULL) accounts only ever carry org NULL GL rows, so
   *     the per-org totals query can never see them twice;
   *   - read-only, SELECT only.
   */
  async resolveControlAccountIds(orgId?: number | null): Promise<ResolvedControlAccount[]> {
    const pool = getPool();
    const placeholders = CONTROL_CONCEPTS.map(() => '?').join(', ');
    const [globalRows] = await pool.execute<RowData>(
      `SELECT DISTINCT c.id, c.code, c.type AS account_type
       FROM accounting_event_mapping_lines m
       JOIN chart_of_accounts c ON c.id = m.account_id
       WHERE m.organisation_id IS NULL AND m.concept IN (${placeholders})
         AND m.is_active = 1`,
      [...CONTROL_CONCEPTS],
    );
    const accounts: ResolvedControlAccount[] = (globalRows as any[]).map((r) => ({
      id: Number(r.id),
      code: String(r.code),
      account_type: String(r.account_type),
      organisationScoped: false,
      organisationId: null,
    }));

    if (orgId == null) return accounts;

    const org = Number(orgId);
    if (!Number.isFinite(org) || org <= 0) return accounts;

    const seenIds = new Set(accounts.map((a) => a.id));
    const seenCodes = new Set(accounts.map((a) => a.code));
    const [orgRows] = await pool.execute<RowData>(
      `SELECT DISTINCT c.id, c.code, c.type AS account_type
       FROM accounting_event_mapping_lines m
       JOIN chart_of_accounts c ON c.id = m.account_id
       WHERE m.organisation_id = ?
         AND m.concept IN (${placeholders})
         AND m.is_active = 1
         AND c.is_active = 1`,
      [org, ...CONTROL_CONCEPTS],
    );
    for (const r of orgRows as any[]) {
      const id = Number(r.id);
      const code = String(r.code);
      // De-duplicate by account id (the same account is never counted twice) and
      // skip codes the global discovery did not recognise.
      if (seenIds.has(id) || !seenCodes.has(code)) continue;
      seenIds.add(id);
      accounts.push({ id, code, account_type: String(r.account_type), organisationScoped: true, organisationId: org });
    }
    return accounts;
  },

  /** Debit/credit totals per control account for one organisation. */
  async controlTotalsForOrg(orgId: number, accountIds: number[]): Promise<ControlAccountTotals[]> {
    if (!accountIds.length) return [];
    const placeholders = accountIds.map(() => '?').join(', ');
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT gl.account_id AS accountId, COALESCE(SUM(gl.debit), 0) AS debits, COALESCE(SUM(gl.credit), 0) AS credits
       FROM general_ledger gl
       WHERE gl.account_id IN (${placeholders}) AND gl.organisation_id = ?
       GROUP BY gl.account_id`,
      [...accountIds, orgId],
    );
    return (rows as any[]).map((r) => ({
      accountId: Number(r.accountId),
      debits: Number(r.debits),
      credits: Number(r.credits),
      code: '',
    }));
  },

  /**
   * Organisations that have ANY activity on the control accounts.
   *
   * `accountIds` is the globally discovered set. `controlCodes` is OPTIONAL and,
   * when supplied, ALSO matches organisation-scoped accounts carrying one of those
   * same control codes.
   *
   * G11.4 (R-4): without that, an organisation whose only control activity sits
   * on its own org-scoped 1161 (exactly the G11.1 tournament case) was invisible
   * to discovery, so `reconcileAll()` never visited it and the admin saw a
   * misleading "0 orgs / all reconciled" instead of the real drift. Omitting
   * `controlCodes` preserves the previous behaviour exactly.
   */
  async orgsWithControlActivity(accountIds: number[], controlCodes?: string[]): Promise<number[]> {
    const codes = (controlCodes ?? []).map((c) => String(c)).filter(Boolean);
    if (!accountIds.length && !codes.length) return [];
    const pool = getPool();
    const clauses: string[] = [];
    const params: any[] = [];
    if (accountIds.length) {
      clauses.push(`gl.account_id IN (${accountIds.map(() => '?').join(', ')})`);
      params.push(...accountIds);
    }
    if (codes.length) {
      clauses.push(`gl.account_id IN (
        SELECT c.id FROM chart_of_accounts c
        WHERE c.code IN (${codes.map(() => '?').join(', ')}) AND c.is_active = 1
      )`);
      params.push(...codes);
    }
    const [rows] = await pool.execute<RowData>(
      `SELECT DISTINCT gl.organisation_id AS organisationId
       FROM general_ledger gl
       WHERE (${clauses.join(' OR ')}) AND gl.organisation_id IS NOT NULL`,
      params,
    );
    return (rows as any[]).map((r) => Number(r.organisationId));
  },
};
