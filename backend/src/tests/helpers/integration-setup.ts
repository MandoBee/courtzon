import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { closePool } from '../../database/mysql.js';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface TestContext {
  mysqlPort: number;
  redisPort: number;
}

/** Apply container ports to process.env (call before dynamic import of app/services). */
export function applyTestProcessEnv(ctx: TestContext): void {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = String(ctx.mysqlPort);
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = 'test';
  process.env.DB_NAME = 'courtzon_test';
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = String(ctx.redisPort);
  process.env.REDIS_DB = '0';
  process.env.PORT = '3001';
  process.env.ENABLE_API_DOCS = 'false';
}

let containers: StartedTestContainer[] = [];

export async function startContainers(): Promise<TestContext> {
  const mysql = await new GenericContainer('mysql:8.0')
    .withEnvironment({
      MYSQL_ROOT_PASSWORD: 'test',
      MYSQL_DATABASE: 'courtzon_test',
    })
    .withExposedPorts(3306)
    .withWaitStrategy(Wait.forLogMessage('port: 3306  MySQL Community Server'))
    .start();

  const redis = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
    .start();

  containers = [mysql, redis];
  return {
    mysqlPort: mysql.getMappedPort(3306),
    redisPort: redis.getMappedPort(6379),
  };
}

/** Apply full schema + core seed via the same migrate script used in dev/CI. */
export async function runSchema(mysqlPort: number): Promise<void> {
  const projectRoot = resolve(__dirname, '../../../../');
  const migrateScript = resolve(projectRoot, 'backend/scripts/migrate.js');

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [migrateScript, '--fresh', '--seed'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        INTEGRATION_TEST: '1',
        DB_HOST: '127.0.0.1',
        DB_PORT: String(mysqlPort),
        DB_USER: 'root',
        DB_PASSWORD: 'test',
        DB_NAME: 'courtzon_test',
      },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`migrate.js exited with code ${code}`));
    });
  });
}

export async function stopContainers(): Promise<void> {
  await closePool();
  for (const c of containers) {
    try { await c.stop(); } catch { /* ignore */ }
  }
  containers = [];
}
