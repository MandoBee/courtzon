import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

/**
 * F-6 — Payroll multi-employee GL dedup collision.
 *
 * ledger_entries.uk_dedup is (source_type, source_id, event_type,
 * chart_account_id, side). The payroll post path must use a PER-EMPLOYEE
 * source_id (the payroll_entries.id) so that multiple employees posting to the
 * same salary_expense (5300) / salary_payable (2200) accounts produce distinct
 * dedup identities. Previously it used the payroll run id for every employee,
 * so the 2nd employee's debit row collided → ER_DUP_ENTRY → whole run rolled
 * back.
 *
 * Whole-run idempotency is preserved by the payroll_runs state machine
 * (approved → posted) + FOR UPDATE read + status-guarded transition UPDATE.
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

const { postPayrollRunHandler } = await import('../presentation/hr.controller.js');

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
    { concept: 'salary_expense', accountId: 5300 },
    { concept: 'salary_payable', accountId: 2200 },
  ]);
  setupPool();
});

// Helper: capture ledger_entries INSERT calls and return [sql, params] rows.
function ledgerInserts() {
  return executeMock.mock.calls.filter((c: any) => String(c[0]).includes('INSERT INTO ledger_entries'));
}

// Helper: parse source_id (params[1]) and side (from SQL) for each ledger row.
function dedupKeys() {
  return ledgerInserts().map((c: any) => {
    const sql = String(c[0]);
    const side = sql.includes("'debit'") ? 'debit' : sql.includes("'credit'") ? 'credit' : '?';
    return `${c[1][1]}:${c[1][3]}:${side}`; // source_id:chart_account_id:side
  });
}

describe('F-6 — postPayrollRunHandler uses per-employee source_id (dedup-safe)', () => {
  it('single-employee payroll posts successfully (2 ledger rows, one Dr + one Cr)', async () => {
    executeMock
      .mockResolvedValueOnce([[{ id: 10, status: 'approved', period_start: '2026-08-01', period_end: '2026-08-31', organisation_id: 5 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 101, payroll_run_id: 10, employee_id: 1, net_pay: 500, user_id: 7 }]])
      .mockResolvedValueOnce([[{ id: 470 }]])
      .mockResolvedValueOnce([{ insertId: 2000 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ insertId: 2001 }])
      .mockResolvedValueOnce([]);

    const reply = makeReply();
    await postPayrollRunHandler(makeRequest(10), reply as any);
    expect(reply.__sent.body).toEqual({ data: { id: 10, status: 'posted' } });

    const rows = ledgerInserts();
    expect(rows).toHaveLength(2);
    // Both rows carry the per-employee source_id (101), not the run id (10).
    expect(rows.every((c: any) => c[1][1] === 101)).toBe(true);
    expect(rows[0][1][3]).toBe(5300); // salary_expense
    expect(rows[1][1][3]).toBe(2200); // salary_payable
  });

  it('multi-employee payroll (same salary_expense + salary_payable accounts) uses distinct per-employee source_ids', async () => {
    executeMock
      .mockResolvedValueOnce([[{ id: 20, status: 'approved', period_start: '2026-08-01', period_end: '2026-08-31', organisation_id: 5 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[
        { id: 201, payroll_run_id: 20, employee_id: 1, net_pay: 500, user_id: 7 },
        { id: 202, payroll_run_id: 20, employee_id: 2, net_pay: 700, user_id: 8 },
      ]])
      .mockResolvedValueOnce([[{ id: 470 }]])
      .mockResolvedValueOnce([{ insertId: 3000 }]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ insertId: 3001 }]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ insertId: 3002 }]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ insertId: 3003 }]).mockResolvedValueOnce([]);

    const reply = makeReply();
    await postPayrollRunHandler(makeRequest(20), reply as any);

    const rows = ledgerInserts();
    expect(rows).toHaveLength(4); // 2 employees × (Dr + Cr)

    // Distinct (source_id, chart_account_id, side) tuples — the uk_dedup identity.
    const keys = dedupKeys();
    expect(keys).toHaveLength(4);
    expect(new Set(keys).size).toBe(4);

    // Employee 1 → source_id 201; employee 2 → source_id 202.
    const sourceIds = rows.map((c: any) => c[1][1]);
    expect(sourceIds).toEqual([201, 201, 202, 202]);
  });

  it('debit total equals credit total across all employees (balanced)', async () => {
    executeMock
      .mockResolvedValueOnce([[{ id: 30, status: 'approved', period_start: '2026-08-01', period_end: '2026-08-31', organisation_id: 5 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[
        { id: 301, payroll_run_id: 30, employee_id: 1, net_pay: 500, user_id: 7 },
        { id: 302, payroll_run_id: 30, employee_id: 2, net_pay: 700, user_id: 8 },
      ]])
      .mockResolvedValueOnce([[{ id: 470 }]])
      .mockResolvedValueOnce([{ insertId: 4000 }]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ insertId: 4001 }]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ insertId: 4002 }]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ insertId: 4003 }]).mockResolvedValueOnce([]);

    await postPayrollRunHandler(makeRequest(30), makeReply() as any);

    // general_ledger INSERT params: [leId, periodId, accountId, entry_date, debit, credit, refId, desc, user]
    const glInserts = executeMock.mock.calls.filter((c: any) => String(c[0]).includes('INSERT INTO general_ledger'));
    let debitTotal = 0, creditTotal = 0;
    for (const c of glInserts) {
      debitTotal += Number(c[1][4] || 0);
      creditTotal += Number(c[1][5] || 0);
    }
    expect(debitTotal).toBe(1200);
    expect(creditTotal).toBe(1200);
  });

  it('posting an already-posted run is rejected (idempotent guard, no GL rows)', async () => {
    executeMock
      .mockResolvedValueOnce([[{ id: 40, status: 'posted', period_start: '2026-08-01', period_end: '2026-08-31', organisation_id: 5 }]]);

    await expect(postPayrollRunHandler(makeRequest(40), makeReply() as any)).rejects.toThrow();
    expect(ledgerInserts()).toHaveLength(0);
  });

  it('transition UPDATE with 0 affected rows (concurrent post) rejects without GL rows', async () => {
    executeMock
      .mockResolvedValueOnce([[{ id: 50, status: 'approved', period_start: '2026-08-01', period_end: '2026-08-31', organisation_id: 5 }]])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);

    await expect(postPayrollRunHandler(makeRequest(50), makeReply() as any))
      .rejects.toMatchObject({ code: 'PAYROLL_ALREADY_POSTED' });
    expect(ledgerInserts()).toHaveLength(0);
  });

  it('a mid-posting failure rolls back (no partial GL rows)', async () => {
    executeMock
      .mockResolvedValueOnce([[{ id: 60, status: 'approved', period_start: '2026-08-01', period_end: '2026-08-31', organisation_id: 5 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[
        { id: 601, payroll_run_id: 60, employee_id: 1, net_pay: 500, user_id: 7 },
        { id: 602, payroll_run_id: 60, employee_id: 2, net_pay: 700, user_id: 8 },
      ]])
      .mockResolvedValueOnce([[{ id: 470 }]])
      .mockResolvedValueOnce([{ insertId: 5000 }]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ insertId: 5001 }]).mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('ER_DUP_ENTRY')); // employee2 Dr fails

    await expect(postPayrollRunHandler(makeRequest(60), makeReply() as any)).rejects.toThrow('ER_DUP_ENTRY');
    expect(lastConn.rollback).toHaveBeenCalled();
    expect(lastConn.commit).not.toHaveBeenCalled();
  });
});