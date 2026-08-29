import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

/**
 * P3-8 — Payroll paid GL clearing posting.
 *
 * markPayrollPaidHandler previously changed payroll_runs.status = paid and
 * recorded an administrative audit but posted NO accounting. This spec proves
 * the clearing posting:
 *   debit  salary_payable (2200)
 *   credit cash_bank      (1120)
 * per employee (payroll_entries.id source_id, matching the F-6 dedup
 * convention of payroll POST) inside one transaction with a guarded
 * transition — idempotent under concurrency and atomic on failure.
 */

const executeMock = vi.fn();
const getConnectionMock = vi.fn();
const resolveMappingMock = vi.fn();

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: executeMock,
    getConnection: getConnectionMock,
  }),
}));
vi.mock('../../audit-log/index.js', () => ({
  recordAudit: vi.fn(),
}));
vi.mock('../../financial/application/accounting-engine.service.js', () => ({
  accountingEngineService: { resolveMapping: resolveMappingMock },
}));

const { markPayrollPaidHandler } = await import('../presentation/hr.controller.js');

function makeReply() {
  const sent: any = { body: null, code: null };
  return {
    send: (body: any) => { sent.body = body; return sent; },
    status: (code: number) => ({ send: (body: any) => { sent.body = body; sent.code = code; return sent; } }),
    __sent: sent,
  };
}

const makeRequest = (id: number) => ({ params: { id }, userId: 1, headers: {}, ip: '127.0.0.1' } as any);

let lastConn: any;
function setupPool() {
  lastConn = {
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
    execute: executeMock,
  };
  getConnectionMock.mockResolvedValue(lastConn);
}

beforeEach(() => {
  vi.clearAllMocks();
  executeMock.mockReset();
  getConnectionMock.mockReset();
  resolveMappingMock.mockReset();
  resolveMappingMock.mockResolvedValue([
    { concept: 'salary_payable', accountId: 2200 },
    { concept: 'cash_bank', accountId: 1120 },
  ]);
  setupPool();
});

function ledgerInserts() {
  return executeMock.mock.calls.filter((c: any) => String(c[0]).includes('INSERT INTO ledger_entries'));
}

function glInserts() {
  return executeMock.mock.calls.filter((c: any) => String(c[0]).includes('INSERT INTO general_ledger'));
}

// Standard mock stream for: SELECT run (FOR UPDATE) → guarded UPDATE paid →
// SELECT entries (JOIN employees) → SELECT open period → [Dr le, Dr gl, Cr le, Cr gl] per employee.
function runPostedScenario(entries: any[]) {
  executeMock
    .mockResolvedValueOnce([[{ id: 10, status: 'posted', period_start: '2026-08-01', period_end: '2026-08-31', organisation_id: 5 }]]) // FOR UPDATE read
    .mockResolvedValueOnce([{ affectedRows: 1 }]) // guarded transition → paid
    .mockResolvedValueOnce([entries.map((e) => ({ id: e.id, payroll_run_id: 10, employee_id: e.employee_id, net_pay: e.net_pay, user_id: e.user_id }))])
    .mockResolvedValueOnce([[{ id: 470 }]]) // open period
    ;
  for (const e of entries) {
    executeMock.mockResolvedValueOnce([{ insertId: e.id * 10 }]);      // Dr le insertId
    executeMock.mockResolvedValueOnce([]);                              // Dr gl
    executeMock.mockResolvedValueOnce([{ insertId: e.id * 10 + 1 }]);   // Cr le insertId
    executeMock.mockResolvedValueOnce([]);                              // Cr gl
  }
}

describe('P3-8 — markPayrollPaidHandler posts GL clearing', () => {
  it('normal path: status → paid, paid_at set, balanced payroll_paid posting (Dr salary_payable / Cr cash_bank)', async () => {
    runPostedScenario([{ id: 101, employee_id: 1, net_pay: 500, user_id: 7 }]);
    const reply = makeReply();
    await markPayrollPaidHandler(makeRequest(10), reply as any);

    expect(reply.__sent.body).toEqual({ data: { id: 10, status: 'paid' } });

    // Transition UPDATE uses paid + guarded status (not a bare id update).
    const paidUpdate = executeMock.mock.calls.find((c: any) => /UPDATE payroll_runs SET status = 'paid'/.test(String(c[0])));
    expect(paidUpdate).toBeTruthy();
    expect(String(paidUpdate[0])).toContain('AND status = ?');

    const leRows = ledgerInserts();
    expect(leRows).toHaveLength(2); // Dr + Cr
    // Dr salary_payable (2200), Cr cash_bank (1120)
    expect(leRows[0][1][3]).toBe(2200);
    expect(leRows[1][1][3]).toBe(1120);
    // Both rows carry event_type payroll_paid (literal in SQL) + per-employee source_id (101)
    expect(leRows.every((c: any) => String(c[0]).includes("'payroll_paid'") && c[1][1] === 101)).toBe(true);
    expect(String(leRows[0][0]).includes("'debit'")).toBe(true);
    expect(String(leRows[1][0]).includes("'credit'")).toBe(true);
    // Amount = net_pay (500) each side
    expect(leRows[0][1][4]).toBe(500);
    expect(leRows[1][1][4]).toBe(500);

    expect(lastConn.commit).toHaveBeenCalled();
    expect(lastConn.rollback).not.toHaveBeenCalled();
  });

  it('multiple employees: payroll_paid amount = SUM(net_pay) = 1000, balanced', async () => {
    runPostedScenario([
      { id: 201, employee_id: 1, net_pay: 400, user_id: 7 },
      { id: 202, employee_id: 2, net_pay: 600, user_id: 8 },
    ]);
    const reply = makeReply();
    await markPayrollPaidHandler(makeRequest(20), reply as any);

    const leRows = ledgerInserts();
    expect(leRows).toHaveLength(4); // 2 employees × (Dr + Cr)

    // Distinct (source_id, chart_account_id, side) — uk_dedup identity.
    const keys = leRows.map((c: any) => `${c[1][1]}:${c[1][3]}:${String(c[0]).includes("'debit'") ? 'debit' : 'credit'}`);
    expect(new Set(keys).size).toBe(4);

    let drTotal = 0, crTotal = 0;
    for (const c of leRows) {
      if (String(c[0]).includes("'debit'")) drTotal += Number(c[1][4]);
      else crTotal += Number(c[1][4]);
    }
    // Dr salary_payable total = 1000, Cr cash_bank total = 1000 → balanced
    expect(drTotal).toBe(1000);
    expect(crTotal).toBe(1000);
    expect(drTotal).toBe(crTotal);
  });

  it('invalid transition (not posted) fails with no GL and status unchanged', async () => {
    executeMock.mockResolvedValueOnce([[{ id: 10, status: 'approved', period_start: '2026-08-01', period_end: '2026-08-31', organisation_id: 5 }]]);
    await expect(markPayrollPaidHandler(makeRequest(10), makeReply() as any)).rejects.toThrow(/Invalid state transition/);
    expect(ledgerInserts()).toHaveLength(0);
    expect(lastConn.commit).not.toHaveBeenCalled();
  });

  it('already paid → PAYROLL_ALREADY_PAID, no duplicate posting', async () => {
    executeMock.mockResolvedValueOnce([[{ id: 10, status: 'paid', period_start: '2026-08-01', period_end: '2026-08-31', organisation_id: 5 }]]);
    await expect(markPayrollPaidHandler(makeRequest(10), makeReply() as any))
      .rejects.toMatchObject({ code: 'PAYROLL_ALREADY_PAID' });
    expect(ledgerInserts()).toHaveLength(0);
  });

  it('concurrent mark-paid: guarded UPDATE with 0 rows → PAYROLL_ALREADY_PAID, no GL', async () => {
    executeMock
      .mockResolvedValueOnce([[{ id: 10, status: 'posted', period_start: '2026-08-01', period_end: '2026-08-31', organisation_id: 5 }]]) // FOR UPDATE
      .mockResolvedValueOnce([{ affectedRows: 0 }]); // guarded transition → someone else paid first
    await expect(markPayrollPaidHandler(makeRequest(10), makeReply() as any))
      .rejects.toMatchObject({ code: 'PAYROLL_ALREADY_PAID' });
    expect(lastConn.rollback).toHaveBeenCalled();
    expect(ledgerInserts()).toHaveLength(0);
  });

  it('accounting failure rolls back: status stays posted, no committed GL', async () => {
    executeMock
      .mockResolvedValueOnce([[{ id: 10, status: 'posted', period_start: '2026-08-01', period_end: '2026-08-31', organisation_id: 5 }]]) // FOR UPDATE
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // guarded transition OK
      .mockResolvedValueOnce([[{ id: 101, payroll_run_id: 10, employee_id: 1, net_pay: 500, user_id: 7 }]])
      .mockResolvedValueOnce([[{ id: 470 }]]) // open period
      .mockRejectedValueOnce(new Error('ER_DUP_ENTRY')); // Dr ledger insert fails
    await expect(markPayrollPaidHandler(makeRequest(10), makeReply() as any)).rejects.toThrow('ER_DUP_ENTRY');
    expect(lastConn.rollback).toHaveBeenCalled();
    expect(lastConn.commit).not.toHaveBeenCalled();
  });

  it('missing payroll_paid mapping → CONFIG_ERROR, rollback, no GL, status not paid', async () => {
    resolveMappingMock.mockResolvedValue([{ concept: 'salary_payable', accountId: 2200 }]); // missing cash_bank
    executeMock
      .mockResolvedValueOnce([[{ id: 10, status: 'posted', period_start: '2026-08-01', period_end: '2026-08-31', organisation_id: 5 }]]) // FOR UPDATE
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // guarded transition OK
      .mockResolvedValueOnce([[{ id: 101, payroll_run_id: 10, employee_id: 1, net_pay: 500, user_id: 7 }]])
      .mockResolvedValueOnce([[{ id: 470 }]]); // open period
    await expect(markPayrollPaidHandler(makeRequest(10), makeReply() as any))
      .rejects.toMatchObject({ errorCode: 'CONFIG_ERROR' });
    expect(lastConn.rollback).toHaveBeenCalled();
    expect(ledgerInserts()).toHaveLength(0);
  });

  it('balanced GL: debit_total === credit_total in general_ledger', async () => {
    runPostedScenario([
      { id: 201, employee_id: 1, net_pay: 400, user_id: 7 },
      { id: 202, employee_id: 2, net_pay: 600, user_id: 8 },
    ]);
    await markPayrollPaidHandler(makeRequest(20), makeReply() as any);

    const gl = glInserts();
    let debitTotal = 0, creditTotal = 0;
    for (const c of gl) {
      debitTotal += Number(c[1][4] || 0);
      creditTotal += Number(c[1][5] || 0);
    }
    expect(debitTotal).toBe(1000);
    expect(creditTotal).toBe(1000);
    expect(debitTotal).toBe(creditTotal);
  });
});