import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.integration.setup.ts"],
    // Test-only: opens a platform accounting period for the current business date
    // in the persistent local test DB, then removes exactly that row on teardown.
    globalSetup: ["./vitest.integration.global-setup.ts"],
    include: ["src/**/*.integration.spec.ts"],
    testTimeout: 180000,
    hookTimeout: 180000,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
