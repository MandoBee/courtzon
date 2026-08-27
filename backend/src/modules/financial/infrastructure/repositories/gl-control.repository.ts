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
 * `receivable_from_org`) resolves to a control account. On the current chart
 * these resolve to 2200 Org Payable and 1160 Receivable from Org.
 *
 * This repository NEVER writes. Reconciliation is read-only by design.
 */
type RowData = RowDataPacket[];

/** Counterparty-position concepts (organisation/seller — coach excluded). */
export const CONTROL_CONCEPTS = ['org_payable', 'merchant_payable', 'receivable_from_org'];

export interface ControlAccountTotals {
  code: string;
  accountId: number;
  debits: number;
  credits: number;
}

export const glControlRepository = {
  async resolveControlAccountIds(): Promise<Array<{ id: number; code: string; account_type: string }>> {
    const pool = getPool();
    const placeholders = CONTROL_CONCEPTS.map(() => '?').join(', ');
    const [rows] = await pool.execute<RowData>(
      `SELECT DISTINCT c.id, c.code, c.type AS account_type
       FROM accounting_event_mapping_lines m
       JOIN chart_of_accounts c ON c.id = m.account_id
       WHERE m.organisation_id IS NULL AND m.concept IN (${placeholders})
         AND m.is_active = 1`,
      [...CONTROL_CONCEPTS],
    );
    return (rows as any[]).map((r) => ({ id: Number(r.id), code: String(r.code), account_type: String(r.account_type) }));
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

  /** Organisations that have ANY activity on the control accounts. */
  async orgsWithControlActivity(accountIds: number[]): Promise<number[]> {
    if (!accountIds.length) return [];
    const placeholders = accountIds.map(() => '?').join(', ');
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT DISTINCT organisation_id AS organisationId
       FROM general_ledger
       WHERE account_id IN (${placeholders}) AND organisation_id IS NOT NULL`,
      [...accountIds],
    );
    return (rows as any[]).map((r) => Number(r.organisationId));
  },
};
