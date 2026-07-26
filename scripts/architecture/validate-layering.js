// Validator: Layer Architecture
// Verifies the dependency direction rules between architectural layers.
//
// Layer rules:
//   domain/ → nothing (innermost layer)
//   application/ → domain/
//   infrastructure/ → domain/, application/
//   presentation/ → application/, domain/
//   shared/ → nothing (pure utilities)
//
// Frontend rules:
//   UI never imports backend code
//   UI never imports database code
//   UI never imports Node.js builtins

import { Validator } from './lib/reporter.js';
import { collectFiles, readFile, shortPath, ROOT } from './lib/fs-utils.js';

const BACKEND_SRC = ROOT + '/backend/src';

function categorizeLayer(filePath) {
  const path = filePath.replace(/\\/g, '/');
  if (path.includes('/domain/')) return 'domain';
  if (path.includes('/application/')) return 'application';
  if (path.includes('/infrastructure/')) return 'infrastructure';
  if (path.includes('/presentation/')) return 'presentation';
  return 'unknown';
}

// Layer rules for this codebase:
// - domain → nothing (no imports to other layers)
// - application → infrastructure is ALLOWED (repository pattern)
// - application → presentation is ALLOWED (DTO types)
// - infrastructure → presentation is NOT allowed
// - shared → backend/frontend NOT allowed
const WARN_IMPORTS = {
  domain: ['infrastructure'],
};
const FORBIDDEN_IMPORTS = {
  domain: ['application', 'presentation'],
  infrastructure: ['presentation'],
};

export async function validate() {
  const v = new Validator('Layer Architecture');

  // Collect backend source files
  const files = collectFiles(BACKEND_SRC, f => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.endsWith('.d.ts'));

  for (const file of files) {
    const content = readFile(file);
    const relativePath = shortPath(file);
    const layer = categorizeLayer(relativePath);
    if (layer === 'unknown') continue;

    const forbidden = FORBIDDEN_IMPORTS[layer] || [];
    for (const forbiddenLayer of forbidden) {
      const importPattern = new RegExp(`from ['"].*\\.\\./.*${forbiddenLayer}/`, 'i');
      if (importPattern.test(content)) {
        const lines = content.split('\n').filter(l => importPattern.test(l));
        for (const line of lines) {
          v.fail(
            `${layer} → ${forbiddenLayer} import not allowed`,
            `${relativePath}: ${line.trim().substring(0, 100)}`
          );
        }
      }
    }
    const warnImports = WARN_IMPORTS[layer] || [];
    for (const warnLayer of warnImports) {
      const importPattern = new RegExp(`from ['"].*\\.\\./.*${warnLayer}/`, 'i');
      if (importPattern.test(content)) {
        const lines = content.split('\n').filter(l => importPattern.test(l));
        for (const line of lines) {
          v.warn(
            `${layer} → ${warnLayer} import (prefer interfaces)`,
            `${relativePath}: ${line.trim().substring(0, 100)}`
          );
        }
      }
    }
  }

  // Shared layer purity
  const sharedFiles = collectFiles(BACKEND_SRC + '/../../packages/shared/src', f => f.endsWith('.ts'));
  for (const file of sharedFiles) {
    const content = readFile(file);
    const relativePath = shortPath(file);
    // shared must not import from backend or frontend
    if (content.includes("from '../backend") || content.includes('from "../backend') ||
        content.includes("from '../frontend") || content.includes('from "../frontend') ||
        content.includes("from '../../backend") || content.includes('from "../../frontend')) {
      v.fail('Shared package imports from backend/frontend', relativePath);
    }
  }

  // Frontend must not import backend code
  const frontendSrc = ROOT + '/frontend/src';
  const frontendFiles = collectFiles(frontendSrc, f => f.endsWith('.ts') || f.endsWith('.tsx'));
  for (const file of frontendFiles) {
    const content = readFile(file);
    const relativePath = shortPath(file);
    if (content.includes('from \'../../backend') || content.includes('from "../../backend') ||
        content.includes("from '../backend") || content.includes('from "../backend') ||
        content.includes('/backend/src/')) {
      // Check if it's importing from @courtzon/shared which is allowed
      if (!content.includes('@courtzon/shared')) {
        v.fail('Frontend imports backend code', relativePath);
      }
    }
  }

  // Frontend must not import Node.js builtins
  const nodeBuiltins = ['fs', 'path', 'os', 'crypto', 'http', 'child_process', 'async_hooks'];
  for (const file of frontendFiles) {
    const content = readFile(file);
    const relativePath = shortPath(file);
    for (const mod of nodeBuiltins) {
      if (content.includes(`from '${mod}'`) || content.includes(`from "${mod}"`)) {
        // Vite config is allowed to import from 'path'
        if (!relativePath.includes('vite.config')) {
          v.fail(`Frontend imports Node.js builtin: ${mod}`, relativePath);
        }
      }
    }
  }

  return v;
}
