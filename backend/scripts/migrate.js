#!/usr/bin/env node
// Canonical migration entry point. Delegates SQL execution to scripts/migrate.sh
// (the mysql CLI is required for DELIMITER/trigger-bearing SQL) while holding a
// persistent MySQL advisory lock for the whole operation.
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { describeDbTlsPolicy, resolveDbTlsPolicy } from './db-tls.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the shell engine in BOTH supported layouts:
 *   repo:      <root>/scripts/migrate.sh    (wrapper: <root>/backend/scripts)
 *   container: /app/scripts/migrate.sh      (wrapper: /app/scripts)
 *
 * COURTZON_PROJECT_ROOT is authoritative when set; otherwise the wrapper's
 * sibling, the app root, the repository root and the process cwd are probed in
 * that order. Never rely on the cwd alone and never hardcode a host path.
 */
function resolveShellScript(scriptName) {
  const explicitRoot = process.env.COURTZON_PROJECT_ROOT;
  if (explicitRoot) {
    const explicitPath = resolve(explicitRoot, 'scripts', scriptName);
    if (existsSync(explicitPath)) return explicitPath;
    console.error(
      `Migration runner failed: ${scriptName} is missing at the configured ` +
        `COURTZON_PROJECT_ROOT path:\n  - ${explicitPath}\n` +
        'Unset COURTZON_PROJECT_ROOT or point it at the directory that contains scripts/.',
    );
    process.exit(1);
  }

  const candidates = [
    resolve(scriptDir, scriptName), // container: /app/scripts/migrate.sh
    resolve(scriptDir, '..', 'scripts', scriptName), // container app root
    resolve(scriptDir, '..', '..', 'scripts', scriptName), // repo root
    resolve(process.cwd(), 'scripts', scriptName), // explicit cwd invocation
  ].filter((candidate, index, all) => all.indexOf(candidate) === index);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    console.error(
      `Migration runner failed: ${scriptName} is missing. Resolved candidates:\n` +
        candidates.map((candidate) => `  - ${candidate}`).join('\n') +
        '\nSet COURTZON_PROJECT_ROOT to the directory that contains scripts/, or ' +
        'ensure the image packages scripts/migrate.sh at /app/scripts/migrate.sh.',
    );
    process.exit(1);
  }
  return found;
}

const migrateSh = resolveShellScript('migrate.sh');
// <root>/scripts/migrate.sh -> <root>; used as the shell engine's cwd.
const projectRoot = resolve(dirname(migrateSh), '..');

/**
 * A shell script can exist in a directory that is not a CourtZon project (a
 * stray sibling or a wrong COURTZON_PROJECT_ROOT). Reject that before the lock,
 * the MySQL connection, or any shell execution.
 */
function assertCourtzonProjectRoot(root, requiredPaths) {
  const missing = requiredPaths
    .map((relativePath) => resolve(root, relativePath))
    .filter((absolutePath) => !existsSync(absolutePath));

  if (missing.length === 0) return;

  console.error(
    `Migration runner failed: resolved project root is not a CourtZon project root:\n` +
      `  project root: ${root}\n` +
      missing.map((absolutePath) => `  missing: ${absolutePath}`).join('\n') +
      '\nSet COURTZON_PROJECT_ROOT to the directory that contains database/ and scripts/.',
  );
  process.exit(1);
}

assertCourtzonProjectRoot(projectRoot, ['database/migrations', 'database/baseline']);

// Lock health is checked while the shell engine runs. An asynchronous child is
// required for that: spawnSync blocks the event loop, so no check could ever run.
const LOCK_CHECK_INTERVAL_MS = 5000;
const LOCK_QUERY_TIMEOUT_MS = 5000;
const TERMINATE_GRACE_MS = 10000;
const GROUP_DRAIN_POLL_MS = 200;
const GROUP_DRAIN_LOG_MS = 10000;

const args = process.argv.slice(2);
const dbName = process.env.DB_NAME || 'courtzon_v3';
const dbPassword = process.env.DB_PASSWORD || process.env.MYSQL_ROOT_PASSWORD || '';
const lockName = `courtzon:migrate:${dbName}`;

let connection;
let exitCode = 1;
let connectionFailure = null;
let onConnectionLost = null;

// True only when THIS connection currently owns the advisory lock. The query is
// bounded: a hung check must not silently disable monitoring. Any thrown error
// (including the query timeout) means ownership cannot be verified and callers
// treat it as failure.
async function stillOwnsLock() {
  const [rows] = await connection.query(
    {
      sql: 'SELECT IS_USED_LOCK(?) = CONNECTION_ID() AS held',
      timeout: LOCK_QUERY_TIMEOUT_MS,
    },
    [lockName],
  );
  return Number(rows?.[0]?.held) === 1;
}

// mysql2 forwards connection 'error' events from the underlying socket. Without
// a listener Node treats that as an unhandled 'error' event and terminates this
// process, which would release the lock with no explanation. Record the failure
// and stop the shell engine instead.
function handleConnectionError(error) {
  if (connectionFailure) return;
  connectionFailure = error?.code || 'CONNECTION_ERROR';
  console.error(
    `Migration runner failed: the MySQL connection holding the migration lock failed (${connectionFailure}); lock ownership can no longer be guaranteed.`,
  );
  if (typeof onConnectionLost === 'function') onConnectionLost();
}

const isWindows = process.platform === 'win32';

// Signals the shell engine. On POSIX the child is its own process-group leader,
// so a negative PID also reaches the mysql client it spawned — signalling only
// bash would leave the in-flight SQL running. Always best-effort.
function signalShell(child, signal) {
  if (!child.pid) return;
  if (isWindows) {
    try {
      child.kill(signal);
    } catch {
      // Nothing further can be done from here.
    }
    return;
  }
  try {
    // Negative PID = whole process group (shell + mysql client + sed, etc.).
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Nothing further can be done from here.
    }
  }
}

// Best-effort signal to a process group identified only by its id. Used once the
// shell object may no longer be usable (after close).
function signalGroupByPid(pgid, signal) {
  try {
    process.kill(-pgid, signal);
  } catch {
    // Nothing further can be done from here.
  }
}

// POSIX only: after the shell closed, another member of its process group (the
// mysql client) may still be executing SQL. The advisory lock must not be
// released while that is possible, so wait until the group is empty. Signal 0
// performs only the existence/permission check. Windows cannot enumerate the
// tree, so this returns immediately there (see the shutdown notes below).

// Lock-release contract:
// - POSIX: the advisory lock is retained until the shell's process group is
//   empty (explicit drain after a termination request; otherwise the shell
//   only exits once its foreground SQL clients are done).
// - The drain wait is intentionally unbounded: the lock is never released
//   while a child (e.g. the mysql client) may still be executing SQL.
// - Windows: the runner waits for the shell instead of force-killing its
//   process tree.
// - A hung Windows run may require external intervention; forcibly killing this
//   Node process can release the advisory lock while SQL may still be running.
async function waitForGroupDrain(pgid) {
  if (isWindows || !pgid) return;
  let lastLog = 0;
  let escalated = false;
  const escalateAt = Date.now() + TERMINATE_GRACE_MS;
  for (;;) {
    try {
      process.kill(-pgid, 0);
    } catch (error) {
      if (error?.code === 'ESRCH') return;
      // EPERM/unknown: a member may still exist, so keep waiting.
    }
    const now = Date.now();
    // The shell's own SIGKILL timer is cleared when it closes, so escalate here
    // for a group member that survives the shell.
    if (!escalated && now >= escalateAt) {
      escalated = true;
      signalGroupByPid(pgid, 'SIGKILL');
      console.error('Migration runner: escalating to SIGKILL for the remaining migration process group.');
    }
    if (lastLog === 0 || now - lastLog >= GROUP_DRAIN_LOG_MS) {
      lastLog = now;
      console.error(
        'Migration runner: waiting for the migration process group to exit before releasing the lock (a mysql client may still be running).',
      );
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, GROUP_DRAIN_POLL_MS));
  }
}

// Runs scripts/migrate.sh asynchronously and re-checks lock ownership every
// LOCK_CHECK_INTERVAL_MS. On loss/unverifiable ownership it asks the child to
// stop and reports failure. Termination is best-effort: a child that ignores
// signals, or that cannot be killed, may outlive this runner.
function runShellEngine() {
  return new Promise((resolveRun) => {
    const child = spawn('bash', [migrateSh, ...args], {
      stdio: 'inherit',
      cwd: projectRoot,
      // POSIX: own process group so termination can reach the mysql client.
      // Windows has no equivalent here, so the child stays attached.
      detached: !isWindows,
      env: {
        ...process.env,
        DB_HOST: process.env.DB_HOST || 'localhost',
        DB_PORT: process.env.DB_PORT || '3306',
        DB_USER: process.env.DB_USER || 'root',
        DB_PASSWORD: dbPassword,
        DB_NAME: dbName,
      },
    });

    let settled = false;
    let lockFailure = false;
    let terminationRequested = false;
    let checkInFlight = false;
    let killTimer;

    const terminateChild = (reason) => {
      // Never start a new termination action after the runner finalized; an
      // in-flight monitor check can resolve late and must not act.
      if (settled || terminationRequested) return;
      terminationRequested = true;
      lockFailure = true;
      if (isWindows) {
        // child.kill() on Windows terminates the shell only and can orphan the
        // mysql client, so it gives no guarantee. Waiting for the shell to
        // finish keeps the lock held until its SQL is done.
        console.error(
          `Migration runner failed: ${reason} — a Windows process tree cannot be terminated safely without extra tooling; waiting for the migration shell to finish before the lock may be released.`,
        );
        return;
      }
      console.error(
        `Migration runner failed: ${reason} — requesting termination of the migration shell (best effort; termination is not guaranteed).`,
      );
      signalShell(child, 'SIGTERM');
      killTimer = setTimeout(() => signalShell(child, 'SIGKILL'), TERMINATE_GRACE_MS);
      if (typeof killTimer.unref === 'function') killTimer.unref();
    };

    // Detaching would otherwise swallow terminal signals, so forward them.
    // Signals never force-exit: the runner must stay alive until the shell
    // exits, because exiting releases the advisory lock.
    const onSigint = () => {
      if (settled) {
        console.error('Migration runner: still finalizing; the migration process group has not exited yet.');
        return;
      }
      terminateChild('the migration was interrupted by SIGINT');
    };
    const onSigterm = () => {
      if (settled) {
        console.error('Migration runner: still finalizing; the migration process group has not exited yet.');
        return;
      }
      terminateChild('the migration was interrupted by SIGTERM');
    };
    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);

    onConnectionLost = () =>
      terminateChild('the MySQL connection holding the migration lock failed');

    const monitor = setInterval(async () => {
      if (settled || checkInFlight) return;
      checkInFlight = true;
      try {
        const owned = await stillOwnsLock();
        if (settled) return;
        if (!owned) terminateChild('migration lock ownership was lost during execution');
      } catch {
        if (!settled) terminateChild('migration lock ownership could not be verified during execution');
      } finally {
        checkInFlight = false;
      }
    }, LOCK_CHECK_INTERVAL_MS);
    if (typeof monitor.unref === 'function') monitor.unref();

    const finish = (code) => {
      if (settled) return;
      settled = true;
      // Late connection errors must not start new termination actions.
      onConnectionLost = null;
      clearInterval(monitor);
      if (killTimer) clearTimeout(killTimer);
      // Signal listeners intentionally stay attached: the runner may still be
      // draining the process group before it releases the lock, and exiting on
      // a signal would release the lock too early.
      resolveRun({ code, lockFailure, terminationRequested, childPid: child.pid });
    };

    child.on('error', (error) => {
      console.error('Migration runner failed: could not start the migration shell.',
        error?.code || 'SPAWN_ERROR');
      finish(1);
    });
    child.on('close', (code, signal) => {
      // A signal-terminated child has no usable exit code; never report 0.
      finish(signal ? 1 : (code ?? 1));
    });
  });
}

// The advisory-lock connection uses exactly the same database TLS policy as the
// shell migration engine (scripts/migrate.sh) and the application pool. A bad
// or missing policy must fail before the first connection attempt.
let dbTls;
try {
  dbTls = resolveDbTlsPolicy(process.env);
} catch (error) {
  console.error('Migration runner failed: database TLS policy error.');
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
console.log(`Database TLS policy: ${describeDbTlsPolicy(dbTls)}`);
for (const warning of dbTls.warnings) {
  console.error(warning);
}

try {
  connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: dbPassword,
    ...dbTls.mysql2,
  });

  // A connection 'error' event must never become an unhandled Node error.
  connection.on('error', handleConnectionError);

  if (connectionFailure) {
    console.error('Migration runner failed: refusing to start the migration shell because the lock connection is already failed.');
    exitCode = 1;
  } else {
    const [lockRows] = await connection.query('SELECT GET_LOCK(?, 60) AS acquired', [lockName]);
    const acquired = Number(lockRows?.[0]?.acquired) === 1;
    if (!acquired || connectionFailure) {
      console.error('Migration runner failed: could not acquire a verifiable migration lock.');
      exitCode = 1;
    } else {
      const result = await runShellEngine();
      exitCode = result.code;

      // Do not release the advisory lock while any member of the migration
      // process group may still be executing SQL. On POSIX the group is drained
      // here; on Windows the shell is never force-killed, so the wait happens
      // naturally (see terminateChild).
      if (result.terminationRequested) {
        await waitForGroupDrain(result.childPid);
      }

      if (connectionFailure || result.lockFailure) {
        // Ownership was already lost/unverifiable mid-run; never report success.
        console.error('Migration runner failed: lock ownership could not be guaranteed; the migration shell may still be running (termination is best effort only).');
        exitCode = result.code === 0 ? 1 : result.code;
      } else {
        // Final ownership proof: a child exit code of 0 is not trusted on its own.
        try {
          if (!(await stillOwnsLock())) {
            console.error('Migration runner failed: migration lock ownership was lost before completion.');
            exitCode = 1;
          }
        } catch (error) {
          console.error('Migration runner failed: could not verify migration lock ownership.',
            error?.code || 'LOCK_VERIFICATION_ERROR');
          exitCode = 1;
        }
      }
    }
  }
} catch (error) {
  console.error('Migration runner failed:',
    error?.code || 'DATABASE_CONNECTION_ERROR');
  exitCode = 1;
} finally {
  if (connection) {
    try {
      await connection.query(
        { sql: 'SELECT RELEASE_LOCK(?)', timeout: LOCK_QUERY_TIMEOUT_MS },
        [lockName],
      );
    } catch {
      // The lock is also released when the connection closes; never mask the
      // original migration failure with a release error.
    }
    try {
      await connection.end();
    } catch {
      // Ignore close errors.
    }
  }
}

process.exit(exitCode);
