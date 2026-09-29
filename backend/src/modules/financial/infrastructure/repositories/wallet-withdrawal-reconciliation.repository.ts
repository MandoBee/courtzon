import { getPool } from '../../../../database/mysql.js';

type RowData = import('mysql2').RowDataPacket[];

const round2 = (n: number) => Math.round((Number(n ?? 0) + Number.EPSILON) * 100) / 100;

/**
 * G11.6 — READ-ONLY data access for the wallet/withdrawal reconciliation report.
 * Pure SELECTs only; this repository must never mutate its sources.
 */
export const walletWithdrawalReconciliationRepository = {
  async walletTotals(): Promise<{ balance: number; reserved: number }> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(balance), 0) AS balance, COALESCE(SUM(reserved_balance), 0) AS reserved FROM user_wallets`,
    );
    const r = (rows as any[])[0];
    return { balance: round2(r?.balance ?? 0), reserved: round2(r?.reserved ?? 0) };
  },

  async requestTotals(): Promise<{ activeReserved: number; completed: number; total: number }> {
    const pool = getPool();
    const [active] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(amount), 0) AS v FROM withdrawal_requests
       WHERE status IN ('pending','under_review','approved','processing')`,
    );
    const [completed] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(amount), 0) AS v FROM withdrawal_requests WHERE status = 'completed'`,
    );
    const [total] = await pool.execute<RowData>(`SELECT COALESCE(SUM(amount), 0) AS v FROM withdrawal_requests`);
    return {
      activeReserved: round2((active as any[])[0]?.v ?? 0),
      completed: round2((completed as any[])[0]?.v ?? 0),
      total: round2((total as any[])[0]?.v ?? 0),
    };
  },

  async debitHistoryTotal(): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(amount), 0) AS v FROM wallet_transactions
       WHERE transaction_type = 'withdrawal' AND direction = 'debit'`,
    );
    return round2((rows as any[])[0]?.v ?? 0);
  },

  async accountIdByCode(code: string): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code = ? LIMIT 1`, [code],
    );
    return Number((rows as any[])[0]?.id ?? 0);
  },

  /** Signed side totals of a chart account (credit−debit), CourtZon book (org NULL, global account). */
  async glSides(accountId: number): Promise<{ credit: number; debit: number; net: number }> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT
         COALESCE(SUM(CASE WHEN le.side='credit' THEN le.amount ELSE 0 END), 0) AS credit,
         COALESCE(SUM(CASE WHEN le.side='debit' THEN le.amount ELSE 0 END), 0) AS debit
       FROM ledger_entries le WHERE le.chart_account_id = ?`, [accountId],
    );
    const r = (rows as any[])[0];
    const credit = round2(r?.credit ?? 0);
    const debit = round2(r?.debit ?? 0);
    return { credit, debit, net: round2(credit - debit) };
  },
};