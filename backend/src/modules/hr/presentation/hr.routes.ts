import type { FastifyInstance } from 'fastify';
import { authMiddleware, requirePermission } from '../../../shared/middleware/auth.middleware.js';
import * as ctrl from './hr.controller.js';

export async function hrRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // ── Departments ────────────────────────────────────────────────────────────
  app.get('/hr/departments', { preHandler: [requirePermission(['hr.departments.view'])] }, ctrl.listDepartmentsHandler);
  app.get('/hr/departments/:id', { preHandler: [requirePermission(['hr.departments.view'])] }, ctrl.getDepartmentHandler);
  app.post('/hr/departments', { preHandler: [requirePermission(['hr.departments.manage'])] }, ctrl.createDepartmentHandler);
  app.put('/hr/departments/:id', { preHandler: [requirePermission(['hr.departments.manage'])] }, ctrl.updateDepartmentHandler);
  app.delete('/hr/departments/:id', { preHandler: [requirePermission(['hr.departments.manage'])] }, ctrl.deleteDepartmentHandler);

  // ── Positions ──────────────────────────────────────────────────────────────
  app.get('/hr/positions', { preHandler: [requirePermission(['hr.positions.view'])] }, ctrl.listPositionsHandler);
  app.get('/hr/positions/:id', { preHandler: [requirePermission(['hr.positions.view'])] }, ctrl.getPositionHandler);
  app.post('/hr/positions', { preHandler: [requirePermission(['hr.positions.manage'])] }, ctrl.createPositionHandler);
  app.put('/hr/positions/:id', { preHandler: [requirePermission(['hr.positions.manage'])] }, ctrl.updatePositionHandler);
  app.delete('/hr/positions/:id', { preHandler: [requirePermission(['hr.positions.manage'])] }, ctrl.deletePositionHandler);

  // ── Employees ──────────────────────────────────────────────────────────────
  app.get('/hr/employees', { preHandler: [requirePermission(['hr.employees.view'])] }, ctrl.listEmployeesHandler);
  app.get('/hr/employees/:id', { preHandler: [requirePermission(['hr.employees.view'])] }, ctrl.getEmployeeHandler);
  app.post('/hr/employees', { preHandler: [requirePermission(['hr.employees.manage'])] }, ctrl.createEmployeeHandler);
  app.put('/hr/employees/:id', { preHandler: [requirePermission(['hr.employees.manage'])] }, ctrl.updateEmployeeHandler);
  app.patch('/hr/employees/:id/status', { preHandler: [requirePermission(['hr.employees.manage'])] }, ctrl.changeEmployeeStatusHandler);

  // ── Employment Contracts ───────────────────────────────────────────────────
  app.get('/hr/contracts', { preHandler: [requirePermission(['hr.contracts.view'])] }, ctrl.listContractsHandler);
  app.get('/hr/contracts/:id', { preHandler: [requirePermission(['hr.contracts.view'])] }, ctrl.getContractHandler);
  app.post('/hr/contracts', { preHandler: [requirePermission(['hr.contracts.manage'])] }, ctrl.createContractHandler);
  app.put('/hr/contracts/:id', { preHandler: [requirePermission(['hr.contracts.manage'])] }, ctrl.updateContractHandler);
  app.patch('/hr/contracts/:id/status', { preHandler: [requirePermission(['hr.contracts.manage'])] }, ctrl.changeContractStatusHandler);

  // ── Leave Types ────────────────────────────────────────────────────────────
  app.get('/hr/leave-types', { preHandler: [requirePermission(['hr.leaves.types.view'])] }, ctrl.listLeaveTypesHandler);
  app.get('/hr/leave-types/:id', { preHandler: [requirePermission(['hr.leaves.types.view'])] }, ctrl.getLeaveTypeHandler);
  app.post('/hr/leave-types', { preHandler: [requirePermission(['hr.leaves.types.manage'])] }, ctrl.createLeaveTypeHandler);
  app.put('/hr/leave-types/:id', { preHandler: [requirePermission(['hr.leaves.types.manage'])] }, ctrl.updateLeaveTypeHandler);
  app.delete('/hr/leave-types/:id', { preHandler: [requirePermission(['hr.leaves.types.manage'])] }, ctrl.deleteLeaveTypeHandler);

  // ── Leave Requests ─────────────────────────────────────────────────────────
  app.get('/hr/leave-requests', { preHandler: [requirePermission(['hr.leaves.requests.view'])] }, ctrl.listLeaveRequestsHandler);
  app.get('/hr/leave-requests/:id', { preHandler: [requirePermission(['hr.leaves.requests.view'])] }, ctrl.getLeaveRequestHandler);
  app.post('/hr/leave-requests', { preHandler: [requirePermission(['hr.leaves.requests.manage'])] }, ctrl.createLeaveRequestHandler);
  app.put('/hr/leave-requests/:id', { preHandler: [requirePermission(['hr.leaves.requests.manage'])] }, ctrl.updateLeaveRequestHandler);
  app.post('/hr/leave-requests/:id/submit', { preHandler: [requirePermission(['hr.leaves.requests.manage'])] }, ctrl.submitLeaveRequestHandler);
  app.post('/hr/leave-requests/:id/approve', { preHandler: [requirePermission(['hr.leaves.requests.approve'])] }, ctrl.approveLeaveRequestHandler);
  app.post('/hr/leave-requests/:id/reject', { preHandler: [requirePermission(['hr.leaves.requests.approve'])] }, ctrl.rejectLeaveRequestHandler);
  app.post('/hr/leave-requests/:id/cancel', { preHandler: [requirePermission(['hr.leaves.requests.manage'])] }, ctrl.cancelLeaveRequestHandler);

  // ── Leave Balances ─────────────────────────────────────────────────────────
  app.get('/hr/leave-balances', { preHandler: [requirePermission(['hr.leaves.balances.view'])] }, ctrl.getLeaveBalanceHandler);
  app.post('/hr/leave-balances/adjust', { preHandler: [requirePermission(['hr.leaves.balances.manage'])] }, ctrl.adjustLeaveBalanceHandler);

  // ── Staff Attendance ───────────────────────────────────────────────────────
  app.post('/hr/attendance/clock-in', { preHandler: [requirePermission(['hr.attendance.manage'])] }, ctrl.clockInHandler);
  app.post('/hr/attendance/clock-out', { preHandler: [requirePermission(['hr.attendance.manage'])] }, ctrl.clockOutHandler);
  app.post('/hr/attendance/log', { preHandler: [requirePermission(['hr.attendance.manage'])] }, ctrl.logAttendanceHandler);
  app.get('/hr/attendance', { preHandler: [requirePermission(['hr.attendance.view'])] }, ctrl.listAttendanceHandler);

  // ── Payroll Components ─────────────────────────────────────────────────────
  app.get('/hr/payroll-components', { preHandler: [requirePermission(['hr.payroll.components.view'])] }, ctrl.listPayrollComponentsHandler);
  app.post('/hr/payroll-components', { preHandler: [requirePermission(['hr.payroll.components.manage'])] }, ctrl.createPayrollComponentHandler);
  app.put('/hr/payroll-components/:id', { preHandler: [requirePermission(['hr.payroll.components.manage'])] }, ctrl.updatePayrollComponentHandler);
  app.delete('/hr/payroll-components/:id', { preHandler: [requirePermission(['hr.payroll.components.manage'])] }, ctrl.deletePayrollComponentHandler);

  // ── Payroll Runs ───────────────────────────────────────────────────────────
  app.get('/hr/payroll-runs', { preHandler: [requirePermission(['hr.payroll.runs.view'])] }, ctrl.listPayrollRunsHandler);
  app.get('/hr/payroll-runs/:id', { preHandler: [requirePermission(['hr.payroll.runs.view'])] }, ctrl.getPayrollRunHandler);
  app.post('/hr/payroll-runs', { preHandler: [requirePermission(['hr.payroll.runs.manage'])] }, ctrl.createPayrollRunHandler);
  app.post('/hr/payroll-runs/:id/calculate', { preHandler: [requirePermission(['hr.payroll.runs.calculate'])] }, ctrl.calculatePayrollRunHandler);
  app.post('/hr/payroll-runs/:id/approve', { preHandler: [requirePermission(['hr.payroll.runs.approve'])] }, ctrl.approvePayrollRunHandler);
  app.post('/hr/payroll-runs/:id/post', { preHandler: [requirePermission(['hr.payroll.runs.post'])] }, ctrl.postPayrollRunHandler);
  app.post('/hr/payroll-runs/:id/mark-paid', { preHandler: [requirePermission(['hr.payroll.runs.manage'])] }, ctrl.markPayrollPaidHandler);
  app.post('/hr/payroll-runs/:id/close', { preHandler: [requirePermission(['hr.payroll.runs.manage'])] }, ctrl.closePayrollRunHandler);

  // ── HR Dashboard ───────────────────────────────────────────────────────────
  app.get('/hr/dashboard', { preHandler: [requirePermission(['hr.dashboard.view'])] }, ctrl.hrDashboardHandler);
}
