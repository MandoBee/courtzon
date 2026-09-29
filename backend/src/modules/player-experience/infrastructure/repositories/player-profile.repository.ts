import { getPool } from '../../../../database/mysql.js';
import type { PoolConnection } from 'mysql2/promise';

type RowData = import('mysql2').RowDataPacket[];

export interface PlayerBankPayoutDetails {
  bankAccountHolder: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  iban: string | null;
}

/**
 * G11.6 — Player bank payout details persistence (player_profiles, user-scoped).
 * Plaintext storage per the repo's established convention (mirrors the org
 * branch_financial_details pattern); zod-validated at the API layer.
 */
export const playerProfileRepository = {
  async findBankPayoutDetails(userId: number, conn?: PoolConnection): Promise<PlayerBankPayoutDetails | null> {
    const db = conn ?? getPool();
    const [rows] = await db.execute<RowData>(
      `SELECT bank_account_holder, bank_account_number, bank_name, iban
       FROM player_profiles WHERE user_id = ? LIMIT 1`, [userId],
    );
    const r = (rows as any[])[0];
    if (!r) return null;
    return {
      bankAccountHolder: r.bank_account_holder ?? null,
      bankAccountNumber: r.bank_account_number ?? null,
      bankName: r.bank_name ?? null,
      iban: r.iban ?? null,
    };
  },

  async upsertBankPayoutDetails(
    userId: number,
    details: { bankAccountHolder: string; bankAccountNumber: string; bankName: string; iban?: string | null },
    conn?: PoolConnection,
  ): Promise<void> {
    const db = conn ?? getPool();
    await db.execute(
      `INSERT INTO player_profiles (user_id, bank_account_holder, bank_account_number, bank_name, iban, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         bank_account_holder = VALUES(bank_account_holder),
         bank_account_number = VALUES(bank_account_number),
         bank_name = VALUES(bank_name),
         iban = VALUES(iban),
         updated_at = NOW()`,
      [userId, details.bankAccountHolder, details.bankAccountNumber, details.bankName, details.iban ?? null],
    );
  },
};