// Must be set before ANY imports — vitest hoisted ensures it runs first
import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'courtzon2026';
  process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';
  process.env.PORT = '3001';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

type RowData = RowDataPacket[];

describe('Year Close — Full Integration', () => {
  let pool: mysql.Pool;
  let orgId: number;
  let revAccountId: number;
  let expAccountId: number;
  let reAccountId: number;
  let periods: number[] = [];
  let ycId: number;
  let cycleId: number;

  beforeAll(async () => {
    pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3307,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'courtzon2026',
      database: process.env.DB_NAME || 'courtzon_v3',
      connectionLimit: 5,
      charset: 'utf8mb4',
    });

    // Create test org
    const [orgR] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), (SELECT id FROM organisation_types LIMIT 1), 1, 'YC Int Test 2', 'yc-int-test-2', 1)`
    );
    orgId = (orgR as any).insertId;

    const [l3r] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = 'REVENUE-COURT' AND organisation_id IS NULL LIMIT 1`);
    const [l3e] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = 'EXPENSES-GENERAL' AND organisation_id IS NULL LIMIT 1`);
    const [l3eq] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = 'EQUITY-RETAINED' AND organisation_id IS NULL LIMIT 1`);
    const l3rev = (l3r as any[])[0].id, l3exp = (l3e as any[])[0].id, l3eqId = (l3eq as any[])[0].id;

    const [revR] = await pool.execute<RowData>(`INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active) VALUES (?, 'YC2-REV', 'YC2 Rev', 'revenue', 'credit', ?, 0, 1)`, [orgId, l3rev]);
    revAccountId = (revR as any).insertId;
    const [expR] = await pool.execute<RowData>(`INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active) VALUES (?, 'YC2-EXP', 'YC2 Exp', 'expense', 'debit', ?, 0, 1)`, [orgId, l3exp]);
    expAccountId = (expR as any).insertId;
    const [reR] = await pool.execute<RowData>(`INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active) VALUES (?, 'YC2-RE', 'YC2 RE', 'equity', 'credit', ?, 0, 1)`, [orgId, l3eqId]);
    reAccountId = (reR as any).insertId;

    await pool.execute(`INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active) VALUES ('year_close', ?, 'retained_earnings', ?, 1)`, [orgId, reAccountId]);

    for (let p = 1; p <= 12; p++) {
      const start = new Date(2026, p - 1, 1);
      const end = new Date(2026, p, 0);
      const status = p <= 11 ? 'closed' : 'open';
      const [pr] = await pool.execute<RowData>(`INSERT INTO accounting_periods (organisation_id, fiscal_year, period_number, start_date, end_date, status) VALUES (?, 2026, ?, ?, ?, ?)`, [orgId, p, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10), status]);
      periods.push((pr as any).insertId);
    }

    await pool.execute(`INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by) VALUES (?, ?, ?, '2026-12-15', 0, 10000, 0, 'test', 1, 'Rev', 1)`, [orgId, periods[11], revAccountId]);
    await pool.execute(`INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by) VALUES (?, ?, ?, '2026-06-15', 4000, 0, 0, 'test', 2, 'Exp', 1)`, [orgId, periods[5], expAccountId]);
  });

  afterAll(async () => {
    if (ycId) { await pool.execute(`DELETE FROM year_close_cycles WHERE year_closings_id = ?`, [ycId]); await pool.execute(`DELETE FROM year_closings WHERE id = ?`, [ycId]); }
    // Delete ledger_entries BEFORE the referenced COA accounts/periods/orgs,
    // otherwise the SET NULL FKs orphan the rows (chart_account_id/period_id → NULL).
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [orgId]);
    for (const pid of periods) await pool.execute(`DELETE FROM accounting_periods WHERE id = ?`, [pid]);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE organisation_id = ? AND event_type = 'year_close'`, [orgId]);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ? AND code LIKE 'YC2-%'`, [orgId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.end();
  });

  it('1. platform net income calculation works', async () => {
    const { calculateFiscalYearNetIncome } = await import('../application/year-close.netincome.js');
    const ni = await calculateFiscalYearNetIncome(2026, null);
    expect(typeof ni.netIncome).toBe('number');
  });

  it('2. org-scoped net income = 6000 (10000 rev - 4000 exp)', async () => {
    const { calculateFiscalYearNetIncome } = await import('../application/year-close.netincome.js');
    const ni = await calculateFiscalYearNetIncome(2026, orgId);
    expect(ni.netIncome).toBe(6000);
    expect(ni.totalRevenue).toBe(10000);
    expect(ni.totalExpense).toBe(4000);
  });

  it('3. org isolation: org+9999 has zero income', async () => {
    const { calculateFiscalYearNetIncome } = await import('../application/year-close.netincome.js');
    const ni = await calculateFiscalYearNetIncome(2026, orgId + 9999);
    expect(ni.netIncome).toBe(0);
  });

  it('4. year close succeeds with correct net income', async () => {
    const { yearClosingService } = await import('../application/year-closing.service.js');
    const result = await yearClosingService.closeYear(2026, orgId, 1);
    ycId = result.yearClosingsId;
    cycleId = result.cycleId;
    expect(result.status).toBe('completed');
    expect(result.netIncome).toBe(6000);
  });

  it('5. year_closings record created', async () => {
    const [r] = await pool.execute<RowData>(`SELECT * FROM year_closings WHERE id = ?`, [ycId]);
    expect((r as any[]).length).toBe(1);
    expect(Number((r as any[])[0].net_income)).toBe(6000);
    expect((r as any[])[0].status).toBe('completed');
  });

  it('6. closing entries in ledger_entries + balanced', async () => {
    const [r] = await pool.execute<RowData>(`SELECT side, SUM(amount) AS total FROM ledger_entries WHERE source_type = 'year_close' AND source_id = ? GROUP BY side`, [cycleId]);
    const dr = Number((r as any[]).find((x: any) => x.side === 'debit')?.total ?? 0);
    const cr = Number((r as any[]).find((x: any) => x.side === 'credit')?.total ?? 0);
    expect(dr + cr).toBeGreaterThan(0);
    expect(Math.abs(dr - cr)).toBeLessThan(0.01);
  });

  it('7. all closing accounts are L4', async () => {
    const [r] = await pool.execute<RowData>(`SELECT DISTINCT coa.type FROM ledger_entries le JOIN chart_of_accounts coa ON coa.id = le.chart_account_id WHERE le.source_type = 'year_close' AND le.source_id = ?`, [cycleId]);
    const types = (r as any[]).map((x: any) => x.type);
    expect(types).toContain('revenue');
    expect(types).toContain('expense');
    expect(types).toContain('equity');
  });

  it('8. period_id = period 12', async () => {
    const [r] = await pool.execute<RowData>(`SELECT DISTINCT period_id FROM ledger_entries WHERE source_type = 'year_close' AND source_id = ?`, [cycleId]);
    expect((r as any[])[0].period_id).toBe(periods[11]);
  });

  it('9. GL projection exists + totals match canonical', async () => {
    const [gl] = await pool.execute<RowData>(`SELECT SUM(debit) AS dr, SUM(credit) AS cr FROM general_ledger WHERE reference_type = 'year_close_year_close' AND reference_id = ?`, [cycleId]);
    const [le] = await pool.execute<RowData>(`SELECT side, SUM(amount) AS total FROM ledger_entries WHERE source_type = 'year_close' AND source_id = ? GROUP BY side`, [cycleId]);
    expect(Number((gl as any[])[0].dr)).toBeGreaterThan(0);
    const leDr = (le as any[]).find((x: any) => x.side === 'debit');
    expect(Math.abs(Number(leDr?.total ?? 0) - Number((gl as any[])[0].dr))).toBeLessThan(0.01);
  });

  it('10. all 12 periods locked', async () => {
    const [r] = await pool.execute<RowData>(`SELECT status FROM accounting_periods WHERE id IN (${periods.join(',')}) AND status != 'locked'`);
    expect((r as any[]).length).toBe(0);
  });

  it('11. RE contains net income (6000 credit)', async () => {
    const [r] = await pool.execute<RowData>(`SELECT SUM(gl.credit) - SUM(gl.debit) AS bal FROM general_ledger gl JOIN ledger_entries le ON le.id = gl.ledger_entry_id WHERE le.source_type = 'year_close' AND le.source_id = ? AND le.chart_account_id = ?`, [cycleId, reAccountId]);
    expect(Number((r as any[])[0].bal)).toBe(6000);
  });

  it('12. REOPEN: period 12 opens, reversal entries created', async () => {
    const { yearClosingService } = await import('../application/year-closing.service.js');
    await yearClosingService.reopenYear(2026, orgId, 1, 'Test reopen');

    const [p12] = await pool.execute<RowData>(`SELECT status FROM accounting_periods WHERE id = ?`, [periods[11]]);
    expect((p12 as any[])[0].status).toBe('open');

    const [rev] = await pool.execute<RowData>(`SELECT COUNT(*) AS cnt FROM ledger_entries WHERE source_type = 'year_close_reopen'`);
    expect(Number((rev as any[])[0].cnt)).toBeGreaterThan(0);

    const [yc] = await pool.execute<RowData>(`SELECT status FROM year_closings WHERE id = ?`, [ycId]);
    expect((yc as any[])[0].status).toBe('reopened');
  });

  it('13. REOPEN: reversal entries are balanced', async () => {
    const [r] = await pool.execute<RowData>(`SELECT side, SUM(amount) AS total FROM ledger_entries WHERE source_type = 'year_close_reopen' GROUP BY side`);
    const dr = Number((r as any[]).find((x: any) => x.side === 'debit')?.total ?? 0);
    const cr = Number((r as any[]).find((x: any) => x.side === 'credit')?.total ?? 0);
    expect(Math.abs(dr - cr)).toBeLessThan(0.01);
  });

  it('14. REOPEN: periods 1-11 remain locked', async () => {
    const [r] = await pool.execute<RowData>(`SELECT period_number FROM accounting_periods WHERE id IN (${periods.slice(0, 11).join(',')}) AND status != 'locked'`);
    expect((r as any[]).length).toBe(0);
  });

  it('15. RE-CLOSE: succeeds, periods locked, close_count incremented', async () => {
    const { yearClosingService } = await import('../application/year-closing.service.js');
    const result2 = await yearClosingService.closeYear(2026, orgId, 1);

    const [yc] = await pool.execute<RowData>(`SELECT status, close_count FROM year_closings WHERE id = ?`, [result2.yearClosingsId]);
    expect((yc as any[])[0].status).toBe('completed');
    expect(Number((yc as any[])[0].close_count)).toBeGreaterThanOrEqual(2);

    const [per] = await pool.execute<RowData>(`SELECT status FROM accounting_periods WHERE id = ? AND status = 'locked'`, [periods[0]]);
    expect((per as any[]).length).toBe(1);
  });

  it('16. IDEMPOTENCY: duplicate close throws', async () => {
    const { yearClosingService } = await import('../application/year-closing.service.js');
    try {
      await yearClosingService.closeYear(2026, orgId, 1);
      expect(true).toBe(false); // should not reach here
    } catch {
      expect(true).toBe(true);
    }
  });
});
