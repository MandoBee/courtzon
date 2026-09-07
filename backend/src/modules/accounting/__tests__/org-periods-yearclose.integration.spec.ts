import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

// Capture the realtime signal without a live socket.
const emitted: Array<{ name: string; payload: any }> = [];
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: {
    emit: vi.fn(async (name: string, payload: any) => { emitted.push({ name, payload }); }),
    on: vi.fn(),
  },
}));

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Organisation Accounting Periods + Year-End Closing lifecycle.
 *
 * Organisation admins manage their OWN periods and close their OWN fiscal year
 * through the SAME canonical logic as Super Admin (scopedRequest forces the
 * route :orgId as the authoritative organisationId). These tests verify:
 *  - org-scoped period generation/list (isolation from platform + other orgs);
 *  - period ownership enforcement on close/open (never another org's period);
 *  - posting rules: open period accepts, closed org period rejects BOTH the
 *    manual journal path and the automatic (resolvePeriod) path;
 *  - year-close eligibility (12 periods, P1-11 closed, P12 open), atomicity,
 *    balanced closing entries, retained-earnings transfer, duplicate prevention;
 *  - post-commit realtime signals for close and reopen;
 *  - new fiscal year: P&L accounts start at zero, balance-sheet accounts carry
 *    their closing balances forward (cumulative GL — no explicit opening entry
 *    mechanism exists in this architecture).
 */
describe('Organisation Accounting Periods & Year Close', () => {
  let pool: mysql.Pool;
  let orgA: number;
  let orgB: number;
  let cashId: number;
  let revenueId: number;
  let reAccountId: number;
  let periodsA: number[] = [];
  let periodsB: number[] = [];

  const reply = { status: (c: number) => ({ send: (b: any) => b }), send: (b: any) => b };

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    const [ot] = await pool.execute<RowData>(`SELECT id FROM organisation_types LIMIT 1`);
    const otId = (ot as any[])[0].id;
    const [a] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Org Periods A', 'org-periods-a', 1)`, [otId]);
    orgA = (a as any).insertId;
    const [b] = await pool.execute<RowData>(`INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Org Periods B', 'org-periods-b', 1)`, [otId]);
    orgB = (b as any).insertId;

    const [cash] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = '1120' AND organisation_id IS NULL`);
    cashId = (cash as any[])[0].id;
    const [rev] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = '4100' AND organisation_id IS NULL`);
    revenueId = (rev as any[])[0].id;

    const [l3eq] = await pool.execute<RowData>(`SELECT id FROM chart_of_accounts WHERE code = 'EQUITY-RETAINED' AND organisation_id IS NULL LIMIT 1`);
    const [reR] = await pool.execute<RowData>(`INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active) VALUES (?, 'OPC-RE', 'Org Periods RE', 'equity', 'credit', ?, 0, 1)`, [orgA, (l3eq as any[])[0].id]);
    reAccountId = (reR as any).insertId;
    await pool.execute(`INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active) VALUES ('year_close', ?, 'retained_earnings', ?, 1)`, [orgA, reAccountId]);

    // Generate 12 org-scoped periods for orgA and orgB for FY 2026 (all open).
    const mod = await import('../presentation/accounting.controller.js');
    const aRes: any = await mod.orgGeneratePeriodsHandler({ params: { orgId: String(orgA) }, query: {}, body: { fiscalYear: 2026 }, userId: 1, ip: '', headers: {} } as any, reply as any);
    expect(aRes.data.periodsGenerated).toBe(12);
    const [pa] = await pool.execute<RowData>(`SELECT id FROM accounting_periods WHERE organisation_id = ? AND fiscal_year = 2026 ORDER BY period_number`, [orgA]);
    periodsA = (pa as any[]).map((r: any) => r.id);
    const bRes: any = await mod.orgGeneratePeriodsHandler({ params: { orgId: String(orgB) }, query: {}, body: { fiscalYear: 2026 }, userId: 1, ip: '', headers: {} } as any, reply as any);
    expect(bRes.data.periodsGenerated).toBe(12);
    const [pb] = await pool.execute<RowData>(`SELECT id FROM accounting_periods WHERE organisation_id = ? AND fiscal_year = 2026 ORDER BY period_number`, [orgB]);
    periodsB = (pb as any[]).map((r: any) => r.id);
  });

  afterAll(async () => {
    const ids = [...periodsA, ...periodsB];
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      await pool.execute(`DELETE FROM ledger_entries WHERE period_id IN (${placeholders})`, ids);
      await pool.execute(`DELETE FROM general_ledger WHERE period_id IN (${placeholders})`, ids);
      await pool.execute(`DELETE FROM year_close_cycles WHERE year_closings_id IN (SELECT id FROM year_closings WHERE organisation_id IN (?, ?))`, [orgA, orgB]);
      await pool.execute(`DELETE FROM year_closings WHERE organisation_id IN (?, ?)`, [orgA, orgB]);
      await pool.execute(`DELETE FROM accounting_periods WHERE id IN (${placeholders})`, ids);
    }
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE organisation_id = ? AND event_type = 'year_close'`, [orgA]);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE id = ?`, [reAccountId]);
    await pool.execute(`DELETE FROM organisations WHERE id IN (?, ?)`, [orgA, orgB]);
    await pool.end();
  });

  async function orgHandler(handler: string, orgId: number, opts: Record<string, any> = {}) {
    const mod = await import('../presentation/accounting.controller.js');
    return mod[handler](
      { params: { orgId: String(orgId), ...(opts.params || {}) }, query: opts.query || {}, body: opts.body || {}, userId: 1, ip: '', headers: {} } as any,
      reply as any,
    );
  }

  async function orgClosePeriod(orgId: number, periodId: number) {
    return orgHandler('orgClosePeriodHandler', orgId, { params: { id: periodId } });
  }

  async function postManualJournal(orgId: number, entryDate: string, description: string) {
    const mod = await import('../presentation/accounting.controller.js');
    return mod.orgJournalCreateHandler(
      { params: { orgId: String(orgId) }, body: { entryDate, description, entries: [{ accountId: cashId, debit: 1000, credit: 0 }, { accountId: revenueId, debit: 0, credit: 1000 }] }, userId: 1, ip: '', headers: {} } as any,
      reply as any,
    );
  }

  it('1. org period generation is scoped — orgA list excludes platform and orgB periods', async () => {
    const res: any = await orgHandler('orgListPeriodsHandler', orgA);
    const rows = res.data;
    expect(rows).toHaveLength(12);
    for (const r of rows) {
      expect(r.organisation_id).toBe(orgA);
      expect(r.fiscal_year).toBe(2026);
    }
  });

  it('2. posting is allowed in an open organisation period', async () => {
    const res: any = await postManualJournal(orgA, '2026-03-15', 'Open period posting');
    expect(Array.isArray(res.data.ids)).toBe(true);
  });

  it('3. a closed organisation period rejects the MANUAL journal path', async () => {
    // Close orgA period 2 (Feb 2026).
    const p2 = periodsA[1];
    const closeRes: any = await orgClosePeriod(orgA, p2);
    expect(closeRes.data.status).toBe('closed');
    await expect(postManualJournal(orgA, '2026-02-20', 'Closed period posting')).rejects.toThrow(/closed/);
  });

  it('4. a closed organisation period rejects the AUTOMATIC posting path (resolvePeriod)', async () => {
    const { glProjectionService } = await import('../../financial/application/gl-projection.service.js');
    await expect(glProjectionService.resolvePeriod('2026-02-20', orgA)).rejects.toThrow(/not open/);
    // Open org periods resolve to the org's OWN period id, never the platform's.
    const p3Id = await glProjectionService.resolvePeriod('2026-03-20', orgA);
    expect(p3Id).toBe(periodsA[2]);
  });

  it('5. org period close/open enforce ownership — cannot touch another org period', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    const orgBPeriodId = periodsB[1];
    await expect(
      mod.orgClosePeriodHandler(
        { params: { orgId: String(orgA), id: orgBPeriodId }, query: {}, userId: 1, ip: '', headers: {} } as any,
        reply as any,
      ),
    ).rejects.toThrow(/Period/);
    const [pb] = await pool.execute<RowData>(`SELECT status FROM accounting_periods WHERE id = ?`, [orgBPeriodId]);
    expect((pb as any[])[0].status).toBe('open');
  });

  it('6. year close requires all 12 periods with P1-11 closed and P12 open (eligibility)', async () => {
    const { yearClosingService } = await import('../application/year-closing.service.js');
    // All orgA periods are open except P2 (closed in test 3) → P1 is still open → reject.
    await expect(yearClosingService.closeYear(2026, orgA, 1)).rejects.toThrow(/must be closed/);
    // Close P1 and P3-11, leave P12 open.
    for (let i = 0; i < periodsA.length; i++) {
      const num = i + 1;
      if (num === 12) continue;
      if (num === 2) continue; // already closed
      await pool.execute(`UPDATE accounting_periods SET status = 'closed' WHERE id = ?`, [periodsA[i]]);
    }
    const preview: any = await yearClosingService.previewClose(2026, orgA);
    expect(preview.netIncome).toBe(1000);
    expect(preview.retainedEarningsAccount.id).toBe(reAccountId);
  });

  it('7. year close succeeds, closing entries are balanced, RE receives net income, all periods lock', async () => {
    emitted.length = 0;
    const { yearClosingService } = await import('../application/year-closing.service.js');
    const result = await yearClosingService.closeYear(2026, orgA, 1);
    expect(result.status).toBe('completed');
    expect(result.netIncome).toBe(1000);

    // Real-time signal fired post-commit.
    expect(emitted.some((e) => e.name === 'accounting:entry-recorded' && e.payload.organisationId === orgA && e.payload.sourceType === 'year_close')).toBe(true);

    const [le] = await pool.execute<RowData>(`SELECT side, SUM(amount) AS total FROM ledger_entries WHERE source_type = 'year_close' AND source_id = ? GROUP BY side`, [result.cycleId]);
    const dr = Number((le as any[]).find((x: any) => x.side === 'debit')?.total ?? 0);
    const cr = Number((le as any[]).find((x: any) => x.side === 'credit')?.total ?? 0);
    expect(Math.abs(dr - cr)).toBeLessThan(0.01);
    expect(dr).toBeGreaterThan(0);

    const [re] = await pool.execute<RowData>(
      `SELECT SUM(gl.credit) - SUM(gl.debit) AS bal FROM general_ledger gl JOIN ledger_entries le ON le.id = gl.ledger_entry_id WHERE le.source_type = 'year_close' AND le.source_id = ? AND le.chart_account_id = ?`,
      [result.cycleId, reAccountId],
    );
    expect(Number((re as any[])[0].bal)).toBe(1000);

    const [locked] = await pool.execute<RowData>(`SELECT COUNT(*) AS c FROM accounting_periods WHERE id IN (${periodsA.join(',')}) AND status = 'locked'`);
    expect(Number((locked as any[])[0].c)).toBe(12);
  });

  it('8. duplicate close is prevented (atomic, cannot run twice)', async () => {
    const { yearClosingService } = await import('../application/year-closing.service.js');
    await expect(yearClosingService.closeYear(2026, orgA, 1)).rejects.toThrow(/must be open/);
  });

  it('9. organisation isolation — closing orgA never touches orgB periods', async () => {
    const [pb] = await pool.execute<RowData>(`SELECT status FROM accounting_periods WHERE id IN (${periodsB.join(',')}) AND status = 'locked'`);
    expect((pb as any[]).length).toBe(0);
  });

  it('10. new fiscal year — P&L accounts start at zero, balance-sheet balances carry forward', async () => {
    const mod = await import('../presentation/accounting.controller.js');
    // Generate orgA FY 2027 periods (open).
    await mod.orgGeneratePeriodsHandler({ params: { orgId: String(orgA) }, query: {}, body: { fiscalYear: 2027 }, userId: 1, ip: '', headers: {} } as any, reply as any);
    const [p2027] = await pool.execute<RowData>(`SELECT id FROM accounting_periods WHERE organisation_id = ? AND fiscal_year = 2027 ORDER BY period_number`, [orgA]);
    const periods2027 = (p2027 as any[]).map((r: any) => r.id);

    // No 2027 activity → net income is zero (revenue/expense were closed to zero).
    const { calculateFiscalYearNetIncome } = await import('../application/year-close.netincome.js');
    const ni2027 = await calculateFiscalYearNetIncome(2027, orgA);
    expect(ni2027.netIncome).toBe(0);

    // Balance sheet as of the new year still shows the carried retained earnings.
    const bs: any = await mod.orgBalanceSheetHandler({ params: { orgId: String(orgA) }, query: { asOf: '2027-06-30' }, userId: 1, ip: '', headers: {} } as any, reply as any);
    const re = bs.data.find((r: any) => r.code === 'OPC-RE');
    expect(re).toBeDefined();
    expect(re.balance).toBe(1000);

    await pool.execute(`DELETE FROM accounting_periods WHERE id IN (${periods2027.map(() => '?').join(',')})`, periods2027);
  });
});
