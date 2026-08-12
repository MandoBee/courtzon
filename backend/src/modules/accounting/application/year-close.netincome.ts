import type { RowDataPacket } from 'mysql2';
import { getPool } from '../../../database/mysql.js';

type RowData = RowDataPacket[];

export interface FiscalYearBalance {
  accountId: number; code: string; name: string;
  type: string; normalSide: string; balance: number;
  totalDebits: number; totalCredits: number;
}

export interface NetIncomeResult {
  totalRevenue: number; totalContraRevenue: number;
  totalExpense: number; totalContraExpense: number;
  netRevenue: number; netExpense: number; netIncome: number;
  accounts: FiscalYearBalance[];
}

export async function calculateFiscalYearNetIncome(
  fiscalYear: number,
  organisationId: number | null,
): Promise<NetIncomeResult> {
  const pool = getPool();
  const fyStart = `${fiscalYear}-01-01`;
  const fyEnd = `${fiscalYear}-12-31`;

  const coaWhere = organisationId != null
    ? '(coa.organisation_id IS NULL OR coa.organisation_id = ?)'
    : 'coa.organisation_id IS NULL';

  const params: any[] = [fyStart, fyEnd];
  if (organisationId != null) {
    params.push(organisationId);   // for gl.organisation_id = ?
    params.push(organisationId);   // for coa.organisation_id = ?
  }

  const [rows] = await pool.execute<RowData>(
    `SELECT coa.id AS accountId, coa.code, coa.name, coa.type, coa.normal_side AS normalSide,
            COALESCE(SUM(gl.debit), 0) AS totalDebits, COALESCE(SUM(gl.credit), 0) AS totalCredits
     FROM chart_of_accounts coa
     LEFT JOIN general_ledger gl ON gl.account_id = coa.id
       AND gl.entry_date >= ? AND gl.entry_date <= ?
       ${organisationId != null ? 'AND gl.organisation_id = ?' : ''}
     WHERE coa.type IN ('revenue','contra_revenue','expense','contra_expense')
       AND coa.is_active = 1
       AND ${coaWhere}
     GROUP BY coa.id, coa.code, coa.name, coa.type, coa.normal_side
     ORDER BY coa.type, coa.code`,
    params,
  );

  const accounts: FiscalYearBalance[] = [];
  let totalRevenue = 0, totalContraRevenue = 0, totalExpense = 0, totalContraExpense = 0;

  for (const r of rows as any[]) {
    const debits = Number(r.totalDebits);
    const credits = Number(r.totalCredits);
    const normalSide = r.normalSide || 'debit';
    const balance = normalSide === 'credit' ? credits - debits : debits - credits;

    accounts.push({
      accountId: r.accountId, code: r.code, name: r.name,
      type: r.type, normalSide, totalDebits: debits, totalCredits: credits, balance,
    });

    if (r.type === 'revenue') totalRevenue += balance;
    else if (r.type === 'contra_revenue') totalContraRevenue += balance;
    else if (r.type === 'expense') totalExpense += balance;
    else if (r.type === 'contra_expense') totalContraExpense += balance;
  }

  const netRevenue = totalRevenue - totalContraRevenue;
  const netExpense = totalExpense - totalContraExpense;
  const rnd = (n: number) => Math.round(n * 100) / 100;

  return {
    totalRevenue: rnd(totalRevenue), totalContraRevenue: rnd(totalContraRevenue),
    totalExpense: rnd(totalExpense), totalContraExpense: rnd(totalContraExpense),
    netRevenue: rnd(netRevenue), netExpense: rnd(netExpense), netIncome: rnd(netRevenue - netExpense),
    accounts: accounts.filter(a => Math.abs(a.balance) > 0.001),
  };
}
