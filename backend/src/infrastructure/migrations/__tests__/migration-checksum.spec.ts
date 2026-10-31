import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { findShell, projectRoot } from './migration-guard-test-helper.js';

describe('migration checksum verification (real runner functions, no database)', () => {
  it('classifies hash kinds and preserves skip/stop behavior', () => {
    const shell = findShell();
    const script = join(projectRoot, 'scripts', 'tests', 'migration-checksum.test.sh').replace(/\\/g, '/');
    const output = execFileSync(shell, [script], {
      cwd: projectRoot,
      env: {
        ...process.env,
        COURTZON_PROJECT_ROOT: projectRoot.replace(/\\/g, '/'),
      },
      encoding: 'utf8',
      timeout: 120000,
    });
    expect(output).toContain('ALL CHECKS PASSED');
  }, 120000);
});
