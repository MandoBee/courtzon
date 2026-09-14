import mysql from 'mysql2/promise';

import { env } from '../config/env.js';

let pool: mysql.Pool;

const DEFAULT_ACQUIRE_TIMEOUT_MS = 10000;

export function createPool(overrides?: {
  host?: string; port?: number; user?: string; password?: string; database?: string;
  connectionLimit?: number;
}): mysql.Pool {
  pool = mysql.createPool({
    host: overrides?.host || env.DB_HOST,
    port: overrides?.port || Number(env.DB_PORT),
    user: overrides?.user || env.DB_USER,
    password: overrides?.password || env.DB_PASSWORD,
    database: overrides?.database || env.DB_NAME,
    connectionLimit: overrides?.connectionLimit ?? 10,
    charset: 'utf8mb4',
    timezone: '+00:00',
  });
  return pool;
}

export function getPool(): mysql.Pool {
  if (!pool) {
    return createPool();
  }
  return pool;
}

export async function acquireConnection(
  target: mysql.Pool = getPool(),
  timeoutMs: number = DEFAULT_ACQUIRE_TIMEOUT_MS,
): Promise<mysql.PoolConnection> {
  return new Promise<mysql.PoolConnection>((resolve, reject) => {
    const inner = target.getConnection();
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Database pool acquire timeout after ${timeoutMs}ms (connectionLimit=${target.config.connectionLimit})`));
    }, timeoutMs);

    inner.then((conn) => {
      if (settled) {
        conn.release();
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(conn);
    }).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    (pool as any) = undefined;
  }
}