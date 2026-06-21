import mysql from 'mysql2/promise';

import { env } from '../config/env.js';

let pool: mysql.Pool;

export function createPool(overrides?: {
  host?: string; port?: number; user?: string; password?: string; database?: string;
}): mysql.Pool {
  pool = mysql.createPool({
    host: overrides?.host || env.DB_HOST,
    port: overrides?.port || Number(env.DB_PORT),
    user: overrides?.user || env.DB_USER,
    password: overrides?.password || env.DB_PASSWORD,
    database: overrides?.database || env.DB_NAME,
    connectionLimit: 10,
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

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    (pool as any) = undefined;
  }
}