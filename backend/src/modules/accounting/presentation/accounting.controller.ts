import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';
import { AppError, NotFoundError, ConflictError } from '../../../shared/errors/app-error.js';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

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
    `SELECT a.*, p.name AS parent_name, p.code AS parent_code
     FROM chart_of_accounts a
     LEFT JOIN chart_of_accounts p ON p.id = a.parent_id
     ORDER BY a.code`
  );
  return reply.send({ data: rows });
}

export async function createAccountHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(
    `SELECT id FROM chart_of_accounts WHERE code = ?`, [body.code]
  );
  if (existing.length) {
    throw new ConflictError('Account code already exists', ErrorCodes.ACCOUNT_CODE_EXISTS);
  }

  const [result] = await pool.execute<RowData>(
    `INSERT INTO chart_of_accounts (code, name, type, parent_id, is_active, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [body.code, body.name, body.type, body.parentId || null, body.isActive ?? 1, body.description || null]
  );
  const insertId = (result as any).insertId;

  recordAudit({
    actorId: userId,
    action: 'ACCOUNTING.COA.CREATE',
    entityType: 'chart_of_accounts',
    entityId: insertId,
    afterState: { code: body.code, name: body.name, type: body.type },
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

export async function getTrialBalanceHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;

  let dateFilter = '';
  const params: any[] = [];
  if (query.from) {
    dateFilter += ' AND gl.entry_date >= ?';
    params.push(query.from);
  }
  if (query.to) {
    dateFilter += ' AND gl.entry_date <= ?';
    params.push(query.to);
  }

  const [rows] = await pool.execute<RowData>(
    `SELECT gl.account_id, a.code, a.name, a.type,
            COALESCE(SUM(gl.debit), 0) AS total_debits,
            COALESCE(SUM(gl.credit), 0) AS total_credits,
            COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0) AS balance
     FROM general_ledger gl
     JOIN chart_of_accounts a ON a.id = gl.account_id
     WHERE 1=1${dateFilter}
     GROUP BY gl.account_id, a.code, a.name, a.type
     ORDER BY a.code`,
    params
  );
  return reply.send({ data: rows });
}

export async function getIncomeStatementHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];

  let dateFilter = '';
  if (query.from) { dateFilter += ' AND gl.entry_date >= ?'; params.push(query.from); }
  if (query.to) { dateFilter += ' AND gl.entry_date <= ?'; params.push(query.to); }

  const [rows] = await pool.execute<RowData>(
    `SELECT gl.account_id, a.code, a.name, a.type,
            COALESCE(SUM(gl.debit), 0) AS total_debits,
            COALESCE(SUM(gl.credit), 0) AS total_credits,
            COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0) AS balance
     FROM general_ledger gl
     JOIN chart_of_accounts a ON a.id = gl.account_id
     WHERE a.type IN ('revenue','expense','contra_revenue','contra_expense')${dateFilter}
     GROUP BY gl.account_id, a.code, a.name, a.type
     ORDER BY a.code`,
    params
  );
  return reply.send({ data: rows });
}

export async function getBalanceSheetHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const query = request.query as any;
  const params: any[] = [];

  let dateFilter = '';
  if (query.asOf) { dateFilter = ' AND gl.entry_date <= ?'; params.push(query.asOf); }

  const [rows] = await pool.execute<RowData>(
    `SELECT gl.account_id, a.code, a.name, a.type,
            COALESCE(SUM(gl.debit), 0) AS total_debits,
            COALESCE(SUM(gl.credit), 0) AS total_credits,
            COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0) AS balance
     FROM general_ledger gl
     JOIN chart_of_accounts a ON a.id = gl.account_id
     WHERE a.type IN ('asset','liability','equity','contra_asset','contra_liability','contra_equity')${dateFilter}
     GROUP BY gl.account_id, a.code, a.name, a.type
     ORDER BY a.code`,
    params
  );
  return reply.send({ data: rows });
}

export async function getAccountLedgerHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { accountId } = request.params as any;

  const [account] = await pool.execute<RowData>(
    `SELECT * FROM chart_of_accounts WHERE id = ?`, [Number(accountId)]
  );
  if (!account.length) {
    throw new NotFoundError('Account', ErrorCodes.ACCOUNT_NOT_FOUND);
  }

  const query = request.query as any;
  let dateFilter = '';
  const params: any[] = [Number(accountId)];
  if (query.from) { dateFilter += ' AND entry_date >= ?'; params.push(query.from); }
  if (query.to) { dateFilter += ' AND entry_date <= ?'; params.push(query.to); }

  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM general_ledger WHERE account_id = ?${dateFilter} ORDER BY entry_date ASC, id ASC`,
    params
  );
  return reply.send({ data: { account: account[0], entries: rows } });
}

export async function createJournalEntryHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;

  if (!body.entries || !Array.isArray(body.entries) || body.entries.length < 2) {
    throw new AppError('Journal entry must have at least 2 lines', 400, 'VALIDATION_ERROR');
  }

  const totalDebits = body.entries.reduce((s: number, e: any) => s + Number(e.debit || 0), 0);
  const totalCredits = body.entries.reduce((s: number, e: any) => s + Number(e.credit || 0), 0);

  if (Math.abs(totalDebits - totalCredits) > 0.001) {
    throw new AppError('Journal entry is not balanced (total debits must equal total credits)', 400, 'VALIDATION_ERROR', { code: ErrorCodes.JOURNAL_UNBALANCED });
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

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const insertIds: number[] = [];
    for (const entry of body.entries) {
      const [result] = await conn.execute<RowData>(
        `INSERT INTO general_ledger (period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        [
          periods[0].id,
          entry.accountId,
          body.entryDate,
          entry.debit || 0,
          entry.credit || 0,
          body.referenceType || null,
          body.referenceId || null,
          entry.description || body.description || null,
          userId,
        ]
      );
      insertIds.push((result as any).insertId);
    }

    await conn.commit();

    recordAudit({
      actorId: userId,
      action: 'ACCOUNTING.JOURNAL.CREATE',
      entityType: 'general_ledger',
      entityId: insertIds[0],
      afterState: { entryDate: body.entryDate, lineCount: body.entries.length, totalDebits, totalCredits },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return reply.status(201).send({ data: { ids: insertIds } });
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

    if (eventType === 'purchase_invoice_issue') {
      const expenseId = conceptToAccount.get('expense');
      const payableId = conceptToAccount.get('accounts_payable');
      if (!expenseId || !payableId) {
        throw new AppError('Missing required account mapping for purchase_invoice_issue', 500, 'CONFIG_ERROR');
      }
      await conn.execute(
        `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'invoice', ?, ?, ?)`,
        [orgId, periods[0].id, expenseId, inv.issue_date, inv.total, 0, Number(id), `Purchase invoice ${inv.invoice_number}`, userId]
      );
      await conn.execute(
        `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'invoice', ?, ?, ?)`,
        [orgId, periods[0].id, payableId, inv.issue_date, 0, inv.total, Number(id), `Purchase invoice ${inv.invoice_number}`, userId]
      );
    } else {
      const receivableId = conceptToAccount.get('receivable');
      const revenueId = conceptToAccount.get('revenue');
      const taxLiabilityId = conceptToAccount.get('tax_liability');
      if (!receivableId || !revenueId) {
        throw new AppError('Missing required account mapping for invoice_issue', 500, 'CONFIG_ERROR');
      }
      // Debit Receivable (total including tax)
      await conn.execute(
        `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'invoice', ?, ?, ?)`,
        [orgId, periods[0].id, receivableId, inv.issue_date, inv.total, 0, Number(id), `Invoice ${inv.invoice_number}`, userId]
      );
      // Credit Revenue (net amount = total - tax)
      const netRevenue = Number(inv.subtotal || inv.total - inv.tax_amount);
      await conn.execute(
        `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'invoice', ?, ?, ?)`,
        [orgId, periods[0].id, revenueId, inv.issue_date, 0, netRevenue, Number(id), `Invoice ${inv.invoice_number} (net revenue)`, userId]
      );
      // Credit Tax Liability (tax amount) — if mapped to same account as revenue, the engine would merge it;
      // here in general_ledger we post it as a separate line if the account differs
      if (taxLiabilityId && Number(inv.tax_amount) > 0) {
        await conn.execute(
          `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 0, 'invoice', ?, ?, ?)`,
          [orgId, periods[0].id, taxLiabilityId, inv.issue_date, 0, Number(inv.tax_amount), Number(id), `Tax on invoice ${inv.invoice_number}`, userId]
        );
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

    if (eventType === 'purchase_invoice_payment') {
      const payableId = conceptToAccount.get('accounts_payable');
      const cashBankId = conceptToAccount.get('cash_bank');
      if (!payableId || !cashBankId) {
        throw new AppError('Missing required account mapping for purchase_invoice_payment', 500, 'CONFIG_ERROR');
      }
      await conn.execute(
        `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
         VALUES (?, ?, ?, CURDATE(), ?, ?, 0, 'invoice_payment', ?, ?, ?)`,
        [orgId, periods[0].id, payableId, paymentAmount, 0, Number(id), `Payment for purchase invoice ${inv.invoice_number}`, userId]
      );
      await conn.execute(
        `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
         VALUES (?, ?, ?, CURDATE(), ?, ?, 0, 'invoice_payment', ?, ?, ?)`,
        [orgId, periods[0].id, cashBankId, 0, paymentAmount, Number(id), `Payment for purchase invoice ${inv.invoice_number}`, userId]
      );
    } else {
      const cashBankId = conceptToAccount.get('cash_bank');
      const receivableId = conceptToAccount.get('receivable');
      if (!cashBankId || !receivableId) {
        throw new AppError('Missing required account mapping for invoice_payment', 500, 'CONFIG_ERROR');
      }
      await conn.execute(
        `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
         VALUES (?, ?, ?, CURDATE(), ?, ?, 0, 'invoice_payment', ?, ?, ?)`,
        [orgId, periods[0].id, cashBankId, paymentAmount, 0, Number(id), `Payment for invoice ${inv.invoice_number}`, userId]
      );
      await conn.execute(
        `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
         VALUES (?, ?, ?, CURDATE(), ?, ?, 0, 'invoice_payment', ?, ?, ?)`,
        [orgId, periods[0].id, receivableId, 0, paymentAmount, Number(id), `Payment for invoice ${inv.invoice_number}`, userId]
      );
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

    if (eventType === 'purchase_invoice_cancel') {
      const payableId = conceptToAccount.get('accounts_payable');
      const expenseId = conceptToAccount.get('expense');
      if (!payableId || !expenseId) {
        throw new AppError('Missing required account mapping for purchase_invoice_cancel', 500, 'CONFIG_ERROR');
      }
      await conn.execute(
        `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
         VALUES (?, ?, ?, CURDATE(), ?, ?, 0, 'invoice_cancel', ?, ?, ?)`,
        [orgId, periods[0].id, payableId, Number(inv.total), 0, Number(id), `Reversal - cancelled purchase invoice ${inv.invoice_number}`, userId]
      );
      await conn.execute(
        `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
         VALUES (?, ?, ?, CURDATE(), ?, ?, 0, 'invoice_cancel', ?, ?, ?)`,
        [orgId, periods[0].id, expenseId, 0, Number(inv.total), Number(id), `Reversal - cancelled purchase invoice ${inv.invoice_number}`, userId]
      );
    } else {
      const revenueId = conceptToAccount.get('revenue');
      const receivableId = conceptToAccount.get('receivable');
      if (!revenueId || !receivableId) {
        throw new AppError('Missing required account mapping for invoice_cancel', 500, 'CONFIG_ERROR');
      }
      await conn.execute(
        `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
         VALUES (?, ?, ?, CURDATE(), ?, ?, 0, 'invoice_cancel', ?, ?, ?)`,
        [orgId, periods[0].id, receivableId, 0, Number(inv.total), Number(id), `Reversal - cancelled invoice ${inv.invoice_number}`, userId]
      );
      await conn.execute(
        `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
         VALUES (?, ?, ?, CURDATE(), ?, ?, 0, 'invoice_cancel', ?, ?, ?)`,
        [orgId, periods[0].id, revenueId, Number(inv.total), 0, Number(id), `Reversal - cancelled invoice ${inv.invoice_number}`, userId]
      );
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
