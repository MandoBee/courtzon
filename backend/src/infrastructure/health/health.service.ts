import { getPool } from '../../database/mysql.js';
import { getRedisClient } from '../redis/redis.client.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { freemem, totalmem } from 'node:os';
import { accessSync, constants } from 'node:fs';
import { join } from 'node:path';

const log = createModuleLogger('health');
const startTime = Date.now();

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  service: string;
  uptime: number;
  timestamp: string;
  checks: {
    database: { status: string; latencyMs?: number; error?: string };
    redis: { status: string; latencyMs?: number; error?: string };
    memory: { status: string; usagePercent: number; freeMb: number; totalMb: number };
  };
}

async function checkDatabase(): Promise<{ status: string; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>('SELECT 1 AS ok');
    if (rows?.[0]?.ok !== 1) return { status: 'error', error: 'Unexpected response', latencyMs: Date.now() - start };
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err: any) {
    return { status: 'down', error: err.message, latencyMs: Date.now() - start };
  }
}

async function checkRedis(): Promise<{ status: string; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    const redis = getRedisClient();
    const result = await redis.ping();
    if (result !== 'PONG') return { status: 'error', error: 'Unexpected response', latencyMs: Date.now() - start };
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err: any) {
    return { status: 'down', error: err.message, latencyMs: Date.now() - start };
  }
}

function checkMemory(): { status: string; usagePercent: number; freeMb: number; totalMb: number } {
  const free = freemem();
  const total = totalmem();
  const usagePercent = ((total - free) / total) * 100;
  return {
    status: usagePercent > 90 ? 'warning' : 'ok',
    usagePercent: Math.round(usagePercent * 100) / 100,
    freeMb: Math.round(free / 1024 / 1024),
    totalMb: Math.round(total / 1024 / 1024),
  };
}

export async function getHealth(): Promise<HealthStatus> {
  const [db, redis, memory] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    Promise.resolve(checkMemory()),
  ]);

  const allOk = db.status === 'ok' && redis.status === 'ok';
  const anyDown = db.status === 'down' || redis.status === 'down';

  return {
    status: anyDown ? 'down' : allOk ? 'ok' : 'degraded',
    service: 'courtzon-v2-backend',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks: { database: db, redis, memory },
  };
}

export async function healthDatabase(): Promise<{
  status: string; database: string; tables: number; latencyMs?: number; error?: string;
}> {
  const start = Date.now();
  try {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>('SELECT 1 AS ok');
    if (rows?.[0]?.ok !== 1) {
      return { status: 'error', database: 'disconnected', tables: 0, latencyMs: Date.now() - start, error: 'Unexpected response' };
    }
    const [tables] = await pool.execute<any[]>('SHOW TABLES');
    const dbName = process.env.DB_NAME || 'courtzon_v3';
    return { status: 'ok', database: 'connected', tables: tables.length, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { status: 'down', database: 'disconnected', tables: 0, latencyMs: Date.now() - start, error: err.message };
  }
}

export async function healthRedis(): Promise<{
  status: string; connected: boolean; latencyMs?: number; error?: string;
}> {
  const start = Date.now();
  try {
    const redis = getRedisClient();
    const result = await redis.ping();
    if (result !== 'PONG') return { status: 'error', connected: false, latencyMs: Date.now() - start, error: 'Unexpected response' };
    return { status: 'ok', connected: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { status: 'down', connected: false, latencyMs: Date.now() - start, error: err.message };
  }
}

export async function healthStorage(): Promise<{
  status: string; uploadDir: string; writable: boolean; freeDiskMb: number; error?: string;
}> {
  try {
    const uploadDir = join(import.meta.dirname, '..', '..', '..', 'uploads');
    accessSync(uploadDir, constants.F_OK);
    let writable = true;
    try {
      accessSync(uploadDir, constants.W_OK);
    } catch {
      writable = false;
    }
    const freeMemMb = Math.round(freemem() / 1024 / 1024);
    return {
      status: writable ? 'ok' : 'degraded',
      uploadDir,
      writable,
      freeDiskMb: freeMemMb,
    };
  } catch (err: any) {
    return {
      status: 'down',
      uploadDir: '',
      writable: false,
      freeDiskMb: 0,
      error: err.message,
    };
  }
}
