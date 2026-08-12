import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';
import { AppError, NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { getEventConcepts, validateCompleteMapping } from '../../financial/application/accounting-concepts.js';
import { coaValidator } from '../../financial/application/coa-validator.service.js';
import { yearClosingService } from '../application/year-closing.service.js';
import { calculateFiscalYearNetIncome } from '../application/year-close.netincome.js';
import mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

interface CoaNode {
  id: number;
  code: string;
  name: string;
  type: string;
  normal_side: string | null;
  parent_id: number | null;
  organisation_id: number | null;
  is_system: number;
  children: CoaNode[];
}

interface ReportLine {
  account_id: number;
  code: string;
  name: string;
  type: string;
  normal_side: string | null;
  total_debits: number;
  total_credits: number;
  balance: number;
  level: number;
  parent_id: number | null;
  has_children: boolean;
}

async function buildHierarchicalReport(
  pool: mysql.Pool,
  dateFilter: string,
  params: any[],
  typeFilter: string[] | null,
  organisationId: number | null = null,
): Promise<ReportLine[]> {
  // 1. Fetch COA tree (global + org-owned if scoped)
  const coaAllParams: any[] = [];
  let coaWhere = 'organisation_id IS NULL';
  if (organisationId != null) {
    coaWhere = '(organisation_id IS NULL OR organisation_id = ?)';
    coaAllParams.push(organisationId);
  }
  const [coaRows] = await pool.execute<RowData>(
    `SELECT id, code, name, type, normal_side, parent_id, organisation_id, is_system
     FROM chart_of_accounts
     WHERE ${coaWhere} AND is_active = 1
     ORDER BY code`,
    coaAllParams
  );

  const coaMap = new Map<number, CoaNode>();
  const roots: CoaNode[] = [];
  for (const r of coaRows as any[]) {
    const node: CoaNode = { ...r, children: [] };
    coaMap.set(r.id, node);
  }
  for (const node of coaMap.values()) {
    if (node.parent_id != null && coaMap.has(node.parent_id)) {
      coaMap.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // 2. Fetch GL balances grouped by account
  let typeClause = '';
  if (typeFilter) {
    const placeholders = typeFilter.map(() => '?').join(',');
    typeClause = ` AND a.type IN (${placeholders})`;
    params.push(...typeFilter);
  }

  let orgClause = '';
  if (organisationId != null) {
    orgClause = ' AND gl.organisation_id = ?';
    params.push(organisationId);
  }

  const [glRows] = await pool.execute<RowData>(
    `SELECT gl.account_id, COALESCE(SUM(gl.debit), 0) AS total_debits,
            COALESCE(SUM(gl.credit), 0) AS total_credits
     FROM general_ledger gl
     JOIN chart_of_accounts a ON a.id = gl.account_id
     WHERE 1=1${dateFilter}${typeClause}${orgClause}
     GROUP BY gl.account_id`,
    params
  );

  const leafBalances = new Map<number, { debits: number; credits: number }>();
  for (const r of glRows as any[]) {
    leafBalances.set(r.account_id, { debits: Number(r.total_debits), credits: Number(r.total_credits) });
  }

  // 3. Compute balance with normal_side
  function computeBalance(node: CoaNode, debits: number, credits: number): number {
    if (node.normal_side === 'credit') return credits - debits;
    return debits - credits;
  }

  // 4. Recursive aggregation
  function aggregate(node: CoaNode): { debits: number; credits: number } {
    let totalDebits = leafBalances.get(node.id)?.debits ?? 0;
    let totalCredits = leafBalances.get(node.id)?.credits ?? 0;

    for (const child of node.children) {
      const childBal = aggregate(child);
      totalDebits += childBal.debits;
      totalCredits += childBal.credits;
    }

    leafBalances.set(node.id, { debits: totalDebits, credits: totalCredits });
    return { debits: totalDebits, credits: totalCredits };
  }

  for (const root of roots) aggregate(root);

  // 5. Collect all nodes in hierarchy order with level info
  const result: ReportLine[] = [];
  const typeSet = new Set(typeFilter);

  function collect(node: CoaNode, level: number) {
    const bal = leafBalances.get(node.id) ?? { debits: 0, credits: 0 };
    const balance = computeBalance(node, bal.debits, bal.credits);

    // Only include accounts in the type filter (if specified), or all accounts for trial balance
    if (!typeSet.size || typeSet.has(node.type)) {
      result.push({
        account_id: node.id,
        code: node.code,
        name: node.name,
        type: node.type,
        normal_side: node.normal_side,
        total_debits: bal.debits,
        total_credits: bal.credits,
        balance,
        level,
        parent_id: node.parent_id,
        has_children: node.children.length > 0,
      });
    }

    for (const child of node.children) collect(child, level + 1);
  }

  if (typeSet.size) {
    // Filtered report: only collect nodes matching type filter
    for (const root of roots) {
      if (typeSet.has(root.type)) {
        collect(root, 0);
      } else {
        for (const child of root.children) collect(child, 1);
      }
    }
  } else {
    // Trial balance: all nodes
    for (const root of roots) collect(root, 0);
  }

  return result;
}

export async function getDashboardHandler(_request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();

  const [[coaCount]] = await pool.execute<RowData>('SELECT COUNT(*) AS cnt FROM chart_of_accounts WHERE is_active = 1');
  const [[openPeriods]] = await pool.execute<RowData>("SELECT COUNT(*) AS cnt FROM accounting_periods WHERE status = 'open'");
  const [[draftInvoices]] = await pool.execute<RowData>("SELECT COUNT(*) AS cnt FROM invoices WHERE status = 'draft'");
  const [[issuedInvoices]] = await pool.execute<RowData>("SELECT COUNT(*) AS cnt FROM invoices WHERE status = 'issued'");
  const [[paidInvoices]] = await pool.execute<RowData>("SELECT COUNT(*) AS cnt FROM invoices WHERE status = 'paid'");
  const [[cancelledInvoices]] = await pool.execute<RowData>("SELECT COUNT(*) AS cnt FROM invoices WHERE status = 'cancelled'");
  const [[taxCount]] = await pool.execute<RowData>('SELECT COUNT(*) AS cnt FROM tax_rates WHERE is_active = 1');

  return reply.send({
    data: {
      total_accounts: Number((coaCount as any).cnt),
      open_periods: Number((openPeriods as any).cnt),
      draft_invoices: Number((draftInvoices as any).cnt),
      issued_invoices: Number((issuedInvoices as any).cnt),
      paid_invoices: Number((paidInvoices as any).cnt),
      cancelled_invoices: Number((cancelledInvoices as any).cnt),
      tax_rates: Number((taxCount as any).cnt),
    },
  });
}

export async function listAccountsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT a.*, p.name AS parent_name, p.code AS parent_code,
            (SELECT COUNT(*) FROM chart_of_accounts WHERE parent_id = a.id AND is_active = 1) AS child_count
     FROM chart_of_accounts a
     LEFT JOIN chart_of_accounts p ON p.id = a.parent_id
     WHERE a.is_active = 1
     ORDER BY a.code`
  );
  // Compute approximate level from hierarchy
  const levelMap = new Map<number | null, number>();
  for (const r of rows as any[]) {
    r.child_count = Number(r.child_count);
    // Compute level: iterate to root counting levels
    let level = 1;
    let pid = r.parent_id;
    const visited = new Set<number>([r.id]);
    while (pid != null && level < 10) {
      if (visited.has(pid)) break;
      visited.add(pid);
      const parent = (rows as any[]).find((a: any) => a.id === pid);
      if (!parent) break;
      pid = parent.parent_id;
      level++;
    }
    r.level = level;
    r.is_structural = r.child_count > 0;
    r.is_postable = level === 4 && r.child_count === 0 && r.is_active;
  }
  return reply.send({ data: rows });
}

export async function createAccountHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const parentId = body.parent_id ?? body.parentId ?? null;
  const orgId = body.organisation_id ?? body.organisationId ?? null;

  const [existing] = await pool.execute<RowData>(
    `SELECT id FROM chart_of_accounts WHERE code = ? AND (organisation_id = ? OR (? IS NULL AND organisation_id IS NULL))`,
    [body.code, orgId, orgId]
  );
  if (existing.length) {
    throw new ConflictError('Account code already exists', ErrorCodes.ACCOUNT_CODE_EXISTS);
  }

  if (parentId != null) {
    const [parent] = await pool.execute<RowData>(
      'SELECT id, is_system, is_active FROM chart_of_accounts WHERE id = ?', [parentId]
    );
    if (!(parent as any[]).length) {
      throw new AppError('Parent account does not exist', 400, 'VALIDATION_ERROR');
    }
    if (!(parent as any[])[0].is_active) {
      throw new AppError('Parent account is inactive', 400, 'VALIDATION_ERROR');
    }

    // Enforce maximum depth: org accounts must be L4 under L3
    if (orgId != null) {
      await coaValidator.validateAccountCreation(parentId, orgId, 'Account Creation');
    }
  }

  const normalSide = body.normal_side ?? body.normalSide ?? null;
  const isSystem = body.is_system ?? body.isSystem ?? 0;

  const [result] = await pool.execute<RowData>(
    `INSERT INTO chart_of_accounts (code, name, type, normal_side, parent_id, is_system, is_active, organisation_id, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [body.code, body.name, body.type, normalSide, parentId, isSystem, body.isActive ?? 1, orgId, body.description || null]
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'ACCOUNTING.COA.CREATE',
    entityType: 'chart_of_accounts',
    entityId: insertId,
    afterState: { code: body.code, name: body.name, type: body.type, organisationId: orgId },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { id: insertId } });
}

export async function updateAccountHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(
    `SELECT * FROM chart_of_accounts WHERE id = ?`, [Number(id)]
  );
  if (!existing.length) {
    throw new NotFoundError('Account', ErrorCodes.ACCOUNT_NOT_FOUND);
  }

  await pool.execute<RowData>(
    `UPDATE chart_of_accounts SET name = COALESCE(?, name), description = COALESCE(?, description), is_active = COALESCE(?, is_active) WHERE id = ?`,
    [body.name ?? null, body.description ?? null, body.isActive ?? null, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'ACCOUNTING.COA.UPDATE',
    entityType: 'chart_of_accounts',
    entityId: Number(id),
    beforeState: { name: existing[0].name, isActive: existing[0].is_active },
    afterState: { name: body.name, isActive: body.isActive },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id) } });
}

export async function listPeriodsHandler(_request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM accounting_periods ORDER BY fiscal_year DESC, period_number DESC`
  );
  return reply.send({ data: rows });
}

export async function generatePeriodsHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;
  const fiscalYear = body.fiscalYear || new Date().getFullYear();

  const [existing] = await pool.execute<RowData>(
    `SELECT id FROM accounting_periods WHERE fiscal_year = ?`, [fiscalYear]
  );
  if (existing.length) {
    return reply.status(409).send({ error: 'CONFLICT', message: `Periods already exist for fiscal year ${fiscalYear}` });
  }

  const periods: any[] = [];
  for (let p = 1; p <= 12; p++) {
    const startDate = new Date(fiscalYear, p - 1, 1);
    const endDate = new Date(fiscalYear, p, 0);
    periods.push([
      fiscalYear, p,
      startDate.toISOString().slice(0, 10),
      endDate.toISOString().slice(0, 10),
    ]);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const p of periods) {
      await conn.execute(
        `INSERT INTO accounting_periods (fiscal_year, period_number, start_date, end_date) VALUES (?, ?, ?, ?)`,
        p
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  recordAudit({
    actorId: userId,
    action: 'ACCOUNTING.PERIODS.GENERATE',
    entityType: 'accounting_periods',
    entityId: fiscalYear,
    afterState: { fiscalYear, periodsGenerated: 12 },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { fiscalYear, periodsGenerated: 12 } });
}

export async function closePeriodHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(
    `SELECT * FROM accounting_periods WHERE id = ?`, [Number(id)]
  );
  if (!existing.length) {
    throw new NotFoundError('Period', ErrorCodes.PERIOD_NOT_FOUND);
  }
  if (existing[0].status === 'closed' || existing[0].status === 'locked') {
    throw new AppError('Period is already closed', 409, 'CONFLICT', { code: ErrorCodes.PERIOD_ALREADY_CLOSED });
  }

  await pool.execute<RowData>(
    `UPDATE accounting_periods SET status = 'closed', closed_at = NOW(), closed_by = ? WHERE id = ?`,
    [userId, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'ACCOUNTING.PERIODS.CLOSE',
    entityType: 'accounting_periods',
    entityId: Number(id),
    beforeState: { status: existing[0].status },
    afterState: { status: 'closed' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), status: 'closed' } });
}

export async function openPeriodHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(
    `SELECT * FROM accounting_periods WHERE id = ?`, [Number(id)]
  );
  if (!existing.length) {
    throw new NotFoundError('Period', ErrorCodes.PERIOD_NOT_FOUND);
  }
  if (existing[0].status === 'locked') {
    throw new AppError('Locked periods require year-close reopen authorization. Use POST /admin/accounting/year-close/reopen', 403, 'FORBIDDEN');
  }

  await pool.execute<RowData>(
    `UPDATE accounting_periods SET status = 'open', closed_at = NULL, closed_by = NULL WHERE id = ?`,
    [Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'ACCOUNTING.PERIODS.OPEN',
    entityType: 'accounting_periods',
    entityId: Number(id),
    beforeState: { status: existing[0].status },
    afterState: { status: 'open' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id), status: 'open' } });
}

async function validateOrgAccess(userId: number, orgId: number | null): Promise<void> {
  if (orgId == null) return;
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT 1 FROM user_organisations WHERE user_id = ? AND organisation_id = ? LIMIT 1`,
    [userId, orgId],
  );
  if (!rows.length) {
    const [ownerRows] = await pool.execute<RowData>(
      `SELECT 1 FROM organisations WHERE id = ? AND owner_id = ? AND deleted_at IS NULL LIMIT 1`,
      [orgId, userId],
    );
    if (!ownerRows.length) {
      throw new AppError('You do not have access to this organisation', 403, 'FORBIDDEN');
    }
  }
}

async function createDualEntry(
  conn: mysql.PoolConnection,
  p: {
    sourceType: string; sourceId: number; eventType: string;
    orgId: number | null; periodId: number; accountId: number;
    entryDate: string; debit: number; credit: number;
    refType: string; refId: string | number | null; userId: number;
    description?: string | null;
  },
): Promise<void> {
  const side: 'debit' | 'credit' = p.debit > 0 ? 'debit' : 'credit';
  const amount = p.debit > 0 ? p.debit : p.credit;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const desc = p.description || '';

  const [leResult] = await conn.execute<RowData>(
    `INSERT INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'EGP', ?, ?, ?)`,
    [`dual_${p.sourceType}_${p.sourceId}_${Date.now()}`, p.sourceType, p.sourceId,
     p.eventType, p.periodId, p.orgId, p.accountId, side, amount,
     desc, String(p.accountId), now],
  );
  const leId = (leResult as any).insertId;

  await conn.execute(
    `INSERT INTO general_ledger (ledger_entry_id, organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    [leId, p.orgId, p.periodId, p.accountId, p.entryDate,
     p.debit, p.credit, p.refType, p.refId, desc, p.userId],
  );
}

export async function getTrialBalanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const userId = (request as any).userId;
  const organisationId = query.organisationId ? Number(query.organisationId) : null;

  await validateOrgAccess(userId, organisationId);

  let dateFilter = '';
  const params: any[] = [];
  if (query.from) { dateFilter += ' AND gl.entry_date >= ?'; params.push(query.from); }
  if (query.to) { dateFilter += ' AND gl.entry_date <= ?'; params.push(query.to); }

  const rows = await buildHierarchicalReport(pool, dateFilter, params, null, organisationId);
  return reply.send({ data: rows });
}

export async function getIncomeStatementHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const userId = (request as any).userId;
  const organisationId = query.organisationId ? Number(query.organisationId) : null;
  const params: any[] = [];

  await validateOrgAccess(userId, organisationId);

  let dateFilter = '';
  if (query.from) { dateFilter += ' AND gl.entry_date >= ?'; params.push(query.from); }
  if (query.to) { dateFilter += ' AND gl.entry_date <= ?'; params.push(query.to); }

  const rows = await buildHierarchicalReport(pool, dateFilter, params, ['revenue','expense','contra_revenue','contra_expense'], organisationId);

  // Use shared canonical net income calculation when fiscal year is implied (no custom date range)
  let netIncome: number, netRevenue: number, netExpense: number, totalRevenue: number, totalExpense: number, totalContraRevenue: number, totalContraExpense: number;

  if (!query.from && !query.to && query.fiscalYear) {
    const ni = await calculateFiscalYearNetIncome(Number(query.fiscalYear), organisationId);
    totalRevenue = ni.totalRevenue;
    totalContraRevenue = ni.totalContraRevenue;
    totalExpense = ni.totalExpense;
    totalContraExpense = ni.totalContraExpense;
    netRevenue = ni.netRevenue;
    netExpense = ni.netExpense;
    netIncome = ni.netIncome;
  } else if (!query.from && !query.to) {
    // Default to current fiscal year
    const currentFY = new Date().getFullYear();
    const ni = await calculateFiscalYearNetIncome(currentFY, organisationId);
    totalRevenue = ni.totalRevenue;
    totalContraRevenue = ni.totalContraRevenue;
    totalExpense = ni.totalExpense;
    totalContraExpense = ni.totalContraExpense;
    netRevenue = ni.netRevenue;
    netExpense = ni.netExpense;
    netIncome = ni.netIncome;
  } else {
    // Custom date range: use inline calculation (backward compatibility)
    totalRevenue = rows.filter(r => r.type === 'revenue').reduce((sum, r) => sum + r.balance, 0);
    totalContraRevenue = rows.filter(r => r.type === 'contra_revenue').reduce((sum, r) => sum + r.balance, 0);
    totalExpense = rows.filter(r => r.type === 'expense').reduce((sum, r) => sum + r.balance, 0);
    totalContraExpense = rows.filter(r => r.type === 'contra_expense').reduce((sum, r) => sum + r.balance, 0);
    netRevenue = totalRevenue - totalContraRevenue;
    netExpense = totalExpense - totalContraExpense;
    netIncome = netRevenue - netExpense;
  }

  return reply.send({
    data: {
      lines: rows,
      net_income: Math.round(netIncome * 100) / 100,
      net_revenue: Math.round(netRevenue * 100) / 100,
      net_expense: Math.round(netExpense * 100) / 100,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_expense: Math.round(totalExpense * 100) / 100,
      contra_revenue: Math.round(totalContraRevenue * 100) / 100,
      contra_expense: Math.round(totalContraExpense * 100) / 100,
    },
  });
}

export async function getBalanceSheetHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const userId = (request as any).userId;
  const organisationId = query.organisationId ? Number(query.organisationId) : null;
  const params: any[] = [];

  await validateOrgAccess(userId, organisationId);

  let dateFilter = '';
  if (query.asOf) { dateFilter = ' AND gl.entry_date <= ?'; params.push(query.asOf); }

  const rows = await buildHierarchicalReport(pool, dateFilter, params, ['asset','liability','equity','contra_asset','contra_liability','contra_equity'], organisationId);
  return reply.send({ data: rows });
}

export async function getAccountLedgerHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { accountId } = request.params as any;
  const query = request.query as any;
  const userId = (request as any).userId;
  const organisationId = query.organisationId ? Number(query.organisationId) : null;

  await validateOrgAccess(userId, organisationId);

  const [account] = await pool.execute<RowData>(
    `SELECT * FROM chart_of_accounts WHERE id = ?`, [Number(accountId)]
  );
  if (!account.length) {
    throw new NotFoundError('Account', ErrorCodes.ACCOUNT_NOT_FOUND);
  }

  let dateFilter = '';
  let orgFilter = '';
  const params: any[] = [Number(accountId)];
  if (query.from) { dateFilter += ' AND entry_date >= ?'; params.push(query.from); }
  if (query.to) { dateFilter += ' AND entry_date <= ?'; params.push(query.to); }
  if (organisationId != null) { orgFilter = ' AND organisation_id = ?'; params.push(organisationId); }

  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM general_ledger WHERE account_id = ?${dateFilter}${orgFilter} ORDER BY entry_date ASC, id ASC`,
    params
  );
  return reply.send({ data: { account: account[0], entries: rows } });
}

export async function createJournalEntryHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;
  const organisationId = body.organisationId ? Number(body.organisationId) : null;

  if (organisationId != null) {
    await validateOrgAccess(userId, organisationId);
  }

  if (!body.entries || !Array.isArray(body.entries) || body.entries.length < 2) {
    throw new AppError('Journal entry must have at least 2 lines', 400, 'VALIDATION_ERROR');
  }

  const totalDebits = body.entries.reduce((s: number, e: any) => s + Number(e.debit || 0), 0);
  const totalCredits = body.entries.reduce((s: number, e: any) => s + Number(e.credit || 0), 0);

  if (Math.abs(totalDebits - totalCredits) > 0.001) {
    throw new AppError('Journal entry is not balanced (total debits must equal total credits)', 400, 'VALIDATION_ERROR', { code: ErrorCodes.JOURNAL_UNBALANCED });
  }

  // Validate all target accounts are L4 postable
  for (const entry of body.entries) {
    await coaValidator.validatePostable(Number(entry.accountId), 'Journal Entry');
  }

  const [periods] = await pool.execute<RowData>(
    `SELECT id, status FROM accounting_periods WHERE ? BETWEEN start_date AND end_date LIMIT 1`,
    [body.entryDate]
  );
  if (!periods.length) {
    throw new NotFoundError('Accounting period for the given date', ErrorCodes.PERIOD_NOT_FOUND);
  }
  if (periods[0].status === 'closed' || periods[0].status === 'locked') {
    throw new AppError('Accounting period is closed', 409, 'CONFLICT', { code: ErrorCodes.PERIOD_ALREADY_CLOSED });
  }
  const periodId = periods[0].id;

  const transactionId = `journal_${Date.now()}_${userId}`;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const refType = body.referenceType || 'journal';
  const refId = body.referenceId || null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

      // 1. Create canonical ledger_entries
      const entryIds: number[] = [];
      for (const entry of body.entries) {
        const debit = Number(entry.debit || 0);
        const credit = Number(entry.credit || 0);
        const side = debit > 0 ? 'debit' : 'credit';
        const amount = debit > 0 ? debit : credit;

        const [leResult] = await conn.execute<RowData>(
          `INSERT INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
           VALUES (?, 'journal', ?, 'manual_journal', ?, ?, ?, NULL, ?, ?, 'EGP', ?, ?, ?)`,
          [
            transactionId,
            entry.accountId,
            periodId,
            organisationId,
            entry.accountId,
            side,
            amount,
            entry.description || body.description || null,
            String(entry.accountId),
            now,
          ]
        );
        const leId = (leResult as any).insertId;
        entryIds.push(leId);

        // 2. Project to general_ledger with ledger_entry_id
        await conn.execute(
          `INSERT INTO general_ledger (ledger_entry_id, organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
          [
            leId,
            organisationId,
            periodId,
            entry.accountId,
            body.entryDate,
            debit,
            credit,
            refType,
            refId,
            entry.description || body.description || null,
            userId,
          ]
        );
      }

    await conn.commit();

    recordAudit({
      actorId: userId,
      action: 'ACCOUNTING.JOURNAL.CREATE',
      entityType: 'journal_entry',
      entityId: entryIds[0],
      afterState: { entryDate: body.entryDate, lineCount: body.entries.length, totalDebits, totalCredits, organisationId },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({ data: { ids: entryIds } });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function listJournalEntriesHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];
  const conditions: string[] = [];

  if (query.periodId) { conditions.push('gl.period_id = ?'); params.push(Number(query.periodId)); }
  if (query.accountId) { conditions.push('gl.account_id = ?'); params.push(Number(query.accountId)); }
  if (query.from) { conditions.push('gl.entry_date >= ?'); params.push(query.from); }
  if (query.to) { conditions.push('gl.entry_date <= ?'); params.push(query.to); }
  if (query.referenceType) { conditions.push('gl.reference_type = ?'); params.push(query.referenceType); }
  if (query.referenceId) { conditions.push('gl.reference_id = ?'); params.push(Number(query.referenceId)); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await pool.execute<RowData>(
    `SELECT gl.*, a.code AS account_code, a.name AS account_name
     FROM general_ledger gl
     JOIN chart_of_accounts a ON a.id = gl.account_id
     ${where}
     ORDER BY gl.entry_date DESC, gl.id DESC
     LIMIT 500`,
    params
  );
  return reply.send({ data: rows });
}

export async function listInvoicesHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];
  const conditions: string[] = [];

  if (query.status) { conditions.push('i.status = ?'); params.push(query.status); }
  if (query.invoiceType) { conditions.push('i.invoice_type = ?'); params.push(query.invoiceType); }
  if (query.organisationId) { conditions.push('i.organisation_id = ?'); params.push(Number(query.organisationId)); }
  if (query.from) { conditions.push('i.issue_date >= ?'); params.push(query.from); }
  if (query.to) { conditions.push('i.issue_date <= ?'); params.push(query.to); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const [rows] = await pool.execute<RowData>(
    `SELECT i.* FROM invoices i ${where} ORDER BY i.created_at DESC LIMIT 500`,
    params
  );
  return reply.send({ data: rows });
}

export async function createInvoiceHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  if (!body.items || !Array.isArray(body.items) || !body.items.length) {
    throw new AppError('Invoice must have at least one item', 400, 'VALIDATION_ERROR');
  }

  let subtotal = 0;
  let taxAmount = 0;
  const items = body.items.map((item: any) => {
    const lineTotal = Number(item.quantity || 1) * Number(item.unitPrice || 0);
    const lineTax = lineTotal * (Number(item.taxRate || 0) / 100);
    subtotal += lineTotal;
    taxAmount += lineTax;
    return {
      ...item,
      quantity: Number(item.quantity || 1),
      unitPrice: Number(item.unitPrice || 0),
      taxRate: Number(item.taxRate || 0),
      taxAmount: lineTax,
      total: lineTotal + lineTax,
    };
  });
  const total = subtotal + taxAmount;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [invResult] = await conn.execute<RowData>(
      `INSERT INTO invoices (organisation_id, user_id, invoice_number, invoice_type, status, issue_date, due_date, subtotal, tax_amount, total, notes, reference_type, reference_id, created_by)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.organisationId || null,
        body.userId || null,
        body.invoiceNumber,
        body.invoiceType || 'sales',
        body.issueDate,
        body.dueDate || null,
        subtotal,
        taxAmount,
        total,
        body.notes || null,
        body.referenceType || null,
        body.referenceId || null,
        userId,
      ]
    );
    const invoiceId = (invResult as any).insertId;

    for (const item of items) {
      await conn.execute(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, tax_rate, tax_amount, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [invoiceId, item.description, item.quantity, item.unitPrice, item.taxRate, item.taxAmount, item.total]
      );
    }

    await conn.commit();

    recordAudit({
      actorId: userId,
      action: 'ACCOUNTING.INVOICE.CREATE',
      entityType: 'invoices',
      entityId: invoiceId,
      afterState: { invoiceNumber: body.invoiceNumber, total },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({ data: { id: invoiceId } });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function getInvoiceHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;

  const [invoices] = await pool.execute<RowData>(
    `SELECT * FROM invoices WHERE id = ?`, [Number(id)]
  );
  if (!invoices.length) {
    throw new NotFoundError('Invoice', ErrorCodes.INVOICE_NOT_FOUND);
  }

  const [items] = await pool.execute<RowData>(
    `SELECT * FROM invoice_items WHERE invoice_id = ?`, [Number(id)]
  );

  return reply.send({ data: { ...invoices[0], items } });
}

export async function issueInvoiceHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [invoices] = await pool.execute<RowData>(
    `SELECT * FROM invoices WHERE id = ?`, [Number(id)]
  );
  if (!invoices.length) {
    throw new NotFoundError('Invoice', ErrorCodes.INVOICE_NOT_FOUND);
  }
  const inv = invoices[0];
  if (inv.status !== 'draft') {
    throw new AppError('Only draft invoices can be issued', 400, 'VALIDATION_ERROR');
  }

  const [periods] = await pool.execute<RowData>(
    `SELECT id FROM accounting_periods WHERE ? BETWEEN start_date AND end_date AND status = 'open' LIMIT 1`,
    [inv.issue_date]
  );
  if (!periods.length) {
    throw new AppError('No open accounting period for the invoice date', 400, 'VALIDATION_ERROR');
  }

  // Resolve accounts via concepts-based mapping (no hard-coded IDs)
  const eventType = inv.invoice_type === 'purchase' ? 'purchase_invoice_issue' : 'invoice_issue';
  const orgId: number | null = inv.organisation_id ?? null;
  const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
  const mapping = await accountingEngineService.resolveMapping(eventType, orgId);

  // Build concept→account map from resolved mapping
  const conceptToAccount = new Map<string, number>();
  for (const m of mapping) {
    conceptToAccount.set(m.concept, m.accountId);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE invoices SET status = 'issued' WHERE id = ?`, [Number(id)]
    );
    const periodId = periods[0].id;

    if (eventType === 'purchase_invoice_issue') {
      const expenseId = conceptToAccount.get('expense');
      const payableId = conceptToAccount.get('accounts_payable');
      if (!expenseId || !payableId) {
        throw new AppError('Missing required account mapping for purchase_invoice_issue', 500, 'CONFIG_ERROR');
      }
      await createDualEntry(conn, {
        sourceType: 'invoice', sourceId: Number(id), eventType,
        orgId, periodId, accountId: expenseId,
        entryDate: inv.issue_date, debit: Number(inv.total), credit: 0,
        refType: 'invoice', refId: Number(id), userId,
        description: `Purchase invoice ${inv.invoice_number}`,
      });
      await createDualEntry(conn, {
        sourceType: 'invoice', sourceId: Number(id), eventType,
        orgId, periodId, accountId: payableId,
        entryDate: inv.issue_date, debit: 0, credit: Number(inv.total),
        refType: 'invoice', refId: Number(id), userId,
        description: `Purchase invoice ${inv.invoice_number}`,
      });
    } else {
      const receivableId = conceptToAccount.get('receivable');
      const revenueId = conceptToAccount.get('revenue');
      const taxLiabilityId = conceptToAccount.get('tax_liability');
      if (!receivableId || !revenueId) {
        throw new AppError('Missing required account mapping for invoice_issue', 500, 'CONFIG_ERROR');
      }
      await createDualEntry(conn, {
        sourceType: 'invoice', sourceId: Number(id), eventType,
        orgId, periodId, accountId: receivableId,
        entryDate: inv.issue_date, debit: Number(inv.total), credit: 0,
        refType: 'invoice', refId: Number(id), userId,
        description: `Invoice ${inv.invoice_number}`,
      });
      const netRevenue = Number(inv.subtotal || inv.total - inv.tax_amount);
      await createDualEntry(conn, {
        sourceType: 'invoice', sourceId: Number(id), eventType,
        orgId, periodId, accountId: revenueId,
        entryDate: inv.issue_date, debit: 0, credit: netRevenue,
        refType: 'invoice', refId: Number(id), userId,
        description: `Invoice ${inv.invoice_number} (net revenue)`,
      });
      if (taxLiabilityId && Number(inv.tax_amount) > 0) {
        await createDualEntry(conn, {
          sourceType: 'invoice', sourceId: Number(id), eventType,
          orgId, periodId, accountId: taxLiabilityId,
          entryDate: inv.issue_date, debit: 0, credit: Number(inv.tax_amount),
          refType: 'invoice', refId: Number(id), userId,
          description: `Tax on invoice ${inv.invoice_number}`,
        });
      }
    }

    await conn.commit();

    recordAudit({
      actorId: userId,
      action: 'ACCOUNTING.INVOICE.ISSUE',
      entityType: 'invoices',
      entityId: Number(id),
      afterState: { status: 'issued', invoiceNumber: inv.invoice_number },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({ data: { id: Number(id), status: 'issued' } });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function recordInvoicePaymentHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [invoices] = await pool.execute<RowData>(
    `SELECT * FROM invoices WHERE id = ?`, [Number(id)]
  );
  if (!invoices.length) {
    throw new NotFoundError('Invoice', ErrorCodes.INVOICE_NOT_FOUND);
  }
  const inv = invoices[0];
  const paymentAmount = Number(body.amount || 0);

  if (inv.status === 'cancelled') {
    throw new AppError('Cannot record payment on a cancelled invoice', 400, 'VALIDATION_ERROR');
  }
  if (inv.status === 'paid') {
    throw new AppError('Invoice is already fully paid', 400, 'VALIDATION_ERROR');
  }

  const newPaidAmount = Number(inv.paid_amount) + paymentAmount;
  const newStatus = newPaidAmount >= Number(inv.total) ? 'paid' : 'partially_paid';

  const [periods] = await pool.execute<RowData>(
    `SELECT id FROM accounting_periods WHERE CURDATE() BETWEEN start_date AND end_date AND status = 'open' LIMIT 1`
  );
  if (!periods.length) {
    throw new AppError('No open accounting period for today', 400, 'VALIDATION_ERROR');
  }

  // Resolve accounts via concepts-based mapping
  const eventType = inv.invoice_type === 'purchase' ? 'purchase_invoice_payment' : 'invoice_payment';
  const orgId: number | null = inv.organisation_id ?? null;
  const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
  const mapping = await accountingEngineService.resolveMapping(eventType, orgId);
  const conceptToAccount = new Map<string, number>();
  for (const m of mapping) {
    conceptToAccount.set(m.concept, m.accountId);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE invoices SET paid_amount = ?, status = ? WHERE id = ?`,
      [newPaidAmount, newStatus, Number(id)]
    );
    const periodId = periods[0].id;

    if (eventType === 'purchase_invoice_payment') {
      const payableId = conceptToAccount.get('accounts_payable');
      const cashBankId = conceptToAccount.get('cash_bank');
      if (!payableId || !cashBankId) {
        throw new AppError('Missing required account mapping for purchase_invoice_payment', 500, 'CONFIG_ERROR');
      }
      await createDualEntry(conn, {
        sourceType: 'invoice', sourceId: Number(id), eventType,
        orgId, periodId, accountId: payableId,
        entryDate: new Date().toISOString().slice(0, 10), debit: paymentAmount, credit: 0,
        refType: 'invoice_payment', refId: Number(id), userId,
        description: `Payment for purchase invoice ${inv.invoice_number}`,
      });
      await createDualEntry(conn, {
        sourceType: 'invoice', sourceId: Number(id), eventType,
        orgId, periodId, accountId: cashBankId,
        entryDate: new Date().toISOString().slice(0, 10), debit: 0, credit: paymentAmount,
        refType: 'invoice_payment', refId: Number(id), userId,
        description: `Payment for purchase invoice ${inv.invoice_number}`,
      });
    } else {
      const cashBankId = conceptToAccount.get('cash_bank');
      const receivableId = conceptToAccount.get('receivable');
      if (!cashBankId || !receivableId) {
        throw new AppError('Missing required account mapping for invoice_payment', 500, 'CONFIG_ERROR');
      }
      await createDualEntry(conn, {
        sourceType: 'invoice', sourceId: Number(id), eventType,
        orgId, periodId, accountId: cashBankId,
        entryDate: new Date().toISOString().slice(0, 10), debit: paymentAmount, credit: 0,
        refType: 'invoice_payment', refId: Number(id), userId,
        description: `Payment for invoice ${inv.invoice_number}`,
      });
      await createDualEntry(conn, {
        sourceType: 'invoice', sourceId: Number(id), eventType,
        orgId, periodId, accountId: receivableId,
        entryDate: new Date().toISOString().slice(0, 10), debit: 0, credit: paymentAmount,
        refType: 'invoice_payment', refId: Number(id), userId,
        description: `Payment for invoice ${inv.invoice_number}`,
      });
    }

    await conn.commit();

    recordAudit({
      actorId: userId,
      action: 'ACCOUNTING.INVOICE.PAYMENT',
      entityType: 'invoices',
      entityId: Number(id),
      afterState: { paidAmount: newPaidAmount, status: newStatus },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({ data: { id: Number(id), status: newStatus, paidAmount: newPaidAmount } });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function cancelInvoiceHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [invoices] = await pool.execute<RowData>(
    `SELECT * FROM invoices WHERE id = ?`, [Number(id)]
  );
  if (!invoices.length) {
    throw new NotFoundError('Invoice', ErrorCodes.INVOICE_NOT_FOUND);
  }
  const inv = invoices[0];
  if (inv.status === 'cancelled') {
    throw new AppError('Invoice is already cancelled', 400, 'VALIDATION_ERROR');
  }
  if (inv.status === 'paid') {
    throw new AppError('Cannot cancel a paid invoice', 400, 'VALIDATION_ERROR');
  }

  const [periods] = await pool.execute<RowData>(
    `SELECT id FROM accounting_periods WHERE CURDATE() BETWEEN start_date AND end_date AND status = 'open' LIMIT 1`
  );
  if (!periods.length) {
    throw new AppError('No open accounting period for today', 400, 'VALIDATION_ERROR');
  }

  // Resolve accounts via concepts-based mapping
  const eventType = inv.invoice_type === 'purchase' ? 'purchase_invoice_cancel' : 'invoice_cancel';
  const orgId: number | null = inv.organisation_id ?? null;
  const { accountingEngineService } = await import('../../financial/application/accounting-engine.service.js');
  const mapping = await accountingEngineService.resolveMapping(eventType, orgId);
  const conceptToAccount = new Map<string, number>();
  for (const m of mapping) {
    conceptToAccount.set(m.concept, m.accountId);
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE invoices SET status = 'cancelled' WHERE id = ?`, [Number(id)]
    );
    const periodId = periods[0].id;

    if (eventType === 'purchase_invoice_cancel') {
      const payableId = conceptToAccount.get('accounts_payable');
      const expenseId = conceptToAccount.get('expense');
      if (!payableId || !expenseId) {
        throw new AppError('Missing required account mapping for purchase_invoice_cancel', 500, 'CONFIG_ERROR');
      }
      await createDualEntry(conn, {
        sourceType: 'invoice', sourceId: Number(id), eventType,
        orgId, periodId, accountId: payableId,
        entryDate: new Date().toISOString().slice(0, 10), debit: Number(inv.total), credit: 0,
        refType: 'invoice_cancel', refId: Number(id), userId,
        description: `Reversal - cancelled purchase invoice ${inv.invoice_number}`,
      });
      await createDualEntry(conn, {
        sourceType: 'invoice', sourceId: Number(id), eventType,
        orgId, periodId, accountId: expenseId,
        entryDate: new Date().toISOString().slice(0, 10), debit: 0, credit: Number(inv.total),
        refType: 'invoice_cancel', refId: Number(id), userId,
        description: `Reversal - cancelled purchase invoice ${inv.invoice_number}`,
      });
    } else {
      const revenueId = conceptToAccount.get('revenue');
      const receivableId = conceptToAccount.get('receivable');
      if (!revenueId || !receivableId) {
        throw new AppError('Missing required account mapping for invoice_cancel', 500, 'CONFIG_ERROR');
      }
      await createDualEntry(conn, {
        sourceType: 'invoice', sourceId: Number(id), eventType,
        orgId, periodId, accountId: receivableId,
        entryDate: new Date().toISOString().slice(0, 10), debit: 0, credit: Number(inv.total),
        refType: 'invoice_cancel', refId: Number(id), userId,
        description: `Reversal - cancelled invoice ${inv.invoice_number}`,
      });
      await createDualEntry(conn, {
        sourceType: 'invoice', sourceId: Number(id), eventType,
        orgId, periodId, accountId: revenueId,
        entryDate: new Date().toISOString().slice(0, 10), debit: Number(inv.total), credit: 0,
        refType: 'invoice_cancel', refId: Number(id), userId,
        description: `Reversal - cancelled invoice ${inv.invoice_number}`,
      });
    }

    await conn.commit();

    recordAudit({
      actorId: userId,
      action: 'ACCOUNTING.INVOICE.CANCEL',
      entityType: 'invoices',
      entityId: Number(id),
      afterState: { status: 'cancelled', invoiceNumber: inv.invoice_number },
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

export async function listTaxRatesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM tax_rates WHERE is_active = 1 ORDER BY name`
  );
  return reply.send({ data: rows });
}

export async function createTaxRateHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const [result] = await pool.execute<RowData>(
    `INSERT INTO tax_rates (name, rate, type, is_active, country_code) VALUES (?, ?, ?, ?, ?)`,
    [body.name, body.rate, body.type || 'percentage', body.isActive ?? 1, body.countryCode || null]
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'ACCOUNTING.TAX_RATE.CREATE',
    entityType: 'tax_rates',
    entityId: insertId,
    afterState: { name: body.name, rate: body.rate },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.status(201).send({ data: { id: insertId } });
}

export async function updateTaxRateHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(
    `SELECT * FROM tax_rates WHERE id = ?`, [Number(id)]
  );
  if (!existing.length) {
    throw new NotFoundError('Tax rate', ErrorCodes.TAX_RATE_NOT_FOUND);
  }

  await pool.execute<RowData>(
    `UPDATE tax_rates SET name = COALESCE(?, name), rate = COALESCE(?, rate), is_active = COALESCE(?, is_active), country_code = COALESCE(?, country_code) WHERE id = ?`,
    [body.name ?? null, body.rate ?? null, body.isActive ?? null, body.countryCode ?? null, Number(id)]
  );

  recordAudit({
    actorId: userId,
    action: 'ACCOUNTING.TAX_RATE.UPDATE',
    entityType: 'tax_rates',
    entityId: Number(id),
    beforeState: { name: existing[0].name, rate: existing[0].rate },
    afterState: { name: body.name, rate: body.rate },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { id: Number(id) } });
}

export async function processPendingEventsHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const eventsProcessed = 0;

  recordAudit({
    actorId: userId,
    action: 'ACCOUNTING.PROCESS_EVENTS',
    entityType: 'event_to_journal',
    entityId: 0,
    afterState: { eventsProcessed, source: body.source || 'manual' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { eventsProcessed, message: 'Event-to-journal processing completed. 0 events processed.' } });
}

// ── Accounting Event Mappings ──

export async function listMappingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { organisationId } = request.query as any;
  const orgId = organisationId ? Number(organisationId) : null;

  const [rows] = await pool.execute<RowData>(
    `SELECT ael.event_type, ael.organisation_id, ael.concept, ael.account_id,
            ael.is_active, coa.code AS account_code, coa.name AS account_name
     FROM accounting_event_mapping_lines ael
     JOIN chart_of_accounts coa ON coa.id = ael.account_id
     WHERE ael.organisation_id IS NULL
        OR (ael.organisation_id = ?)
     ORDER BY ael.event_type, ael.organisation_id, ael.concept`,
    [orgId],
  );

  const global = new Map<string, Map<string, any>>();
  const orgMappings = new Map<string, Map<string, any>>();
  for (const r of rows as any[]) {
    const map = r.organisation_id === null ? global : orgMappings;
    if (!map.has(r.event_type)) map.set(r.event_type, new Map());
    map.get(r.event_type)!.set(r.concept, r);
  }

  const concepts = getEventConcepts;
  const result: any[] = [];

  for (const [eventType] of global) {
    const gMap = global.get(eventType)!;
    const oMap = orgMappings.get(eventType);
    for (const [, gRow] of gMap) {
      const conceptDef = concepts(eventType).find(c => c.concept === gRow.concept);
      const orgRow = oMap?.get(gRow.concept);
      result.push({
        event_type: eventType,
        organisation_id: orgRow ? orgId : null,
        concept: gRow.concept,
        side: conceptDef?.side ?? 'debit',
        account_id: orgRow ? orgRow.account_id : gRow.account_id,
        account_code: orgRow ? orgRow.account_code : gRow.account_code,
        account_name: orgRow ? orgRow.account_name : gRow.account_name,
        is_active: orgRow ? !!orgRow.is_active : !!gRow.is_active,
        is_global: !orgRow,
        is_overridden: !!orgRow,
      });
    }
  }

  return reply.send({ data: result });
}

export async function getMappingHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { eventType } = request.params as any;
  const { organisationId } = request.query as any;
  const orgId = organisationId ? Number(organisationId) : null;

  const requiredConcepts = getEventConcepts(eventType);

  const [gRows] = await pool.execute<RowData>(
    `SELECT ael.concept, ael.account_id, coa.code AS account_code, coa.name AS account_name, coa.is_active
     FROM accounting_event_mapping_lines ael
     JOIN chart_of_accounts coa ON coa.id = ael.account_id
     WHERE ael.event_type = ? AND ael.organisation_id IS NULL AND ael.is_active = 1`,
    [eventType],
  );

  let orgRows: any[] = [];
  let isOverridden = false;
  if (orgId != null) {
    const [oRows] = await pool.execute<RowData>(
      `SELECT ael.concept, ael.account_id, coa.code AS account_code, coa.name AS account_name, coa.is_active
       FROM accounting_event_mapping_lines ael
       JOIN chart_of_accounts coa ON coa.id = ael.account_id
       WHERE ael.event_type = ? AND ael.organisation_id = ? AND ael.is_active = 1`,
      [eventType, orgId],
    );
    orgRows = oRows as any[];
    isOverridden = orgRows.length > 0;
  }

  const conceptMap = new Map<string, any>();
  for (const r of gRows as any[]) conceptMap.set(r.concept, r);

  if (isOverridden) {
    for (const r of orgRows) conceptMap.set(r.concept, r);
  }

  const lines = requiredConcepts.map(c => {
    const m = conceptMap.get(c.concept);
    return {
      concept: c.concept,
      side: c.side,
      account_id: m?.account_id ?? null,
      account_code: m?.account_code ?? null,
      account_name: m?.account_name ?? null,
      account_active: m?.is_active ?? false,
      mapped: !!m,
    };
  });

  return reply.send({
    data: {
      eventType,
      requiredConcepts: lines,
      isOverridden,
      source: isOverridden ? 'organization' : 'global',
      organisationId: orgId,
    },
  });
}

export async function updateMappingHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { eventType } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;
  const orgId = body.organisationId ? Number(body.organisationId) : null;

  if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
    throw new AppError('lines array is required', 400, 'VALIDATION_ERROR');
  }

  const requiredConcepts = getEventConcepts(eventType);
  const submittedConcepts = body.lines.map((l: any) => l.concept);
  const missing = validateCompleteMapping(eventType, submittedConcepts);
  if (missing.length > 0) {
    throw new AppError(`Incomplete mapping. Missing concepts: ${missing.join(', ')}`, 400, 'VALIDATION_ERROR');
  }

  const conceptSet = new Set<string>(submittedConcepts);
  if (conceptSet.size !== submittedConcepts.length) {
    throw new AppError('Duplicate concepts in mapping lines', 400, 'VALIDATION_ERROR');
  }

  const accountIds: number[] = body.lines.map((l: any) => Number(l.accountId));
  const uniqueIds = [...new Set(accountIds)];
  const placeholders = uniqueIds.map(() => '?').join(',');
  const [accounts] = await pool.execute<RowData>(
    `SELECT id, is_active, organisation_id FROM chart_of_accounts WHERE id IN (${placeholders})`,
    uniqueIds,
  );
  const acctMap = new Map((accounts as any[]).map((a: any) => [a.id, a]));
  for (const id of uniqueIds) {
    const acct = acctMap.get(id);
    if (!acct) throw new AppError(`Account ${id} does not exist`, 400, 'VALIDATION_ERROR');
    if (!acct.is_active) throw new AppError(`Account ${id} is inactive`, 400, 'VALIDATION_ERROR');
    if (orgId != null && acct.organisation_id != null && acct.organisation_id !== orgId) {
      throw new AppError(`Account ${id} belongs to org ${acct.organisation_id}, not org ${orgId}`, 400, 'VALIDATION_ERROR');
    }
    await coaValidator.validatePostable(id, 'Event Mapping');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      'DELETE FROM accounting_event_mapping_lines WHERE event_type = ? AND organisation_id = ?',
      [eventType, orgId],
    );

    for (const line of body.lines) {
      await conn.execute(
        `INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        [eventType, orgId, line.concept, Number(line.accountId)],
      );
    }

    await conn.commit();

    recordAudit({
      actorId: userId,
      action: 'ACCOUNTING.MAPPING.UPDATE',
      entityType: 'accounting_event_mapping_lines',
      entityId: 0,
      afterState: { eventType, organisationId: orgId, concepts: body.lines.map((l: any) => l.concept) },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.send({ data: { eventType, organisationId: orgId, message: 'Mapping updated' } });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function deleteMappingHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { eventType } = request.params as any;
  const { organisationId } = request.query as any;
  const userId = (request as any).userId;
  const orgId = organisationId ? Number(organisationId) : null;

  if (orgId == null) {
    throw new AppError('organisationId is required to delete an org override', 400, 'VALIDATION_ERROR');
  }

  const [existing] = await pool.execute<RowData>(
    'SELECT id FROM accounting_event_mapping_lines WHERE event_type = ? AND organisation_id = ? LIMIT 1',
    [eventType, orgId],
  );

  if ((existing as any[]).length === 0) {
    return reply.send({ data: { eventType, organisationId: orgId, message: 'No override to delete — already using global default' } });
  }

  await pool.execute(
    'DELETE FROM accounting_event_mapping_lines WHERE event_type = ? AND organisation_id = ?',
    [eventType, orgId],
  );

  recordAudit({
    actorId: userId,
    action: 'ACCOUNTING.MAPPING.DELETE',
    entityType: 'accounting_event_mapping_lines',
    entityId: 0,
    afterState: { eventType, organisationId: orgId, restoredTo: 'global_default' },
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  });

  return reply.send({ data: { eventType, organisationId: orgId, message: 'Override deleted — restored to global default' } });
}

// ── Year Close Handlers ──

export async function yearClosePreviewHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const userId = (request as any).userId;
  const fiscalYear = Number(query.fiscalYear) || new Date().getFullYear();
  const organisationId = query.organisationId ? Number(query.organisationId) : null;
  await validateOrgAccess(userId, organisationId);

  const preview = await yearClosingService.previewClose(fiscalYear, organisationId);
  return reply.send({ data: preview });
}

export async function yearCloseHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const userId = (request as any).userId;
  const fiscalYear = Number(body.fiscalYear) || new Date().getFullYear();
  const organisationId = body.organisationId ? Number(body.organisationId) : null;
  await validateOrgAccess(userId, organisationId);

  try {
    const result = await yearClosingService.closeYear(fiscalYear, organisationId, userId);
    return reply.send({ data: result });
  } catch (err: any) {
    if (err?.code === 'ER_DUP_ENTRY') {
      return reply.status(409).send({ error: 'CONFLICT', message: 'Year already closed for this organization/fiscal year' });
    }
    throw err;
  }
}

export async function yearCloseHistoryHandler(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as any;
  const userId = (request as any).userId;
  const organisationId = query.organisationId ? Number(query.organisationId) : null;
  await validateOrgAccess(userId, organisationId);

  const history = await yearClosingService.getHistory(organisationId);
  return reply.send({ data: history });
}

export async function yearCloseReopenHandler(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as any;
  const userId = (request as any).userId;
  const fiscalYear = Number(body.fiscalYear) || new Date().getFullYear();
  const organisationId = body.organisationId ? Number(body.organisationId) : null;
  const reason = body.reason || 'No reason provided';
  await validateOrgAccess(userId, organisationId);

  const result = await yearClosingService.reopenYear(fiscalYear, organisationId, userId, reason);
  return reply.send({ data: result });
}

// ── Fixed openPeriodHandler: reject locked periods ──
// (replaces existing openPeriodHandler with added locked check)

