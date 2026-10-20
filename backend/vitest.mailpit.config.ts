import { defineConfig } from 'vitest/config';

/**
 * Dedicated OPT-IN Vitest project for the Mailpit SMTP integration spec
 * (src/shared/services/__tests__/mailer.service.mailpit.integration.spec.ts).
 *
 * - `npm test`          → vitest.config.ts         → spec EXCLUDED by suffix rule
 * - `npm run test:int`  → vitest.integration.config.ts → spec COLLECTED but SKIPPED
 *                          (COURTZON_MAILPIT_INTEGRATION is not set there)
 * - `npm run test:int:smtp` → THIS config → COURTZON_MAILPIT_INTEGRATION=1 → RUNS
 *
 * This config deliberately has NO globalSetup/setupFiles: it never touches
 * MySQL or Redis. The only external dependency is a locally running Mailpit,
 * which the developer must start explicitly (see the spec header and
 * docs/testing/mailpit-smtp-integration.md).
 *
 * Gate self-check / opt-out: set COURTZON_MAILPIT_INTEGRATION=0 in the shell to
 * collect this spec without executing it (it is then reported as skipped).
 */
const optIn = process.env.COURTZON_MAILPIT_INTEGRATION === '0' ? '0' : '1';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.mailpit.integration.spec.ts'],
    exclude: ['node_modules'],
    env: {
      COURTZON_MAILPIT_INTEGRATION: optIn,
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
