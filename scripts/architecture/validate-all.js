#!/usr/bin/env node

// Architecture Validation Runner
// Orchestrates all validators and produces a summary.
//
// Usage:
//   node scripts/architecture/validate-all.js
//
// Exit codes:
//   0 - All checks passed
//   1 - One or more violations found

import { printSummary } from './lib/reporter.js';

const validators = [
  { name: 'Shared Contracts', file: './validate-shared-contracts.js' },
  { name: 'Layer Architecture', file: './validate-layering.js' },
  { name: 'EventBus Architecture', file: './validate-eventbus.js' },
  { name: 'Notification Architecture', file: './validate-notification-architecture.js' },
  { name: 'Import Boundaries', file: './validate-import-boundaries.js' },
];

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  CourtZon Architecture Validation');
  console.log('═══════════════════════════════════════════════════');

  const results = [];

  for (const validator of validators) {
    try {
      const mod = await import(validator.file);
      const result = await mod.validate();
      result.report();
      results.push(result);
    } catch (err) {
      console.log(`\n── ${validator.name} ──`);
      console.log(`  ❌ VALIDATOR ERROR: ${err.message}`);
      results.push({ errors: [{ message: `Validator crashed: ${err.message}` }], warnings: [], summary: () => `${validator.name}: CRASHED` });
    }
  }

  printSummary(results);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
