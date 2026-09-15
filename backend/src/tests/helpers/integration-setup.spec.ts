import { describe, it, expect } from 'vitest';

// Keep this isolated — the harness module imports the app's DB pool at load.
vi.mock('../../database/mysql.js', () => ({ closePool: vi.fn() }));

import { buildSchemaSetupCommands } from './integration-setup.js';

describe('integration harness schema setup (regression: migrate.js --fresh --seed)', () => {
  it('never passes the unsupported --seed flag to any setup command', () => {
    const steps = buildSchemaSetupCommands(33060);
    for (const step of steps) {
      expect(step.args).not.toContain('--seed');
      expect(step.cmd).not.toMatch(/migrate/);
    }
  });

  it('drops + recreates a fresh database as the first step', () => {
    const [step] = buildSchemaSetupCommands(33060);
    expect(step.cmd).toBe('mysql');
    expect(step.args.join(' ')).toContain('DROP DATABASE IF EXISTS courtzon_test');
    expect(step.args.join(' ')).toContain('CREATE DATABASE courtzon_test');
  });

  it('imports the authoritative baseline schema with --force and tolerates residual warnings', () => {
    const [, step] = buildSchemaSetupCommands(33060);
    expect(step.args).toContain('--force');
    expect(step.args).toContain('courtzon_test');
    // The real baseline content is piped in — proves a complete schema import.
    expect(step.input).toContain('CREATE TABLE');
    expect(step.input).toContain('payment_transactions');
    expect(step.expectFail).toBe(true);
  });

  it('seeds via the repository canonical seed mechanism (seed.js --seed-file) in order as the final steps', () => {
    const steps = buildSchemaSetupCommands(33060);
    const seedSteps = steps.slice(2);
    expect(seedSteps.length).toBe(3);
    const files = seedSteps.map((s) => s.args[2]);
    expect(files).toEqual(['001_baseline.sql', '002_academy_programs.sql', '003_player_demo.sql']);
    for (const s of seedSteps) {
      expect(s.cmd).toBe(process.execPath);
      expect(s.args[0]).toContain('seed.js');
      expect(s.args).toContain('--seed-file');
    }
  });
});