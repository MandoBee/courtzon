import { AsyncLocalStorage } from 'async_hooks';
import { PoolConnection } from 'mysql2/promise';

import { acquireConnection } from './mysql.js';

/**
 * Per-async-context transaction state. Hooks MUST live in the ALS store, never in
 * a module-global array: with overlapping transactions (two requests), a global
 * array let one transaction's commit flush — and publish — another transaction's
 * buffered events, including events from a transaction that later rolled back.
 */
interface TransactionContext {
  inTransaction: boolean;
  hooks: Array<() => Promise<void>>;
}

const transactionAls = new AsyncLocalStorage<TransactionContext>();

export function isInTransaction(): boolean {
  return transactionAls.getStore()?.inTransaction === true;
}

/**
 * Register a hook to run after the current transaction commits.
 *
 * - inside a transaction: buffered in that transaction's own ALS context and
 *   discarded on rollback;
 * - outside a transaction: executed immediately (there is nothing to wait for,
 *   and a global deferred queue would never be flushed).
 */
export function onAfterCommit(hook: () => Promise<void>): void {
  const store = transactionAls.getStore();
  if (store?.inTransaction) {
    store.hooks.push(hook);
    return;
  }
  void hook().catch((err) => {
    console.error('after-commit hook failed (no transaction)', err);
  });
}

async function runHooks(hooks: Array<() => Promise<void>>, label: string): Promise<void> {
  for (const hook of hooks) {
    await hook().catch((err) => {
      console.error(`after-commit hook failed (${label})`, err);
    });
  }
}

/**
 * Flush pending hooks of the CURRENT transaction context (legacy helper).
 * Outside a transaction there is nothing to flush.
 */
export async function flushAfterCommitHooks(): Promise<void> {
  const store = transactionAls.getStore();
  if (!store?.hooks.length) return;
  const hooks = store.hooks.splice(0);
  await runHooks(hooks, 'flush');
}

export async function withTransaction<T>(
  callback: (
    connection: PoolConnection,
  ) => Promise<T>,
): Promise<T> {
  const connection = await acquireConnection();
  const context: TransactionContext = { inTransaction: true, hooks: [] };

  try {
    await connection.beginTransaction();

    const result = await transactionAls.run(context, () =>
      callback(connection),
    );

    await connection.commit();

    // Run ONLY this transaction's hooks.
    const hooks = context.hooks.splice(0);
    await runHooks(hooks, 'withTransaction');

    return result;
  } catch (error) {
    // A failed transaction must NEVER publish its buffered domain events.
    context.hooks.length = 0;
    await connection.rollback();

    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Group 6 — transaction-safe publishing for MANUALLY acquired connections.
 *
 * Runs the callback inside the transaction ALS context, commits the provided
 * connection, then flushes ONLY the hooks registered by this transaction. On
 * rollback the hooks are discarded, so nothing is ever delivered for a failed
 * transaction. Connection lifecycle (acquire/release) remains the caller's.
 */
export async function runProvidedTransaction<T>(
  connection: PoolConnection,
  callback: () => Promise<T>,
): Promise<T> {
  await connection.beginTransaction();
  const context: TransactionContext = { inTransaction: true, hooks: [] };

  try {
    const result = await transactionAls.run(context, () =>
      callback(),
    );

    await connection.commit();

    const hooks = context.hooks.splice(0);
    await runHooks(hooks, 'runProvidedTransaction');

    return result;
  } catch (error) {
    // A failed transaction must NEVER publish its buffered domain events.
    context.hooks.length = 0;
    await connection.rollback();

    throw error;
  }
}
