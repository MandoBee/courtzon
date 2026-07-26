// Validator: Module Import Boundaries
// Detects forbidden cross-module imports between bounded contexts.

import { Validator } from './lib/reporter.js';
import { collectFiles, readFile, shortPath, ROOT } from './lib/fs-utils.js';

const BACKEND_SRC = ROOT + '/backend/src/modules';

// Module dependency rules:
// Each module may only import from certain other modules.
// If a module is not listed, it may import from any.
const MODULE_BOUNDARIES = {
  'booking': {
    allowedTargets: ['payment', 'financial', 'organisations', 'notifications', 'time'],
    reason: 'Bookings depend on payments, financial, organisations, notifications, and time engine',
  },
  'payment': {
    allowedTargets: ['financial', 'notifications', 'booking'],
    reason: 'Payments depend on financial and notifications',
  },
  'marketplace': {
    allowedTargets: ['payment', 'financial', 'notifications'],
    reason: 'Marketplace depends on payments and financial',
  },
  'match': {
    allowedTargets: ['booking', 'notifications', 'time'],
    reason: 'Match depends on bookings and notifications',
  },
  'notifications': {
    allowedTargets: ['booking', 'payment', 'marketplace', 'time'],
    reason: 'Notifications may read from domain modules for template data',
  },
  'wallet': {
    allowedTargets: ['payment', 'financial', 'notifications'],
    reason: 'Wallet depends on payment pipeline',
  },
  'scheduling': {
    allowedTargets: ['booking', 'notifications', 'time'],
    reason: 'Scheduling depends on bookings and time engine',
  },
  'auth': {
    allowedTargets: ['notifications'],
    reason: 'Auth may send notifications (password reset, etc.)',
  },
  'organisations': {
    allowedTargets: ['booking', 'notifications', 'financial'],
    reason: 'Organisations manage bookings and subscriptions',
  },
};

export async function validate() {
  const v = new Validator('Module Import Boundaries');

  // Get all module directories
  const moduleDirs = [];
  try {
    const { readdirSync } = await import('node:fs');
    for (const entry of readdirSync(BACKEND_SRC, { withFileTypes: true })) {
      if (entry.isDirectory()) moduleDirs.push(entry.name);
    }
  } catch { }

  for (const moduleName of moduleDirs) {
    const boundaries = MODULE_BOUNDARIES[moduleName];
    if (!boundaries) continue; // no restrictions for this module

    const modulePath = `${BACKEND_SRC}/${moduleName}`;
    const files = collectFiles(modulePath, f => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.endsWith('.d.ts'));

    for (const file of files) {
      const content = readFile(file);
      const relativePath = shortPath(file);

      // Extract all imports
      const importLines = content.split('\n').filter(l =>
        l.includes('from ') && (l.includes('../') || l.includes('./'))
      );

      for (const line of importLines) {
        // Resolve the target module
        const match = line.match(/from\s+['"]([^'"]+)['"]/);
        if (!match) continue;
        const importPath = match[1];

        // Only check imports that go outside the current module
        if (importPath.includes('/modules/') && !importPath.includes(`/modules/${moduleName}/`)) {
          const targetModuleMatch = importPath.match(/\/modules\/([^/]+)/);
          if (!targetModuleMatch) continue;
          const targetModule = targetModuleMatch[1];

          if (!boundaries.allowedTargets.includes(targetModule)) {
            v.fail(
              `"${moduleName}" imports "${targetModule}" — ${boundaries.reason}`,
              `${relativePath}: ${line.trim().substring(0, 100)}`
            );
          }
        }
      }
    }
  }

  return v;
}
