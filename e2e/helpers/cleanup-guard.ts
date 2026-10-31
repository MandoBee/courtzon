/**
 * Test-database safety gates for the E2E suite.
 *
 * User-directed strategy (2026-10-26): testing uses the existing local
 * `courtzon_v3` database only. Its data is disposable test data but is cleared
 * only in a separate, explicitly authorized final cleanup AFTER the full
 * testing campaign. No additional database or test environment may be created.
 *
 * Safety is therefore enforced by:
 *  1. An exact target check (database name + loopback host + local port) before
 *     any test connection is opened, so writes cannot drift to another MySQL
 *     instance or database.
 *  2. A deliberate destructive-cleanup authorization (fixed confirmation token
 *     + non-empty campaign id + exact database match) checked before cleanup
 *     can connect or run SQL.
 *
 * This module intentionally has no runtime imports so both gates can be tested
 * without a database driver, network, or environment configuration.
 */

/** The only local test database permitted for E2E/integration writes. */
export const APPROVED_TEST_DATABASE = 'courtzon_v3';

/** Loopback hosts only — prevents accidental remote/production targeting. */
export const APPROVED_TEST_HOSTS = ['127.0.0.1', 'localhost', '::1'] as const;

/** Local Docker MySQL published port (XAMPP/other instances use 3306). */
export const APPROVED_TEST_PORT = 3307;

/**
 * Fixed confirmation token for the single, deferred final cleanup.
 * This is not a boolean and cannot be produced by an accidental default.
 */
export const DESTRUCTIVE_CLEANUP_CONFIRMATION = 'COURTZON_V3_FINAL_TEST_CLEANUP_APPROVED';

export interface TestDatabaseTarget {
  host: string;
  port: number;
  database: string;
}

export interface DestructiveCleanupAuthorization {
  /** Must match the database the connection actually targets. */
  database: typeof APPROVED_TEST_DATABASE;
  /** Non-empty campaign/run identifier for the audit trail. */
  campaign: string;
  /** Must equal DESTRUCTIVE_CLEANUP_CONFIRMATION. */
  confirmation: typeof DESTRUCTIVE_CLEANUP_CONFIRMATION;
}

export interface CleanupQueryable {
  query(sql: string): Promise<unknown>;
}

const VALID_DATABASE_NAME = /^[A-Za-z0-9_]+$/;

function normalize(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isLoopbackHost(host: string): boolean {
  return (APPROVED_TEST_HOSTS as readonly string[]).includes(host);
}

/** Pure name check: is this the approved local test database? */
export function isApprovedTestDatabase(databaseName: string | null | undefined): boolean {
  return normalize(databaseName) === APPROVED_TEST_DATABASE;
}

/**
 * Fail-closed target validation used before any test connection is opened.
 * Rejects wrong/missing database names, non-loopback hosts, and non-3307 ports.
 */
export function assertApprovedTestTarget(target: TestDatabaseTarget): void {
  const database = normalize(target.database);
  const host = normalize(target.host);
  const port = Number(target.port);

  if (!database) {
    throw new Error('Test DB target refused: database name is missing.');
  }
  if (!VALID_DATABASE_NAME.test(database)) {
    throw new Error(`Test DB target refused: invalid database name "${database}".`);
  }
  if (database !== APPROVED_TEST_DATABASE) {
    throw new Error(
      `Test DB target refused: "${database}" is not the approved local test database ` +
        `(${APPROVED_TEST_DATABASE}).`,
    );
  }
  if (!isLoopbackHost(host)) {
    throw new Error(`Test DB target refused: "${host || '(missing)'}" is not a loopback host.`);
  }
  if (!Number.isInteger(port) || port !== APPROVED_TEST_PORT) {
    throw new Error(
      `Test DB target refused: port ${target.port} is not the local test port ${APPROVED_TEST_PORT}.`,
    );
  }
}

/** Pure predicate wrapper around {@link assertApprovedTestTarget}. */
export function isApprovedTestTarget(target: TestDatabaseTarget): boolean {
  try {
    assertApprovedTestTarget(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Requires an explicit, deliberate authorization for destructive cleanup.
 * Checked before a cleanup connection is opened or any destructive SQL runs.
 */
export function assertDestructiveCleanupAuthorized(
  databaseName: string | null | undefined,
  authorization: DestructiveCleanupAuthorization | null | undefined,
): asserts authorization is DestructiveCleanupAuthorization {
  const database = normalize(databaseName);

  if (database !== APPROVED_TEST_DATABASE) {
    throw new Error(
      `E2E cleanup refused: "${database || '(missing)'}" is not the approved test database ` +
        `(${APPROVED_TEST_DATABASE}).`,
    );
  }
  if (!authorization) {
    throw new Error(
      'E2E cleanup refused: explicit destructive-cleanup authorization is required ' +
        '(confirmation token + campaign id). Cleanup is deferred until the end of the campaign.',
    );
  }
  if (authorization.confirmation !== DESTRUCTIVE_CLEANUP_CONFIRMATION) {
    throw new Error('E2E cleanup refused: invalid destructive-cleanup confirmation token.');
  }
  if (normalize(authorization.database) !== database) {
    throw new Error(
      `E2E cleanup refused: authorization targets "${authorization.database}" but the ` +
        `connection targets "${database}".`,
    );
  }
  if (typeof authorization.campaign !== 'string' || !authorization.campaign.trim()) {
    throw new Error('E2E cleanup refused: a non-empty campaign identifier is required.');
  }
}

/** Pure predicate wrapper around {@link assertDestructiveCleanupAuthorized}. */
export function isDestructiveCleanupAuthorized(
  databaseName: string | null | undefined,
  authorization: DestructiveCleanupAuthorization | null | undefined,
): boolean {
  try {
    assertDestructiveCleanupAuthorized(databaseName, authorization);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs the destructive cleanup only after BOTH the target database name and the
 * explicit authorization are verified — before `connect()` is called.
 */
export async function runSafeCleanup(
  databaseName: string | null | undefined,
  authorization: DestructiveCleanupAuthorization | null | undefined,
  connect: () => Promise<CleanupQueryable>,
  tables: readonly string[],
): Promise<void> {
  assertDestructiveCleanupAuthorized(databaseName, authorization);

  const conn = await connect();
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of tables) {
    try {
      await conn.query(`TRUNCATE TABLE \`${table}\``);
    } catch {
      // table may not exist in some environments
    }
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
}
