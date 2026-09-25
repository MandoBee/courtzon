import { AsyncLocalStorage } from 'async_hooks';
import { PoolConnection } from 'mysql2/promise';

import { acquireConnection } from './mysql.js';

const transactionAls = new AsyncLocalStorage<boolean>();

export function isInTransaction(): boolean {
  return transactionAls.getStore() === true;
}

// ── After-commit hooks ─────────────────────────────────────────────────
// Collects callbacks during a transaction and runs them after commit.
// Hooks are discarded on rollback. Never shared between transactions.
const afterCommitHooks: Array<() => Promise<void>> = [];

export function onAfterCommit(hook: () => Promise<void>): void {
  afterCommitHooks.push(hook);
}

/**
 * Flush all pending after-commit hooks.
 * Use after a manual conn.commit() when NOT using withTransaction().
 */
export async function flushAfterCommitHooks(): Promise<void> {
  const hooks = afterCommitHooks.splice(0);
  for (const hook of hooks) {
    await hook().catch((err) => {
      console.error('after-commit hook failed (flush)', err);
    });
  }
}

export async function withTransaction<T>(
  callback: (
    connection: PoolConnection,
  ) => Promise<T>,
): Promise<T> {
  const connection = await acquireConnection();

  const hookCount = afterCommitHooks.length;

  try {
    await connection.beginTransaction();

    const result = await transactionAls.run(true, () =>
      callback(connection),
    );

    await connection.commit();

    // Run hooks collected during this transaction
    const hooks = afterCommitHooks.splice(hookCount);
    for (const hook of hooks) {
      await hook().catch((err) => {
        console.error('after-commit hook failed', err);
      });
    }

    return result;
  } catch (error) {
    // Discard hooks collected during this failed transaction
    afterCommitHooks.splice(hookCount);
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Group 6 — transaction-safe publishing for MANUALLY acquired connections.
 *
 * Controllers/services that manage their own `PoolConnection` (instead of
 * `withTransaction`) previously escaped the AsyncLocalStorage transaction
 * context, so `EventBusV2` delivered in-memory handlers (SocketPublisher +
 * Notification Engine) BEFORE `conn.commit()`. If the transaction later rolled
 * back, clients received a phantom realtime event.
 *
 * This wrapper runs the callback inside the transaction context, commits the
 * provided connection, then flushes ONLY the after-commit hooks registered by
 * this transaction. On rollback the hooks are discarded, so nothing is ever
 * delivered for a failed transaction. Connection lifecycle (acquire/release)
 * remains the caller's responsibility.
 */
export async function runProvidedTransaction<T>(
  connection: PoolConnection,
  callback: () => Promise<T>,
): Promise<T> {
  await connection.beginTransaction();
  const hookCount = afterCommitHooks.length;

  try {
    const result = await transactionAls.run(true, () =>
      callback(),
    );

    await connection.commit();

    const hooks = afterCommitHooks.splice(hookCount);
    for (const hook of hooks) {
      await hook().catch((err) => {
        console.error('after-commit hook failed (runProvidedTransaction)', err);
      });
    }

    return result;
  } catch (error) {
    // A failed transaction must NEVER publish its buffered domain events.
    afterCommitHooks.splice(hookCount);
    await connection.rollback();

    throw error;
  }
}