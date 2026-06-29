import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.spec.ts"],
    exclude: ["src/**/*.integration.spec.ts", "node_modules"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.spec.ts",
        "src/**/*.test.ts",
        "src/**/*.integration.spec.ts",
        "src/**/__tests__/**",
        "src/tests/**",
        "node_modules",
      ],
      thresholds: {
        statements: 3,
        branches: 3,
        functions: 3,
        lines: 3,
      },
    },
  },
});