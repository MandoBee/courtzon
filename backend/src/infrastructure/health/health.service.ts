import { getPool } from '../../database/mysql.js';
import { getRedisClient } from '../redis/redis.client.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { freemem, totalmem, uptime } from 'node:os';

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
