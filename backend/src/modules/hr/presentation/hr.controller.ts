import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';
import { AppError, NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

const VALID_EMPLOYMENT_STATUSES = ['draft','onboarding','active','on_leave','suspended','terminated','archived'] as const;
const VALID_LEAVE_STATUSES = ['draft','submitted','approved','rejected','cancelled','completed'] as const;
const VALID_PAYROLL_STATUSES = ['draft','calculated','approved','posted','paid','closed'] as const;

function assertValidTransition(current: string, next: string, validTransitions: Record<string, string[]>): void {
  const allowed = validTransitions[current];
  if (!allowed || !allowed.includes(next)) {
    throw new AppError(`Invalid state transition from '${current}' to '${next}'`, 400, 'VALIDATION_ERROR');
  }
}

// ─── Departments ─────────────────────────────────────────────────────────────

export async function listDepartmentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];
  const conditions: string[] = [];

  if (query.organisationId) { conditions.push('d.organisation_id = ?'); params.push(Number(query.organisationId)); }
  if (query.isActive !== undefined) { conditions.push('d.is_active = ?'); params.push(query.isActive); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await pool.execute<RowData>(
    `SELECT d.*, p.name AS parent_name, e.employee_code AS head_code
     FROM departments d
     LEFT JOIN departments p ON p.id = d.parent_id
     LEFT JOIN employees e ON e.id = d.head_employee_id
     ${where}
     ORDER BY d.name`,
    params
  );
  return reply.send({ data: rows });
}

export async function getDepartmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const [rows] = await pool.execute<RowData>(
    `SELECT d.*, p.name AS parent_name, e.employee_code AS head_code
     FROM departments d
     LEFT JOIN departments p ON p.id = d.parent_id
     LEFT JOIN employees e ON e.id = d.head_employee_id
     WHERE d.id = ?`,
    [Number(id)]
  );
  if (!rows.length) throw new NotFoundError('Department', ErrorCodes.DEPARTMENT_NOT_FOUND);
  return reply.send({ data: rows[0] });
}

export async function createDepartmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const [result] = await pool.execute<RowData>(
    `INSERT INTO departments (organisation_id, name, parent_id, head_employee_id, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [body.organisationId, body.name, body.parentId || null, body.headEmployeeId || null, body.isActive ?? 1]
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'HR.DEPARTMENT.CREATE',
    entityType: 'departments',
    entityId: insertId,
    afterState: { name: body.name, organisationId: body.organisationId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { id: insertId } });
}

export async function updateDepartmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM departments WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Department', ErrorCodes.DEPARTMENT_NOT_FOUND);

  await pool.execute<RowData>(
    `UPDATE departments SET name = COALESCE(?, name), parent_id = COALESCE(?, parent_id), head_employee_id = COALESCE(?, head_employee_id), is_active = COALESCE(?, is_active) WHERE id = ?`,
    [body.name ?? null, body.parentId ?? null, body.headEmployeeId ?? null, body.isActive ?? null, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'HR.DEPARTMENT.UPDATE',
    entityType: 'departments',
    entityId: Number(id),
    beforeState: { name: existing[0].name },
    afterState: { name: body.name },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id) } });
}

export async function deleteDepartmentHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM departments WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Department', ErrorCodes.DEPARTMENT_NOT_FOUND);

  await pool.execute<RowData>(`UPDATE departments SET is_active = 0 WHERE id = ?`, [Number(id)]);

  recordAudit({
    actorId: userId,
    action: 'HR.DEPARTMENT.DELETE',
    entityType: 'departments',
    entityId: Number(id),
    afterState: { isActive: 0 },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), isActive: 0 } });
}

// ─── Positions ───────────────────────────────────────────────────────────────

export async function listPositionsHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];
  const conditions: string[] = [];

  if (query.organisationId) { conditions.push('p.organisation_id = ?'); params.push(Number(query.organisationId)); }
  if (query.departmentId) { conditions.push('p.department_id = ?'); params.push(Number(query.departmentId)); }
  if (query.isActive !== undefined) { conditions.push('p.is_active = ?'); params.push(query.isActive); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await pool.execute<RowData>(
    `SELECT p.*, d.name AS department_name
     FROM positions p
     LEFT JOIN departments d ON d.id = p.department_id
     ${where}
     ORDER BY p.title`,
    params
  );
  return reply.send({ data: rows });
}

export async function getPositionHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const [rows] = await pool.execute<RowData>(
    `SELECT p.*, d.name AS department_name
     FROM positions p
     LEFT JOIN departments d ON d.id = p.department_id
     WHERE p.id = ?`,
    [Number(id)]
  );
  if (!rows.length) throw new NotFoundError('Position', ErrorCodes.POSITION_NOT_FOUND);
  return reply.send({ data: rows[0] });
}

export async function createPositionHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const [result] = await pool.execute<RowData>(
    `INSERT INTO positions (organisation_id, department_id, title, description, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [body.organisationId, body.departmentId || null, body.title, body.description || null, body.isActive ?? 1]
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'HR.POSITION.CREATE',
    entityType: 'positions',
    entityId: insertId,
    afterState: { title: body.title, organisationId: body.organisationId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { id: insertId } });
}

export async function updatePositionHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM positions WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Position', ErrorCodes.POSITION_NOT_FOUND);

  await pool.execute<RowData>(
    `UPDATE positions SET title = COALESCE(?, title), description = COALESCE(?, description), department_id = COALESCE(?, department_id), is_active = COALESCE(?, is_active) WHERE id = ?`,
    [body.title ?? null, body.description ?? null, body.departmentId ?? null, body.isActive ?? null, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'HR.POSITION.UPDATE',
    entityType: 'positions',
    entityId: Number(id),
    beforeState: { title: existing[0].title },
    afterState: { title: body.title },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id) } });
}

export async function deletePositionHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM positions WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Position', ErrorCodes.POSITION_NOT_FOUND);

  await pool.execute<RowData>(`UPDATE positions SET is_active = 0 WHERE id = ?`, [Number(id)]);

  recordAudit({
    actorId: userId,
    action: 'HR.POSITION.DELETE',
    entityType: 'positions',
    entityId: Number(id),
    afterState: { isActive: 0 },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), isActive: 0 } });
}

// ─── Employees ───────────────────────────────────────────────────────────────

const EMPLOYEE_TRANSITIONS: Record<string, string[]> = {
  draft: ['onboarding', 'active', 'terminated', 'archived'],
  onboarding: ['active', 'terminated', 'suspended', 'archived'],
  active: ['on_leave', 'suspended', 'terminated', 'archived', 'onboarding'],
  on_leave: ['active', 'terminated', 'suspended', 'archived'],
  suspended: ['active', 'terminated', 'archived', 'on_leave'],
  terminated: ['archived'],
  archived: [],
};

export async function listEmployeesHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];
  const conditions: string[] = [];

  if (query.organisationId) { conditions.push('e.organisation_id = ?'); params.push(Number(query.organisationId)); }
  if (query.departmentId) { conditions.push('e.department_id = ?'); params.push(Number(query.departmentId)); }
  if (query.positionId) { conditions.push('e.position_id = ?'); params.push(Number(query.positionId)); }
  if (query.status) { conditions.push('e.employment_status = ?'); params.push(query.status); }
  if (query.search) { conditions.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR e.employee_code LIKE ?)'); params.push(`%${query.search}%`, `%${query.search}%`, `%${query.search}%`, `%${query.search}%`); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await pool.execute<RowData>(
    `SELECT e.*, u.first_name, u.last_name, u.email, u.phone, d.name AS department_name, p.title AS position_title, r.employee_code AS reports_to_code
     FROM employees e
     JOIN users u ON u.id = e.user_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions p ON p.id = e.position_id
     LEFT JOIN employees r ON r.id = e.reports_to
     ${where}
     ORDER BY u.last_name, u.first_name`,
    params
  );
  return reply.send({ data: rows });
}

export async function getEmployeeHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const [rows] = await pool.execute<RowData>(
    `SELECT e.*, u.first_name, u.last_name, u.email, u.phone, d.name AS department_name, p.title AS position_title, r.employee_code AS reports_to_code
     FROM employees e
     JOIN users u ON u.id = e.user_id
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN positions p ON p.id = e.position_id
     LEFT JOIN employees r ON r.id = e.reports_to
     WHERE e.id = ?`,
    [Number(id)]
  );
  if (!rows.length) throw new NotFoundError('Employee', ErrorCodes.EMPLOYEE_NOT_FOUND);
  return reply.send({ data: rows[0] });
}

export async function createEmployeeHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(
    `SELECT id FROM employees WHERE user_id = ? AND organisation_id = ?`,
    [body.userId, body.organisationId]
  );
  if (existing.length) {
    throw new ConflictError('Employee already exists in this organisation', ErrorCodes.USER_ALREADY_EXISTS);
  }

  const [result] = await pool.execute<RowData>(
    `INSERT INTO employees (user_id, organisation_id, department_id, position_id, employee_code, employment_status, hire_date, reports_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [body.userId, body.organisationId, body.departmentId || null, body.positionId || null, body.employeeCode || null, body.employmentStatus || 'draft', body.hireDate || null, body.reportsTo || null]
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'HR.EMPLOYEE.CREATE',
    entityType: 'employees',
    entityId: insertId,
    afterState: { userId: body.userId, organisationId: body.organisationId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { id: insertId } });
}

export async function updateEmployeeHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM employees WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Employee', ErrorCodes.EMPLOYEE_NOT_FOUND);

  await pool.execute<RowData>(
    `UPDATE employees SET department_id = COALESCE(?, department_id), position_id = COALESCE(?, position_id), employee_code = COALESCE(?, employee_code), hire_date = COALESCE(?, hire_date), reports_to = COALESCE(?, reports_to) WHERE id = ?`,
    [body.departmentId ?? null, body.positionId ?? null, body.employeeCode ?? null, body.hireDate ?? null, body.reportsTo ?? null, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'HR.EMPLOYEE.UPDATE',
    entityType: 'employees',
    entityId: Number(id),
    beforeState: { employeeCode: existing[0].employee_code },
    afterState: { employeeCode: body.employeeCode },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id) } });
}

export async function changeEmployeeStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;
  const newStatus: string = body.status;

  if (!newStatus || !VALID_EMPLOYMENT_STATUSES.includes(newStatus as any)) {
    throw new AppError(`Invalid status '${newStatus}'`, 400, 'VALIDATION_ERROR');
  }

  const [existing] = await pool.execute<RowData>(`SELECT * FROM employees WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Employee', ErrorCodes.EMPLOYEE_NOT_FOUND);

  assertValidTransition(existing[0].employment_status, newStatus, EMPLOYEE_TRANSITIONS);

  await pool.execute<RowData>(
    `UPDATE employees SET employment_status = ?, termination_date = ?, termination_reason = ? WHERE id = ?`,
    [newStatus, newStatus === 'terminated' ? (body.terminationDate || new Date().toISOString().slice(0,10)) : null, newStatus === 'terminated' ? (body.terminationReason || null) : null, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'HR.EMPLOYEE.STATUS_CHANGE',
    entityType: 'employees',
    entityId: Number(id),
    beforeState: { status: existing[0].employment_status },
    afterState: { status: newStatus },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), status: newStatus } });
}

// ─── Employment Contracts ────────────────────────────────────────────────────

const CONTRACT_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'terminated'],
  active: ['expired', 'terminated'],
  expired: [],
  terminated: [],
};

export async function listContractsHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];
  const conditions: string[] = [];

  if (query.employeeId) { conditions.push('c.employee_id = ?'); params.push(Number(query.employeeId)); }
  if (query.status) { conditions.push('c.status = ?'); params.push(query.status); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await pool.execute<RowData>(
    `SELECT c.*, e.employee_code, u.first_name, u.last_name
     FROM employment_contracts c
     JOIN employees e ON e.id = c.employee_id
     JOIN users u ON u.id = e.user_id
     ${where}
     ORDER BY c.created_at DESC`,
    params
  );
  return reply.send({ data: rows });
}

export async function getContractHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const [rows] = await pool.execute<RowData>(
    `SELECT c.*, e.employee_code, u.first_name, u.last_name
     FROM employment_contracts c
     JOIN employees e ON e.id = c.employee_id
     JOIN users u ON u.id = e.user_id
     WHERE c.id = ?`,
    [Number(id)]
  );
  if (!rows.length) throw new NotFoundError('Contract', ErrorCodes.CONTRACT_NOT_FOUND);
  return reply.send({ data: rows[0] });
}

export async function createContractHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const [result] = await pool.execute<RowData>(
    `INSERT INTO employment_contracts (employee_id, contract_type, start_date, end_date, salary_amount, currency, payment_frequency, status, document_url, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [body.employeeId, body.contractType || 'permanent', body.startDate, body.endDate || null, body.salaryAmount || 0, body.currency || 'USD', body.paymentFrequency || 'monthly', body.status || 'draft', body.documentUrl || null, body.notes || null]
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'HR.CONTRACT.CREATE',
    entityType: 'employment_contracts',
    entityId: insertId,
    afterState: { employeeId: body.employeeId, contractType: body.contractType },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { id: insertId } });
}

export async function updateContractHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM employment_contracts WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Contract', ErrorCodes.CONTRACT_NOT_FOUND);

  await pool.execute<RowData>(
    `UPDATE employment_contracts SET contract_type = COALESCE(?, contract_type), start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date), salary_amount = COALESCE(?, salary_amount), currency = COALESCE(?, currency), payment_frequency = COALESCE(?, payment_frequency), document_url = COALESCE(?, document_url), notes = COALESCE(?, notes) WHERE id = ?`,
    [body.contractType ?? null, body.startDate ?? null, body.endDate ?? null, body.salaryAmount ?? null, body.currency ?? null, body.paymentFrequency ?? null, body.documentUrl ?? null, body.notes ?? null, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'HR.CONTRACT.UPDATE',
    entityType: 'employment_contracts',
    entityId: Number(id),
    afterState: { salaryAmount: body.salaryAmount },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id) } });
}

export async function changeContractStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;
  const newStatus: string = body.status;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM employment_contracts WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Contract', ErrorCodes.CONTRACT_NOT_FOUND);

  assertValidTransition(existing[0].status, newStatus, CONTRACT_TRANSITIONS);

  await pool.execute<RowData>(
    `UPDATE employment_contracts SET status = ? WHERE id = ?`,
    [newStatus, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'HR.CONTRACT.STATUS_CHANGE',
    entityType: 'employment_contracts',
    entityId: Number(id),
    beforeState: { status: existing[0].status },
    afterState: { status: newStatus },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), status: newStatus } });
}

// ─── Leave Types ─────────────────────────────────────────────────────────────

export async function listLeaveTypesHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];
  const conditions: string[] = [];

  if (query.organisationId) { conditions.push('organisation_id = ?'); params.push(Number(query.organisationId)); }
  if (query.isActive !== undefined) { conditions.push('is_active = ?'); params.push(query.isActive); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await pool.execute<RowData>(`SELECT * FROM leave_types ${where} ORDER BY name`, params);
  return reply.send({ data: rows });
}

export async function getLeaveTypeHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const [rows] = await pool.execute<RowData>(`SELECT * FROM leave_types WHERE id = ?`, [Number(id)]);
  if (!rows.length) throw new NotFoundError('Leave type', ErrorCodes.LEAVE_REQUEST_NOT_FOUND);
  return reply.send({ data: rows[0] });
}

export async function createLeaveTypeHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const [result] = await pool.execute<RowData>(
    `INSERT INTO leave_types (organisation_id, name, default_days, is_paid, requires_approval, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [body.organisationId, body.name, body.defaultDays || 0, body.isPaid ?? 1, body.requiresApproval ?? 1, body.isActive ?? 1]
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'HR.LEAVE_TYPE.CREATE',
    entityType: 'leave_types',
    entityId: insertId,
    afterState: { name: body.name, organisationId: body.organisationId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { id: insertId } });
}

export async function updateLeaveTypeHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM leave_types WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Leave type', ErrorCodes.LEAVE_REQUEST_NOT_FOUND);

  await pool.execute<RowData>(
    `UPDATE leave_types SET name = COALESCE(?, name), default_days = COALESCE(?, default_days), is_paid = COALESCE(?, is_paid), requires_approval = COALESCE(?, requires_approval), is_active = COALESCE(?, is_active) WHERE id = ?`,
    [body.name ?? null, body.defaultDays ?? null, body.isPaid ?? null, body.requiresApproval ?? null, body.isActive ?? null, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'HR.LEAVE_TYPE.UPDATE',
    entityType: 'leave_types',
    entityId: Number(id),
    afterState: { name: body.name },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id) } });
}

export async function deleteLeaveTypeHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM leave_types WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Leave type', ErrorCodes.LEAVE_REQUEST_NOT_FOUND);

  await pool.execute<RowData>(`UPDATE leave_types SET is_active = 0 WHERE id = ?`, [Number(id)]);

  recordAudit({
    actorId: userId,
    action: 'HR.LEAVE_TYPE.DELETE',
    entityType: 'leave_types',
    entityId: Number(id),
    afterState: { isActive: 0 },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), isActive: 0 } });
}

// ─── Leave Requests ──────────────────────────────────────────────────────────

const LEAVE_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['approved', 'rejected', 'cancelled'],
  approved: ['completed', 'cancelled'],
  rejected: ['submitted'],
  cancelled: ['submitted'],
  completed: [],
};

export async function listLeaveRequestsHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];
  const conditions: string[] = [];

  if (query.employeeId) { conditions.push('lr.employee_id = ?'); params.push(Number(query.employeeId)); }
  if (query.status) { conditions.push('lr.status = ?'); params.push(query.status); }
  if (query.organisationId) {
    conditions.push('e.organisation_id = ?');
    params.push(Number(query.organisationId));
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await pool.execute<RowData>(
    `SELECT lr.*, lt.name AS leave_type_name, lt.is_paid,
            u.first_name, u.last_name, e.employee_code,
            au.first_name AS approver_first_name, au.last_name AS approver_last_name
     FROM leave_requests lr
     JOIN leave_types lt ON lt.id = lr.leave_type_id
     JOIN employees e ON e.id = lr.employee_id
     JOIN users u ON u.id = e.user_id
     LEFT JOIN users au ON au.id = lr.approved_by
     ${where}
     ORDER BY lr.created_at DESC`,
    params
  );
  return reply.send({ data: rows });
}

export async function getLeaveRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const [rows] = await pool.execute<RowData>(
    `SELECT lr.*, lt.name AS leave_type_name, lt.is_paid,
            u.first_name, u.last_name, e.employee_code
     FROM leave_requests lr
     JOIN leave_types lt ON lt.id = lr.leave_type_id
     JOIN employees e ON e.id = lr.employee_id
     JOIN users u ON u.id = e.user_id
     WHERE lr.id = ?`,
    [Number(id)]
  );
  if (!rows.length) throw new NotFoundError('Leave request', ErrorCodes.LEAVE_REQUEST_NOT_FOUND);
  return reply.send({ data: rows[0] });
}

export async function createLeaveRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const [result] = await pool.execute<RowData>(
    `INSERT INTO leave_requests (employee_id, leave_type_id, start_date, end_date, duration_days, reason, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [body.employeeId, body.leaveTypeId, body.startDate, body.endDate, body.durationDays, body.reason || null, body.status || 'draft']
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'HR.LEAVE_REQUEST.CREATE',
    entityType: 'leave_requests',
    entityId: insertId,
    afterState: { employeeId: body.employeeId, leaveTypeId: body.leaveTypeId, durationDays: body.durationDays },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { id: insertId } });
}

export async function updateLeaveRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM leave_requests WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Leave request', ErrorCodes.LEAVE_REQUEST_NOT_FOUND);
  if (existing[0].status !== 'draft') {
    throw new AppError('Only draft leave requests can be edited', 400, 'VALIDATION_ERROR');
  }

  await pool.execute<RowData>(
    `UPDATE leave_requests SET start_date = COALESCE(?, start_date), end_date = COALESCE(?, end_date), duration_days = COALESCE(?, duration_days), reason = COALESCE(?, reason) WHERE id = ?`,
    [body.startDate ?? null, body.endDate ?? null, body.durationDays ?? null, body.reason ?? null, Number(id)]
  );

  return reply.send({ data: { id: Number(id) } });
}

export async function submitLeaveRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM leave_requests WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Leave request', ErrorCodes.LEAVE_REQUEST_NOT_FOUND);
  assertValidTransition(existing[0].status, 'submitted', LEAVE_TRANSITIONS);

  await pool.execute<RowData>(`UPDATE leave_requests SET status = 'submitted' WHERE id = ?`, [Number(id)]);

  recordAudit({
    actorId: userId,
    action: 'HR.LEAVE_REQUEST.SUBMIT',
    entityType: 'leave_requests',
    entityId: Number(id),
    beforeState: { status: existing[0].status },
    afterState: { status: 'submitted' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), status: 'submitted' } });
}

export async function approveLeaveRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.execute<RowData>(`SELECT * FROM leave_requests WHERE id = ? FOR UPDATE`, [Number(id)]);
    if (!existing.length) throw new NotFoundError('Leave request', ErrorCodes.LEAVE_REQUEST_NOT_FOUND);
    assertValidTransition(existing[0].status, 'approved', LEAVE_TRANSITIONS);

    const [balance] = await conn.execute<RowData>(
      `SELECT total_days, used_days, pending_days FROM leave_balances
       WHERE employee_id = ? AND leave_type_id = ? AND year = YEAR(?)
       FOR UPDATE`,
      [existing[0].employee_id, existing[0].leave_type_id, existing[0].start_date]
    );

    if (balance.length) {
      const newPending = Number(balance[0].pending_days) - Number(existing[0].duration_days);
      const newUsed = Number(balance[0].used_days) + Number(existing[0].duration_days);
      if (newUsed > Number(balance[0].total_days)) {
        throw new AppError('Leave balance exceeded', 400, 'VALIDATION_ERROR', { code: ErrorCodes.LEAVE_BALANCE_EXCEEDED });
      }
      await conn.execute(
        `UPDATE leave_balances SET used_days = ?, pending_days = ? WHERE employee_id = ? AND leave_type_id = ? AND year = YEAR(?)`,
        [newUsed, Math.max(0, newPending), existing[0].employee_id, existing[0].leave_type_id, existing[0].start_date]
      );
    }

    await conn.execute(
      `UPDATE leave_requests SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE id = ?`,
      [userId, Number(id)]
    );

    await conn.commit();

    recordAudit({
      actorId: userId,
      action: 'HR.LEAVE_REQUEST.APPROVE',
      entityType: 'leave_requests',
      entityId: Number(id),
      afterState: { status: 'approved' },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({ data: { id: Number(id), status: 'approved' } });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function rejectLeaveRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM leave_requests WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Leave request', ErrorCodes.LEAVE_REQUEST_NOT_FOUND);
  assertValidTransition(existing[0].status, 'rejected', LEAVE_TRANSITIONS);

  await pool.execute<RowData>(
    `UPDATE leave_requests SET status = 'rejected', approved_by = ?, approved_at = NOW() WHERE id = ?`,
    [userId, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'HR.LEAVE_REQUEST.REJECT',
    entityType: 'leave_requests',
    entityId: Number(id),
    afterState: { status: 'rejected', reason: body.reason },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), status: 'rejected' } });
}

export async function cancelLeaveRequestHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM leave_requests WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Leave request', ErrorCodes.LEAVE_REQUEST_NOT_FOUND);
  assertValidTransition(existing[0].status, 'cancelled', LEAVE_TRANSITIONS);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (existing[0].status === 'approved') {
      const [balance] = await conn.execute<RowData>(
        `SELECT used_days, pending_days FROM leave_balances
         WHERE employee_id = ? AND leave_type_id = ? AND year = YEAR(?)
         FOR UPDATE`,
        [existing[0].employee_id, existing[0].leave_type_id, existing[0].start_date]
      );
      if (balance.length) {
        const newUsed = Math.max(0, Number(balance[0].used_days) - Number(existing[0].duration_days));
        await conn.execute(
          `UPDATE leave_balances SET used_days = ? WHERE employee_id = ? AND leave_type_id = ? AND year = YEAR(?)`,
          [newUsed, existing[0].employee_id, existing[0].leave_type_id, existing[0].start_date]
        );
      }
    }

    await conn.execute(`UPDATE leave_requests SET status = 'cancelled' WHERE id = ?`, [Number(id)]);
    await conn.commit();

    recordAudit({
      actorId: userId,
      action: 'HR.LEAVE_REQUEST.CANCEL',
      entityType: 'leave_requests',
      entityId: Number(id),
      beforeState: { status: existing[0].status },
      afterState: { status: 'cancelled' },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({ data: { id: Number(id), status: 'cancelled' } });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ─── Leave Balances ──────────────────────────────────────────────────────────

export async function getLeaveBalanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];
  const conditions: string[] = [];

  if (query.employeeId) { conditions.push('lb.employee_id = ?'); params.push(Number(query.employeeId)); }
  if (query.year) { conditions.push('lb.year = ?'); params.push(Number(query.year)); }
  if (query.leaveTypeId) { conditions.push('lb.leave_type_id = ?'); params.push(Number(query.leaveTypeId)); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await pool.execute<RowData>(
    `SELECT lb.*, lt.name AS leave_type_name, lt.default_days, lt.is_paid
     FROM leave_balances lb
     JOIN leave_types lt ON lt.id = lb.leave_type_id
     ${where}
     ORDER BY lt.name`,
    params
  );
  return reply.send({ data: rows });
}

export async function adjustLeaveBalanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const year = body.year || new Date().getFullYear();

  const [existing] = await pool.execute<RowData>(
    `SELECT id FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?`,
    [body.employeeId, body.leaveTypeId, year]
  );

  if (existing.length) {
    await pool.execute<RowData>(
      `UPDATE leave_balances SET total_days = COALESCE(?, total_days), used_days = COALESCE(?, used_days), pending_days = COALESCE(?, pending_days) WHERE id = ?`,
      [body.totalDays ?? null, body.usedDays ?? null, body.pendingDays ?? null, existing[0].id]
    );
  } else {
    await pool.execute<RowData>(
      `INSERT INTO leave_balances (employee_id, leave_type_id, total_days, used_days, pending_days, year)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [body.employeeId, body.leaveTypeId, body.totalDays || 0, body.usedDays || 0, body.pendingDays || 0, year]
    );
  }

  recordAudit({
    actorId: userId,
    action: 'HR.LEAVE_BALANCE.ADJUST',
    entityType: 'leave_balances',
    entityId: 0,
    afterState: { employeeId: body.employeeId, leaveTypeId: body.leaveTypeId, year },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { adjusted: true } });
}

// ─── Staff Attendance ────────────────────────────────────────────────────────

export async function clockInHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toTimeString().slice(0, 8);

  const [existing] = await pool.execute<RowData>(
    `SELECT id FROM staff_attendance WHERE employee_id = ? AND attendance_date = ?`,
    [body.employeeId, today]
  );
  if (existing.length) {
    throw new ConflictError('Attendance already recorded for today', ErrorCodes.ATTENDANCE_ALREADY_RECORDED);
  }

  await pool.execute<RowData>(
    `INSERT INTO staff_attendance (employee_id, attendance_date, clock_in, status, notes)
     VALUES (?, ?, ?, 'present', ?)`,
    [body.employeeId, today, now, body.notes || null]
  );

  recordAudit({
    actorId: userId,
    action: 'HR.ATTENDANCE.CLOCK_IN',
    entityType: 'staff_attendance',
    entityId: 0,
    afterState: { employeeId: body.employeeId, date: today, clockIn: now },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { date: today, clockIn: now } });
}

export async function clockOutHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toTimeString().slice(0, 8);

  const [existing] = await pool.execute<RowData>(
    `SELECT id, clock_in FROM staff_attendance WHERE employee_id = ? AND attendance_date = ?`,
    [body.employeeId, today]
  );
  if (!existing.length) {
    throw new NotFoundError('Attendance record', ErrorCodes.ATTENDANCE_ALREADY_RECORDED);
  }
  if (existing[0].clock_out) {
    throw new AppError('Already clocked out today', 400, 'VALIDATION_ERROR');
  }

  await pool.execute<RowData>(
    `UPDATE staff_attendance SET clock_out = ? WHERE id = ?`,
    [now, existing[0].id]
  );

  recordAudit({
    actorId: userId,
    action: 'HR.ATTENDANCE.CLOCK_OUT',
    entityType: 'staff_attendance',
    entityId: existing[0].id,
    afterState: { employeeId: body.employeeId, date: today, clockOut: now },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { date: today, clockIn: existing[0].clock_in, clockOut: now } });
}

export async function logAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(
    `SELECT id FROM staff_attendance WHERE employee_id = ? AND attendance_date = ?`,
    [body.employeeId, body.attendanceDate]
  );
  if (existing.length) {
    throw new ConflictError('Attendance already recorded for this date', ErrorCodes.ATTENDANCE_ALREADY_RECORDED);
  }

  await pool.execute<RowData>(
    `INSERT INTO staff_attendance (employee_id, attendance_date, clock_in, clock_out, status, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [body.employeeId, body.attendanceDate, body.clockIn || null, body.clockOut || null, body.status || 'present', body.notes || null]
  );

  recordAudit({
    actorId: userId,
    action: 'HR.ATTENDANCE.LOG',
    entityType: 'staff_attendance',
    entityId: 0,
    afterState: { employeeId: body.employeeId, date: body.attendanceDate, status: body.status },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { date: body.attendanceDate, status: body.status } });
}

export async function listAttendanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];
  const conditions: string[] = [];

  if (query.employeeId) { conditions.push('sa.employee_id = ?'); params.push(Number(query.employeeId)); }
  if (query.from) { conditions.push('sa.attendance_date >= ?'); params.push(query.from); }
  if (query.to) { conditions.push('sa.attendance_date <= ?'); params.push(query.to); }
  if (query.status) { conditions.push('sa.status = ?'); params.push(query.status); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await pool.execute<RowData>(
    `SELECT sa.*, e.employee_code, u.first_name, u.last_name
     FROM staff_attendance sa
     JOIN employees e ON e.id = sa.employee_id
     JOIN users u ON u.id = e.user_id
     ${where}
     ORDER BY sa.attendance_date DESC, sa.clock_in`,
    params
  );
  return reply.send({ data: rows });
}

// ─── Payroll Components ──────────────────────────────────────────────────────

export async function listPayrollComponentsHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];
  const conditions: string[] = [];

  if (query.organisationId) { conditions.push('organisation_id = ?'); params.push(Number(query.organisationId)); }
  if (query.isActive !== undefined) { conditions.push('is_active = ?'); params.push(query.isActive); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await pool.execute<RowData>(`SELECT * FROM payroll_components ${where} ORDER BY type, name`, params);
  return reply.send({ data: rows });
}

export async function createPayrollComponentHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const [result] = await pool.execute<RowData>(
    `INSERT INTO payroll_components (organisation_id, name, type, calculation_type, default_amount, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [body.organisationId, body.name, body.type, body.calculationType || 'fixed', body.defaultAmount || 0, body.isActive ?? 1]
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'HR.PAYROLL_COMPONENT.CREATE',
    entityType: 'payroll_components',
    entityId: insertId,
    afterState: { name: body.name, type: body.type },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { id: insertId } });
}

export async function updatePayrollComponentHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM payroll_components WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Payroll component', ErrorCodes.PAYROLL_RUN_NOT_FOUND);

  await pool.execute<RowData>(
    `UPDATE payroll_components SET name = COALESCE(?, name), type = COALESCE(?, type), calculation_type = COALESCE(?, calculation_type), default_amount = COALESCE(?, default_amount), is_active = COALESCE(?, is_active) WHERE id = ?`,
    [body.name ?? null, body.type ?? null, body.calculationType ?? null, body.defaultAmount ?? null, body.isActive ?? null, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'HR.PAYROLL_COMPONENT.UPDATE',
    entityType: 'payroll_components',
    entityId: Number(id),
    afterState: { name: body.name },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id) } });
}

export async function deletePayrollComponentHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM payroll_components WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Payroll component', ErrorCodes.PAYROLL_RUN_NOT_FOUND);

  await pool.execute<RowData>(`UPDATE payroll_components SET is_active = 0 WHERE id = ?`, [Number(id)]);

  recordAudit({
    actorId: userId,
    action: 'HR.PAYROLL_COMPONENT.DELETE',
    entityType: 'payroll_components',
    entityId: Number(id),
    afterState: { isActive: 0 },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), isActive: 0 } });
}

// ─── Payroll Runs ────────────────────────────────────────────────────────────

const PAYROLL_TRANSITIONS: Record<string, string[]> = {
  draft: ['calculated'],
  calculated: ['approved', 'draft'],
  approved: ['posted'],
  posted: ['paid'],
  paid: ['closed'],
  closed: [],
};

export async function listPayrollRunsHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];
  const conditions: string[] = [];

  if (query.organisationId) { conditions.push('pr.organisation_id = ?'); params.push(Number(query.organisationId)); }
  if (query.status) { conditions.push('pr.status = ?'); params.push(query.status); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await pool.execute<RowData>(
    `SELECT pr.*, u.first_name, u.last_name AS created_by_name
     FROM payroll_runs pr
     JOIN users u ON u.id = pr.created_by
     ${where}
     ORDER BY pr.created_at DESC`,
    params
  );
  return reply.send({ data: rows });
}

export async function getPayrollRunHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;

  const [runs] = await pool.execute<RowData>(
    `SELECT pr.*, u.first_name, u.last_name AS created_by_name
     FROM payroll_runs pr
     JOIN users u ON u.id = pr.created_by
     WHERE pr.id = ?`,
    [Number(id)]
  );
  if (!runs.length) throw new NotFoundError('Payroll run', ErrorCodes.PAYROLL_RUN_NOT_FOUND);

  const [entries] = await pool.execute<RowData>(
    `SELECT pe.*, e.employee_code, u.first_name, u.last_name
     FROM payroll_entries pe
     JOIN employees e ON e.id = pe.employee_id
     JOIN users u ON u.id = e.user_id
     WHERE pe.payroll_run_id = ?`,
    [Number(id)]
  );

  return reply.send({ data: { ...runs[0], entries } });
}

export async function createPayrollRunHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const [result] = await pool.execute<RowData>(
    `INSERT INTO payroll_runs (organisation_id, period_start, period_end, status, created_by)
     VALUES (?, ?, ?, 'draft', ?)`,
    [body.organisationId, body.periodStart, body.periodEnd, userId]
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'HR.PAYROLL_RUN.CREATE',
    entityType: 'payroll_runs',
    entityId: insertId,
    afterState: { organisationId: body.organisationId, periodStart: body.periodStart, periodEnd: body.periodEnd },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { id: insertId } });
}

export async function calculatePayrollRunHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM payroll_runs WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Payroll run', ErrorCodes.PAYROLL_RUN_NOT_FOUND);
  assertValidTransition(existing[0].status, 'calculated', PAYROLL_TRANSITIONS);

  const run = existing[0];
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [employees] = await conn.execute<RowData>(
      `SELECT e.id, e.employee_code, ec.salary_amount
       FROM employees e
       LEFT JOIN employment_contracts ec ON ec.employee_id = e.id AND ec.status = 'active'
       WHERE e.organisation_id = ? AND e.employment_status IN ('active', 'on_leave')`,
      [run.organisation_id]
    );

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    await conn.execute(`DELETE FROM payroll_entries WHERE payroll_run_id = ?`, [Number(id)]);

    for (const emp of employees) {
      const baseSalary = Number(emp.salary_amount || 0);
      const [components] = await conn.execute<RowData>(
        `SELECT * FROM payroll_components WHERE organisation_id = ? AND is_active = 1`,
        [run.organisation_id]
      );

      const breakdown: any[] = [];
      let earnings = 0;
      let deductions = 0;

      for (const comp of components) {
        let amount = 0;
        if (comp.calculation_type === 'fixed') {
          amount = Number(comp.default_amount);
        } else if (comp.calculation_type === 'percentage') {
          amount = baseSalary * (Number(comp.default_amount) / 100);
        } else {
          amount = Number(comp.default_amount);
        }
        breakdown.push({ componentId: comp.id, name: comp.name, type: comp.type, amount });
        if (comp.type === 'earning') earnings += amount;
        else deductions += amount;
      }

      const netPay = baseSalary + earnings - deductions;
      totalGross += baseSalary + earnings;
      totalDeductions += deductions;
      totalNet += netPay;

      await conn.execute(
        `INSERT INTO payroll_entries (payroll_run_id, employee_id, base_salary, total_earnings, total_deductions, net_pay, component_breakdown)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [Number(id), emp.id, baseSalary, earnings, deductions, netPay, JSON.stringify(breakdown)]
      );
    }

    await conn.execute(
      `UPDATE payroll_runs SET status = 'calculated', total_gross = ?, total_deductions = ?, total_net = ? WHERE id = ?`,
      [totalGross, totalDeductions, totalNet, Number(id)]
    );

    await conn.commit();

    recordAudit({
      actorId: userId,
      action: 'HR.PAYROLL_RUN.CALCULATE',
      entityType: 'payroll_runs',
      entityId: Number(id),
      afterState: { status: 'calculated', employeeCount: employees.length },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({ data: { id: Number(id), status: 'calculated', totalGross, totalDeductions, totalNet, employeeCount: employees.length } });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function approvePayrollRunHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM payroll_runs WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Payroll run', ErrorCodes.PAYROLL_RUN_NOT_FOUND);
  assertValidTransition(existing[0].status, 'approved', PAYROLL_TRANSITIONS);

  await pool.execute<RowData>(`UPDATE payroll_runs SET status = 'approved' WHERE id = ?`, [Number(id)]);

  recordAudit({
    actorId: userId,
    action: 'HR.PAYROLL_RUN.APPROVE',
    entityType: 'payroll_runs',
    entityId: Number(id),
    beforeState: { status: existing[0].status },
    afterState: { status: 'approved' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), status: 'approved' } });
}

export async function postPayrollRunHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM payroll_runs WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Payroll run', ErrorCodes.PAYROLL_RUN_NOT_FOUND);
  assertValidTransition(existing[0].status, 'posted', PAYROLL_TRANSITIONS);
  if (existing[0].status === 'posted') {
    throw new AppError('Payroll is already posted', 400, 'VALIDATION_ERROR', { code: ErrorCodes.PAYROLL_ALREADY_POSTED });
  }

  const run = existing[0];
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE payroll_runs SET status = 'posted', posted_at = NOW(), posted_by = ? WHERE id = ?`,
      [userId, Number(id)]
    );

    const [entries] = await conn.execute<RowData>(
      `SELECT pe.*, e.user_id FROM payroll_entries pe JOIN employees e ON e.id = pe.employee_id WHERE pe.payroll_run_id = ?`,
      [Number(id)]
    );

    const [periods] = await conn.execute<RowData>(
      `SELECT id FROM accounting_periods WHERE ? BETWEEN start_date AND end_date AND status = 'open' LIMIT 1`,
      [run.period_end]
    );

    if (periods.length) {
      for (const entry of entries) {
        const description = `Payroll ${run.period_start} to ${run.period_end} - Employee #${entry.employee_id}`;
        await conn.execute(
          `INSERT INTO general_ledger (period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
           VALUES (?, ?, ?, ?, ?, 0, 'payroll', ?, ?, ?)`,
          [periods[0].id, 1, run.period_end, Number(entry.net_pay), 0, Number(id), description, userId]
        );
        await conn.execute(
          `INSERT INTO general_ledger (period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
           VALUES (?, ?, ?, ?, ?, 0, 'payroll', ?, ?, ?)`,
          [periods[0].id, 5, run.period_end, 0, Number(entry.net_pay), Number(id), description, userId]
        );
      }
    }

    await conn.commit();

    recordAudit({
      actorId: userId,
      action: 'HR.PAYROLL_RUN.POST',
      entityType: 'payroll_runs',
      entityId: Number(id),
      beforeState: { status: existing[0].status },
      afterState: { status: 'posted' },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({ data: { id: Number(id), status: 'posted' } });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function markPayrollPaidHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM payroll_runs WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Payroll run', ErrorCodes.PAYROLL_RUN_NOT_FOUND);
  assertValidTransition(existing[0].status, 'paid', PAYROLL_TRANSITIONS);

  await pool.execute<RowData>(
    `UPDATE payroll_runs SET status = 'paid', paid_at = NOW() WHERE id = ?`,
    [Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'HR.PAYROLL_RUN.MARK_PAID',
    entityType: 'payroll_runs',
    entityId: Number(id),
    beforeState: { status: existing[0].status },
    afterState: { status: 'paid' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), status: 'paid' } });
}

export async function closePayrollRunHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(`SELECT * FROM payroll_runs WHERE id = ?`, [Number(id)]);
  if (!existing.length) throw new NotFoundError('Payroll run', ErrorCodes.PAYROLL_RUN_NOT_FOUND);
  assertValidTransition(existing[0].status, 'closed', PAYROLL_TRANSITIONS);

  await pool.execute<RowData>(`UPDATE payroll_runs SET status = 'closed' WHERE id = ?`, [Number(id)]);

  recordAudit({
    actorId: userId,
    action: 'HR.PAYROLL_RUN.CLOSE',
    entityType: 'payroll_runs',
    entityId: Number(id),
    beforeState: { status: existing[0].status },
    afterState: { status: 'closed' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), status: 'closed' } });
}

// ─── HR Dashboard ────────────────────────────────────────────────────────────

export async function hrDashboardHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const orgId = query.organisationId ? Number(query.organisationId) : null;

  const orgClause = orgId ? 'WHERE organisation_id = ?' : '';
  const params = orgId ? [orgId] : [];

  const [employeeCount] = await pool.execute<RowData>(
    `SELECT employment_status, COUNT(*) AS count FROM employees ${orgClause} GROUP BY employment_status`,
    params
  );
  const [departmentCount] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS count FROM departments ${orgClause} AND is_active = 1`,
    orgId ? [orgId] : []
  );
  const [pendingLeaves] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS count FROM leave_requests lr
     JOIN employees e ON e.id = lr.employee_id
     WHERE lr.status = 'submitted'${orgId ? ' AND e.organisation_id = ?' : ''}`,
    orgId ? [orgId] : []
  );
  const [activePayroll] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS count FROM payroll_runs ${orgClause} AND status IN ('draft','calculated','approved')`,
    params
  );
  const [attendanceToday] = await pool.execute<RowData>(
    `SELECT COUNT(*) AS count FROM staff_attendance sa
     JOIN employees e ON e.id = sa.employee_id
     WHERE sa.attendance_date = CURDATE() AND sa.clock_in IS NOT NULL${orgId ? ' AND e.organisation_id = ?' : ''}`,
    orgId ? [orgId] : []
  );

  return reply.send({
    data: {
      employeesByStatus: employeeCount,
      totalDepartments: departmentCount[0]?.count || 0,
      pendingLeaveRequests: pendingLeaves[0]?.count || 0,
      activePayrollRuns: activePayroll[0]?.count || 0,
      attendanceToday: attendanceToday[0]?.count || 0,
    },
  });
}
