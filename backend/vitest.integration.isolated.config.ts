import { defineConfig } from "vitest/config";

/**
 * Dedicated Vitest project for the two FULLY ISOLATED Testcontainers
 * integration specs:
 *
 *   - src/shared/utils/pagination.integration.spec.ts   (C1)
 *   - src/tests/app.http.integration.spec.ts            (C2)
 *
 * Both specs start their own disposable MySQL 8.0 + Redis containers
 * (src/tests/helpers/integration-setup.ts) and write only to their ephemeral
 * `courtzon_test` database.
 *
 * This config deliberately OMITS `globalSetup`:
 *   vitest.integration.global-setup.ts is hard-coded to the PERSISTENT
 *   127.0.0.1:3307 / courtzon_v3 database and INSERTs an accounting_periods
 *   row (removing it on teardown). Neither target spec needs that fixture, so
 *   omitting it guarantees this run never touches courtzon_v3.
 *
 * `setupFiles` is kept: vitest.integration.setup.ts only assigns default
 * process.env values; it performs no I/O and opens no connection.
 *
 * Usage (from backend/):
 *   npx vitest run --config vitest.integration.isolated.config.ts
 *
 * Do not use this config for persistent-DB specs (accounting, migration
 * convergence) — they require the global accounting-period fixture.
 */

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Same isolation model as vitest.integration.config.ts: each spec file runs
    // in its own child process, so per-spec process.env mutations cannot leak.
    isolate: true,
    pool: "forks",
    setupFiles: ["./vitest.integration.setup.ts"],
    // No globalSetup here — the persistent-DB fixture must not run.
    include: [
      "src/shared/utils/pagination.integration.spec.ts",
      "src/tests/app.http.integration.spec.ts",
    ],
    testTimeout: 180000,
    hookTimeout: 180000,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
