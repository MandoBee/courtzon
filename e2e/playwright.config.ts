import { defineConfig, devices } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './scenarios',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { outputFolder: '../test-results/e2e/html' }],
    ['junit', { outputFile: '../test-results/e2e/junit.xml' }],
    ['json', { outputFile: '../test-results/e2e/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: FRONTEND_URL,
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },
  projects: [
    {
      name: 'smoke',
      testMatch: '**/smoke/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
      timeout: 120_000,
    },
    {
      name: 'critical',
      testMatch: [
        '**/booking/*.spec.ts',
        '**/payments/*.spec.ts',
        '**/notifications/*.spec.ts',
        '**/match/*.spec.ts',
        '**/wallet/*.spec.ts',
      ],
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['smoke'],
    },
    {
      name: 'realtime',
      testMatch: '**/realtime/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['smoke'],
    },
    {
      name: 'admin',
      testMatch: '**/admin/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['smoke'],
    },
    {
      name: 'all',
      testMatch: '**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['smoke'],
    },
  ],
});
