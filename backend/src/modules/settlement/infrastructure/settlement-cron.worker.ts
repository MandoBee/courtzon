import { getPool } from '../../../database/mysql.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import type mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

const log = createModuleLogger('settlement-cron');

export async function handleRunSettlements(_payload: any): Promise<void> {
  // Settlement is now manual-request only (Super Admin, Org Admin, Shop Admin).
  // This cron worker is deprecated — the new settlement module does not support
  // automatic settlement runs. The old runSettlement() was removed in settlement V2.
  log.info('[settlement-cron] Automatic settlement is disabled. Settlements must be requested manually.');
}
