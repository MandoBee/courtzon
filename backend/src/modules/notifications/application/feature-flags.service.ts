import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('feature-flags');

const flagCache = new Map<string, boolean>();
let cacheLoaded = false;

export async function loadFeatureFlags(): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT flag_key, is_enabled FROM notification_feature_flags',
  );
  flagCache.clear();
  for (const row of rows as any[]) {
    flagCache.set(row.flag_key, row.is_enabled === 1);
  }
  cacheLoaded = true;
}

export async function isFeatureEnabled(flagKey: string): Promise<boolean> {
  if (!cacheLoaded) await loadFeatureFlags();
  return flagCache.get(flagKey) ?? false;
}

export async function getAllFeatureFlags(): Promise<Record<string, boolean>> {
  if (!cacheLoaded) await loadFeatureFlags();
  return Object.fromEntries(flagCache);
}

export async function setFeatureFlag(flagKey: string, enabled: boolean): Promise<void> {
  const pool = getPool();
  await pool.execute(
    `INSERT INTO notification_feature_flags (flag_key, label, is_enabled)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled)`,
    [flagKey, flagKey, enabled ? 1 : 0],
  );
  flagCache.set(flagKey, enabled);
  log.info({ flagKey, enabled }, 'Feature flag updated');
}
