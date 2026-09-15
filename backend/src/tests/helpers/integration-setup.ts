import { GenericContainer, Wait, StartedTestContainer } from 'testcontainers';
import { closePool } from '../../database/mysql.js';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

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
  // mysql_native_password keeps the test server compatible with BOTH the app's
  // mysql2 driver and any system `mysql` client the harness's baseline/seed
  // steps may invoke (MariaDB clients cannot load MySQL 8.0's default
  // caching_sha2_password plugin). Test-only — no production impact.
  const mysql = await new GenericContainer('mysql:8.0')
    .withEnvironment({
      MYSQL_ROOT_PASSWORD: 'test',
      MYSQL_DATABASE: 'courtzon_test',
    })
    .withCommand(['--default-authentication-plugin=mysql_native_password'])
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

/**
 * A single schema-setup command. `expectFail` marks tolerated steps (the
 * baseline import emits a non-fatal "table already exists" warning in its
 * appended section — the Docker entrypoint imports it the same way without
 * failing the container).
 */
export interface SchemaSetupStep {
  cmd: string;
  args: string[];
  input?: string;
  expectFail?: boolean;
}

/**
 * Build the exact command sequence that initializes a FRESH integration schema:
 *   1. drop + recreate the test database,
 *   2. import the authoritative baseline schema (`mysql --force`, residual
 *      duplicate-table warnings tolerated — mirrors the Docker entrypoint),
 *   3. apply the fresh-compatible canonical seed files in order via the
 *      repository's seed mechanism (`node backend/scripts/seed.js --seed-file`).
 *
 * Seed scope: 001 (reference data — the Docker entrypoint's fresh seed), 002
 * (academy programs) and 003 (player profile extras) apply cleanly to a fresh
 * baseline and are included. The accounting seeds 004-006 are intentionally
 * NOT applied: 004's single multi-row `chart_of_accounts` insert relies on a
 * self-referential FK to auto-increment ids generated within the same statement
 * (a MySQL limitation) and cannot be applied to a fresh empty table; the Docker
 * entrypoint likewise does not apply them on a fresh database (accounting
 * reference data is installed on populated environments via
 * `node backend/scripts/seed.js --seed-file <file>`).
 *
 * Exported pure for a focused harness regression test. This deliberately does
 * NOT invoke `migrate.js --fresh --seed`: migrate.sh does not support `--seed`,
 * and `migrate.js --fresh` treats the baseline's non-fatal duplicate-table
 * warning as a fatal baseline failure.
 */
export function buildSchemaSetupCommands(
  mysqlPort: number,
  opts: { mysqlBin?: string; projectRoot?: string } = {},
): SchemaSetupStep[] {
  const root = opts.projectRoot ?? resolve(__dirname, '../../../../');
  const mysqlBin = opts.mysqlBin ?? process.env.MYSQL_BIN ?? 'mysql';
  const baseline = resolve(root, 'database/baseline/001_courtzon_v3.sql');
  const seedScript = resolve(root, 'backend/scripts/seed.js');
  const hostArgs = ['-h127.0.0.1', `-P${mysqlPort}`, '-uroot', '-ptest'];

  const freshSeedFiles = ['001_baseline.sql', '002_academy_programs.sql', '003_player_demo.sql'];

  return [
    {
      cmd: mysqlBin,
      args: [...hostArgs, '-e', 'DROP DATABASE IF EXISTS courtzon_test; CREATE DATABASE courtzon_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'],
    },
    {
      cmd: mysqlBin,
      args: [...hostArgs, '--force', 'courtzon_test'],
      input: readFileSync(baseline, 'utf8'),
      expectFail: true,
    },
    ...freshSeedFiles.map((file) => ({
      cmd: process.execPath,
      args: [seedScript, '--seed-file', file],
    })),
  ];
}

function runStep(step: SchemaSetupStep, opts: { cwd: string; env: NodeJS.ProcessEnv }): Promise<number | null> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(step.cmd, step.args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: step.input !== undefined ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    });
    if (step.input !== undefined) child.stdin?.end(step.input);
    child.on('error', reject);
    child.on('exit', (code) => {
      if (step.expectFail) {
        if (code !== 0) console.warn(`[integration-setup] ${step.cmd} exited ${code} (tolerated: baseline residual warnings)`);
        resolvePromise(code);
        return;
      }
      if (code === 0) resolvePromise(code);
      else reject(new Error(`${step.cmd} exited with code ${code}`));
    });
  });
}

/** Apply full schema + required seed via the same commands the CI/entrypoint use. */
export async function runSchema(mysqlPort: number): Promise<void> {
  const projectRoot = resolve(__dirname, '../../../../');
  const env = {
    ...process.env,
    INTEGRATION_TEST: '1',
    DB_HOST: '127.0.0.1',
    DB_PORT: String(mysqlPort),
    DB_USER: 'root',
    DB_PASSWORD: 'test',
    DB_NAME: 'courtzon_test',
  };

  for (const step of buildSchemaSetupCommands(mysqlPort, { projectRoot })) {
    await runStep(step, { cwd: projectRoot, env });
  }
}

export async function stopContainers(): Promise<void> {
  await closePool();
  for (const c of containers) {
    try { await c.stop(); } catch { /* ignore */ }
  }
  containers = [];
}
