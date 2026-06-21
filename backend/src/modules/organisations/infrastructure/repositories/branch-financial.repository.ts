import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export const branchFinancialRepository = {
  async getByBranchId(branchId: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT * FROM branch_financial_details WHERE branch_id = ?`,
      [branchId],
    );
    return rows[0] || null;
  },

  async upsert(branchId: number, data: {
    bankId?: number | null;
    bankBranchId?: number | null;
    bankName?: string | null;
    bankAccountName?: string | null;
    bankAccountNumber?: string | null;
    iban?: string | null;
    swift?: string | null;
    billingAddress?: string | null;
    billingEmail?: string | null;
    payoutSchedule?: string | null;
    currencyId?: number | null;
  }) {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO branch_financial_details
       (branch_id, bank_id, bank_branch_id, bank_name, bank_account_name, bank_account_number, iban, swift,
        billing_address, billing_email, payout_schedule, currency_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        bank_id = VALUES(bank_id), bank_branch_id = VALUES(bank_branch_id),
        bank_name = VALUES(bank_name), bank_account_name = VALUES(bank_account_name),
        bank_account_number = VALUES(bank_account_number), iban = VALUES(iban),
        swift = VALUES(swift), billing_address = VALUES(billing_address),
        billing_email = VALUES(billing_email), payout_schedule = VALUES(payout_schedule),
        currency_id = VALUES(currency_id)`,
      [
        branchId,
        data.bankId ?? null,
        data.bankBranchId ?? null,
        data.bankName ?? null,
        data.bankAccountName ?? null,
        data.bankAccountNumber ?? null,
        data.iban ?? null,
        data.swift ?? null,
        data.billingAddress ?? null,
        data.billingEmail ?? null,
        data.payoutSchedule ?? 'monthly',
        data.currencyId ?? null,
      ],
    );
  },

  async findMainBranchIdForOrg(orgId: number): Promise<number | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT id FROM branches WHERE organisation_id = ? AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`,
      [orgId],
    );
    return rows.length ? rows[0].id : null;
  },
};
