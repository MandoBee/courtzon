import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Organisation accounting reports (Trial Balance / Income Statement / Balance
 * Sheet) are the SAME canonical handlers as Super Admin, scoped to the
 * organisation. The report endpoints reuse getTrialBalanceHandler /
 * getIncomeStatementHandler / getBalanceSheetHandler with the route :orgId
 * forced as organisationId (scopedRequest) and validateOrgAccess re-checking
 * membership — so an organisation can never see another organisation's
 * accounts or ledger activity. These tests seed two organisations' general
 * ledger directly (bypassing the journal-posting path, which is covered by
 * org-journal.spec.ts) and assert the org handlers return only the caller's
 * own slice, honour date filters, and exclude other-org accounts.
 */
describe('Organisation accounting reports — org scoping & isolation', () => {
  let pool: mysql.Pool;
  let orgA: number;
  let orgB: number;
  let cashId: number;
  let revenueId: number;
  let orgBCashId: number;
  let periodId: number;

  const reply = { status: (c: number) => ({ send: (b: any) => b }), send: (b: any) => b };

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const otId = (ot as any[])[0].id;
    const [a] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Org Reports A', 'org-reports-a', 1)`, [otId]);
    orgA = (a as any).insertId;
    const [b] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Org Reports B', 'org-reports-b', 1)`, [otId]);
    orgB = (b as any).insertId;

    const [cash] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = '1120' AND organisation_id IS NULL`);
    cashId = (cash as any[])[0].id;
    const [rev] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = '4100' AND organisation_id IS NULL`);
    revenueId = (rev as any[])[0].id;

    const [l3] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = 'ASSETS-CASH' AND organisation_id IS NULL`);
    const [oc] = await pool.execute<RowData>(`INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active) VALUES (?, 'ORGB-CASH', 'Org B Cash', 'asset', 'debit', ?, 0, 1)`, [orgB, (l3 as any[])[0].id]);
    orgBCashId = (oc as any).insertId;

    const [per] = await pool.execute<RowData>(`SELECT id FROM accounting_periods WHERE '2026-08-14' BETWEEN start_date AND end_date LIMIT 1`);
    periodId = (per as any[])[0].id;

    // Org A ledger: 100 DR cash / 100 CR revenue on 2026-08-14
    await pool.execute(
      `INSERT INTO general_ledger (period_id, organisation_id, account_id, entry_date, debit, credit, balance, created_by, reference_type, reference_id, description)
       VALUES (?, ?, ?, '2026-08-14', 100, 0, 0, 1, 'journal', 99001, 'Org A cash')`,
      [periodId, orgA, cashId],
    );
    await pool.execute(
      `INSERT INTO general_ledger (period_id, organisation_id, account_id, entry_date, debit, credit, balance, created_by, reference_type, reference_id, description)
       VALUES (?, ?, ?, '2026-08-14', 0, 100, 0, 1, 'journal', 99001, 'Org A revenue')`,
      [periodId, orgA, revenueId],
    );

    // Org B ledger: 50 DR ORGB-CASH / 50 CR revenue on 2026-08-20
    await pool.execute(
      `INSERT INTO general_ledger (period_id, organisation_id, account_id, entry_date, debit, credit, balance, created_by, reference_type, reference_id, description)
       VALUES (?, ?, ?, '2026-08-20', 50, 0, 0, 1, 'journal', 99002, 'Org B cash')`,
      [periodId, orgB, orgBCashId],
    );
    await pool.execute(
      `INSERT INTO general_ledger (period_id, organisation_id, account_id, entry_date, debit, credit, balance, created_by, reference_type, reference_id, description)
       VALUES (?, ?, ?, '2026-08-20', 0, 50, 0, 1, 'journal', 99002, 'Org B revenue')`,
      [periodId, orgB, revenueId],
    );
  });

  afterAll(async () => {
    for (const orgId of [orgA, orgB]) {
      await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [orgId]);
      await pool.execute(`DELETE FROM organisation_coa_customizations WHERE organisation_id = ?`, [orgId]);
    }
    await pool.execute(`DELETE FROM chart_of_accounts WHERE id = ?`, [orgBCashId]);
    await pool.execute(`DELETE FROM organisations WHERE id IN (?, ?)`, [orgA, orgB]);
    await pool.end();
  });

  async function runReport(handler: string, orgId: number, query: Record<string, string>) {
    const mod = await import('../presentation/accounting.controller.js');
    return mod[handler]({ params: { orgId: String(orgId) }, query, userId: 1, ip: '', headers: {} } as any, reply as any);
  }

  it('trial balance returns only the organisation own ledger (no other-org account or balance)', async () => {
    const res: any = await runReport('orgTrialBalanceHandler', orgA, { from: '2026-01-01', to: '2026-12-31' });
    const rows = res.data;
    expect(rows.length).toBeGreaterThan(0);
    // Org B owned account must never appear in org A's report.
    expect(rows.some((r: any) => r.code === 'ORGB-CASH')).toBe(false);
    const cash = rows.find((r: any) => r.code === '1120');
    expect(cash).toBeDefined();
    // 100 from org A only — org B's 50 must not be aggregated.
    expect(cash.balance).toBe(100);
    const revenue = rows.find((r: any) => r.code === '4100');
    expect(revenue).toBeDefined();
    expect(revenue.balance).toBe(100);
  });

  it('income statement excludes another organisation ledger and accounts', async () => {
    const res: any = await runReport('orgIncomeStatementHandler', orgA, { from: '2026-01-01', to: '2026-12-31' });
    // Org B owned account never appears in org A's income statement.
    expect(res.data.lines.some((r: any) => r.code === 'ORGB-CASH')).toBe(false);
    const revenue = res.data.lines.find((r: any) => r.code === '4100');
    expect(revenue).toBeDefined();
    // Org A's own revenue slice only — org B's 50 credit on the same global
    // account is scoped out, so the org A revenue account balance stays 100.
    expect(revenue.balance).toBe(100);
    // Net figures are canonical backend values (not recomputed by the client).
    expect(typeof res.data.net_revenue).toBe('number');
    expect(typeof res.data.net_income).toBe('number');
  });

  it('balance sheet excludes another organisation account', async () => {
    const res: any = await runReport('orgBalanceSheetHandler', orgA, { asOf: '2026-12-31' });
    expect(res.data.some((r: any) => r.code === 'ORGB-CASH')).toBe(false);
    const cash = res.data.find((r: any) => r.code === '1120');
    expect(cash).toBeDefined();
    expect(cash.balance).toBe(100);
  });

  it('date filters scope the trial balance (From excludes earlier entries)', async () => {
    const res: any = await runReport('orgTrialBalanceHandler', orgA, { from: '2026-09-01', to: '2026-12-31' });
    const cash = res.data.find((r: any) => r.code === '1120');
    expect(cash).toBeDefined();
    expect(cash.balance).toBe(0);
  });

  it('balance sheet As-Of date scopes balances', async () => {
    const before: any = await runReport('orgBalanceSheetHandler', orgA, { asOf: '2026-08-13' });
    const cashBefore = before.data.find((r: any) => r.code === '1120');
    expect(cashBefore.balance).toBe(0);

    const after: any = await runReport('orgBalanceSheetHandler', orgA, { asOf: '2026-08-15' });
    const cashAfter = after.data.find((r: any) => r.code === '1120');
    expect(cashAfter.balance).toBe(100);
  });
});
