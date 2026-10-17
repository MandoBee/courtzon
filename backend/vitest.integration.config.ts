import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Pin process isolation explicitly. The suite mixes Testcontainers specs
    // (which mutate process.env to point at their ephemeral DB) with
    // persistent-DB specs (which target 127.0.0.1:3307). isolate + the forks
    // pool run each spec file in its own child process, so those process.env
    // mutations cannot leak into another spec file.
    isolate: true,
    pool: "forks",
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
