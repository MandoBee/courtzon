import { AsyncLocalStorage } from 'async_hooks';
import { PoolConnection } from 'mysql2/promise';

import { getPool } from './mysql.js';

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
  const connection =
    await getPool().getConnection();

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