/**
 * Regression tests for the Layer Architecture validator.
 *
 * Frontend test files run in Vitest (Node context) and are never reachable
 * from the browser entry point, so the browser-layering rules must ignore
 * *.test.ts / *.test.tsx / *.spec.ts / *.spec.tsx while still enforcing the
 * exact same rules — and messages — for frontend production files.
 *
 * Run with: node --test scripts/architecture/__tests__/validate-layering.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { isFrontendTestFile, scanFrontendSource } from '../validate-layering.js';

test('a frontend test file importing fs produces no browser-layering violation', () => {
  const violations = scanFrontendSource(
    'frontend/src/pages/example.test.ts',
    "import fs from 'fs';",
  );
  assert.deepEqual(violations, []);
});

test('a production .tsx file importing fs still produces the existing violation', () => {
  const violations = scanFrontendSource(
    'frontend/src/pages/Example.tsx',
    "import fs from 'fs';",
  );
  assert.deepEqual(violations, ['Frontend imports Node.js builtin: fs']);
});

test('a test file containing a backend source path in a string produces no violation', () => {
  const content =
    "const p = path.resolve(__dirname, '../../../../backend/src/modules/financial/application/booking-settlement.service.ts');";
  const violations = scanFrontendSource('frontend/src/pages/example.test.ts', content);
  assert.deepEqual(violations, []);
});

test('a production file importing backend code still produces the existing violation', () => {
  const content =
    "import { x } from '../../backend/src/modules/financial/application/booking-settlement.service.js';";
  const violations = scanFrontendSource('frontend/src/pages/Example.ts', content);
  assert.deepEqual(violations, ['Frontend imports backend code']);
});

test('.spec.tsx is excluded from browser-layering checks', () => {
  assert.equal(isFrontendTestFile('frontend/src/pages/Example.spec.tsx'), true);
  assert.deepEqual(
    scanFrontendSource('frontend/src/pages/Example.spec.tsx', "import fs from 'fs';"),
    [],
  );
});

test('a normal production .ts file is not classified as a test file', () => {
  assert.equal(isFrontendTestFile('frontend/src/pages/Example.ts'), false);
  assert.equal(isFrontendTestFile('frontend/src/utils/helpers.tsx'), false);
  assert.deepEqual(
    scanFrontendSource('frontend/src/pages/Example.ts', "import path from 'path';"),
    ['Frontend imports Node.js builtin: path'],
  );
});

test('Windows path separators are normalized for the test-file check', () => {
  assert.equal(isFrontendTestFile('frontend\\src\\pages\\Example.test.tsx'), true);
  assert.equal(isFrontendTestFile('frontend\\src\\pages\\Example.spec.ts'), true);
  assert.equal(isFrontendTestFile('frontend\\src\\pages\\Example.ts'), false);
  assert.deepEqual(
    scanFrontendSource('frontend\\src\\pages\\Example.test.ts', "import fs from 'fs';"),
    [],
  );
});

test('test-file exclusion does not weaken other production rules in the same scan', () => {
  const violations = scanFrontendSource(
    'frontend/src/pages/Example.tsx',
    "import fs from 'fs';\nimport path from 'path';\nimport y from '../backend/service.js';",
  );
  assert.deepEqual(violations, [
    'Frontend imports backend code',
    'Frontend imports Node.js builtin: fs',
    'Frontend imports Node.js builtin: path',
  ]);
});
