import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

/**
 * W1-F-006 — HR frontend/backend integration.
 *
 * Mocked-DB tests only (no database, no SQL execution). They lock down:
 *   - /admin/hr/* registration while /hr/* stays backward compatible;
 *   - the six page GET contracts (dashboard, employees, departments, attendance,
 *     leave, payroll);
 *   - dashboard SQL validity with and without organisationId;
 *   - canonical users columns (full_name / phone_number);
 *   - employees department_id + pagination + total;
 *   - attendance param aliases + pagination + total;
 *   - frontend lifecycle / clock adapters delegating to canonical handlers.
 */

const executeMock = vi.fn();
const queryMock = vi.fn();

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: executeMock, query: queryMock }),
}));
vi.mock('../../audit-log/index.js', () => ({
  recordAudit: vi.fn(),
}));
vi.mock('../../financial/application/accounting-engine.service.js', () => ({
  accountingEngineService: { resolveMapping: vi.fn() },
}));

const {
  hrDashboardHandler,
  listEmployeesHandler,
  listAttendanceHandler,
  listLeaveRequestsHandler,
  listPayrollRunsHandler,
  listContractsHandler,
  changeEmployeeStatusByActionHandler,
  clockByTypeHandler,
} = await import('../presentation/hr.controller.js');
const { hrRoutes } = await import('../presentation/hr.routes.js');

function makeReply() {
  const sent: any = { body: null, code: 200 };
  return {
    send: (body: any) => { sent.body = body; return sent; },
    status: (code: number) => ({ send: (body: any) => { sent.body = body; sent.code = code; return sent; } }),
    __sent: sent,
  };
}

function sqlCalls(mock: any): string[] {
  return mock.mock.calls.map(([sql]: any[]) => String(sql));
}

beforeEach(() => {
  vi.clearAllMocks();
  executeMock.mockReset();
  queryMock.mockReset();
});

describe('HR route registration', () => {
  it('registers /admin/hr/* and preserves /hr/* backward compatibility', async () => {
    const app = Fastify();
    await app.register(hrRoutes);
    await app.register(hrRoutes, { prefix: '/admin' });
    await app.ready();

    const routes: Array<[string, string]> = [
      ['GET', '/hr/dashboard'],
      ['GET', '/admin/hr/dashboard'],
      ['GET', '/admin/hr/employees'],
      ['GET', '/admin/hr/departments'],
      ['GET', '/admin/hr/attendance'],
      ['GET', '/admin/hr/leave/requests'],
      ['GET', '/admin/hr/payroll/runs'],
      ['GET', '/admin/hr/leave/types'],
      ['GET', '/admin/hr/payroll/components'],
      ['POST', '/admin/hr/attendance/clock'],
      ['GET', '/admin/hr/employees/:id/contracts'],
      ['GET', '/admin/hr/employees/:id/leave'],
      ['GET', '/admin/hr/employees/:id/attendance'],
      ['POST', '/admin/hr/employees/:id/:action'],
      ['POST', '/admin/hr/payroll/runs/:id/calculate'],
      ['POST', '/admin/hr/payroll/runs/:id/approve'],
      ['POST', '/admin/hr/payroll/runs/:id/post'],
      ['POST', '/admin/hr/payroll/runs/:id/mark-paid'],
      ['POST', '/admin/hr/payroll/runs/:id/close'],
    ];

    for (const [method, url] of routes) {
      expect(app.hasRoute({ method: method as any, url }), `${method} ${url}`).toBe(true);
    }

    await app.close();
  });
});

describe('HR dashboard SQL and contract', () => {
  it('builds valid SQL without organisationId and returns the frontend contract', async () => {
    executeMock.mockImplementation(async (sql: string) => {
      if (String(sql).includes('GROUP BY employment_status')) return [[{ employment_status: 'active', count: 2 }]];
      return [[{ count: 3 }]];
    });

    const reply = makeReply();
    await hrDashboardHandler({ query: {} } as any, reply);

    const sqls = sqlCalls(executeMock);
    expect(sqls.some((s) => s.includes('FROM departments WHERE is_active = 1'))).toBe(true);
    expect(sqls.some((s) => s.includes("FROM payroll_runs WHERE status IN ('draft','calculated','approved')"))).toBe(true);
    expect(sqls.every((s) => !s.includes('AND is_active = 1'))).toBe(true);

    expect(reply.__sent.body.data).toMatchObject({
      totalEmployees: 3,
      activeEmployees: 3,
      pendingLeave: 3,
      departments: 3,
      openPayroll: 3,
    });
    expect(reply.__sent.body.data.employeesByStatus).toEqual([{ employment_status: 'active', count: 2 }]);
  });

  it('applies organisation scoping when organisationId is supplied', async () => {
    executeMock.mockImplementation(async () => [[{ count: 0 }]]);
    await hrDashboardHandler({ query: { organisationId: '5' } } as any, makeReply());

    const calls = executeMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [sql, params] of calls) {
      expect(String(sql)).toContain('organisation_id = ?');
      expect(params).toEqual([5]);
    }
  });
});

describe('HR employees contract', () => {
  it('supports department_id, pagination and returns total', async () => {
    executeMock.mockResolvedValueOnce([[{ total: 3 }]]);
    queryMock.mockResolvedValueOnce([[{ id: 1, full_name: 'A' }]]);

    const reply = makeReply();
    await listEmployeesHandler({ query: { department_id: '3', page: '2', limit: '10' }, params: {} } as any, reply);

    const [countSql, countParams] = executeMock.mock.calls[0];
    expect(String(countSql)).toContain('e.department_id = ?');
    expect(countParams).toEqual([3]);

    const [mainSql, mainParams] = queryMock.mock.calls[0];
    expect(String(mainSql)).toContain('LIMIT ? OFFSET ?');
    expect(String(mainSql)).toContain('u.full_name');
    expect(String(mainSql)).toContain('u.phone_number AS phone');
    expect(String(mainSql)).toContain('p.title AS position');
    expect(String(mainSql)).not.toContain('first_name');
    expect(String(mainSql)).not.toContain('last_name');
    expect(String(mainSql)).not.toContain('u.phone ');
    expect(mainParams).toEqual([3, 10, 10]);

    expect(reply.__sent.body).toMatchObject({ total: 3, page: 2, limit: 10 });
    expect(reply.__sent.body.data).toEqual([{ id: 1, full_name: 'A' }]);
  });

  it('keeps departmentId backward compatibility', async () => {
    executeMock.mockResolvedValueOnce([[{ total: 0 }]]);
    queryMock.mockResolvedValueOnce([[]]);

    await listEmployeesHandler({ query: { departmentId: '4' }, params: {} } as any, makeReply());

    expect(executeMock.mock.calls[0][1]).toEqual([4]);
  });
});

describe('HR attendance contract', () => {
  it('supports employee_id/date_from/date_to, pagination and returns total', async () => {
    executeMock.mockResolvedValueOnce([[{ total: 1 }]]);
    queryMock.mockResolvedValueOnce([[{ id: 1 }]]);

    const reply = makeReply();
    await listAttendanceHandler({
      query: { employee_id: '7', date_from: '2026-01-01', date_to: '2026-01-31', page: '1', limit: '20' },
      params: {},
    } as any, reply);

    const [countSql, countParams] = executeMock.mock.calls[0];
    expect(String(countSql)).toContain('sa.employee_id = ?');
    expect(String(countSql)).toContain('sa.attendance_date >= ?');
    expect(countParams).toEqual([7, '2026-01-01', '2026-01-31']);

    const [mainSql, mainParams] = queryMock.mock.calls[0];
    expect(String(mainSql)).toContain('LIMIT ? OFFSET ?');
    expect(String(mainSql)).toContain('u.full_name AS employee_name');
    expect(String(mainSql)).toContain('sa.attendance_date AS date');
    expect(String(mainSql)).not.toContain('first_name');
    expect(mainParams).toEqual([7, '2026-01-01', '2026-01-31', 20, 0]);

    expect(reply.__sent.body).toMatchObject({ total: 1, page: 1, limit: 20 });
  });

  it('keeps camelCase params backward compatible', async () => {
    executeMock.mockResolvedValueOnce([[{ total: 0 }]]);
    queryMock.mockResolvedValueOnce([[]]);

    await listAttendanceHandler({
      query: { employeeId: '9', from: '2026-02-01', to: '2026-02-28' },
      params: {},
    } as any, makeReply());

    expect(executeMock.mock.calls[0][1]).toEqual([9, '2026-02-01', '2026-02-28']);
  });
});

describe('HR canonical users columns', () => {
  it('uses full_name/phone_number in leave, payroll and contract SQL', async () => {
    executeMock.mockResolvedValue([[]]);

    await listLeaveRequestsHandler({ query: {}, params: {} } as any, makeReply());
    await listPayrollRunsHandler({ query: {} } as any, makeReply());
    await listContractsHandler({ query: {}, params: {} } as any, makeReply());

    const joined = sqlCalls(executeMock).join('\n');
    expect(joined).toContain('u.full_name');
    expect(joined).toContain('u.full_name AS employee_name');
    expect(joined).toContain('lr.duration_days AS days');
    expect(joined).not.toContain('first_name');
    expect(joined).not.toContain('last_name');
    expect(joined).not.toContain('u.phone ');
  });
});

describe('HR frontend adapters', () => {
  it('maps employee lifecycle actions to canonical statuses', async () => {
    executeMock
      .mockResolvedValueOnce([[{ id: 5, employment_status: 'draft' }]])
      .mockResolvedValueOnce([[{ affectedRows: 1 }]]);

    const reply = makeReply();
    await changeEmployeeStatusByActionHandler({
      params: { id: '5', action: 'activate' },
      body: {},
      userId: 1,
      headers: {},
      ip: '127.0.0.1',
    } as any, reply);

    const updateCall = executeMock.mock.calls[1];
    expect(String(updateCall[0])).toContain('UPDATE employees SET employment_status = ?');
    expect(updateCall[1][0]).toBe('active');
    expect(reply.__sent.body.data).toEqual({ id: 5, status: 'active' });
  });

  it('rejects unsupported lifecycle actions', async () => {
    await expect(changeEmployeeStatusByActionHandler({
      params: { id: '5', action: 'explode' },
      body: {},
      userId: 1,
      headers: {},
      ip: '127.0.0.1',
    } as any, makeReply())).rejects.toMatchObject({ statusCode: 400 });
  });

  it('maps attendance clock type in to the canonical clock-in handler', async () => {
    executeMock.mockResolvedValueOnce([[]]);
    executeMock.mockResolvedValueOnce([[1]]);

    const reply = makeReply();
    await clockByTypeHandler({
      body: { employee_id: 7, type: 'in' },
      userId: 1,
      headers: {},
      ip: '127.0.0.1',
    } as any, reply);

    expect(executeMock.mock.calls[0][1][0]).toBe(7);
    expect(reply.__sent.code).toBe(201);
  });

  it('rejects unsupported clock types', async () => {
    await expect(clockByTypeHandler({
      body: { employee_id: 7, type: 'sideways' },
      userId: 1,
      headers: {},
      ip: '127.0.0.1',
    } as any, makeReply())).rejects.toMatchObject({ statusCode: 400 });
  });
});
