import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.integration.setup.ts"],
    include: ["src/**/*.integration.spec.ts"],
    testTimeout: 180000,
    hookTimeout: 180000,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
