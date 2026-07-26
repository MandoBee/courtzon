// Validator: Shared Contracts (@courtzon/shared)
// Ensures the shared package contains only types, zero framework imports, zero dependencies.

import { Validator } from './lib/reporter.js';
import { collectFiles, readFile, shortPath, ROOT } from './lib/fs-utils.js';

export async function validate() {
  const v = new Validator('Shared Contracts (@courtzon/shared)');
  const sharedRoot = ROOT + '/packages/shared/src';

  const files = collectFiles(sharedRoot, f => f.endsWith('.ts'));
  if (files.length === 0) {
    v.fail('No TypeScript files found in packages/shared/src');
    return v;
  }

  // 1. No framework imports
  const frameworkPatterns = [
    "from 'react'", 'from "react"', "from 'fastify'", 'from "fastify"',
    "from 'express'", 'from "express"', "from 'prisma'", 'from "prisma"',
    "from 'socket.io'", 'from "socket.io"', "from 'ioredis'", 'from "ioredis"',
    "from 'mysql'", 'from "mysql"', "from 'pino'", 'from "pino"',
  ];
  for (const file of files) {
    const content = readFile(file);
    for (const pattern of frameworkPatterns) {
      if (content.includes(pattern)) {
        v.fail(`Forbidden framework import: ${pattern}`, shortPath(file));
      }
    }
  }

  // 2. No cross-application imports
  for (const file of files) {
    const content = readFile(file);
    const lines = content.split('\n').filter(l =>
      l.includes("from '../backend") || l.includes('from "../backend') ||
      l.includes("from '../frontend") || l.includes('from "../frontend')
    );
    for (const line of lines) {
      v.fail(`Cross-application import: ${line.trim()}`, shortPath(file));
    }
  }

  // 3. No Node.js runtime imports
  for (const file of files) {
    const content = readFile(file);
    const nodeImports = [
      "from 'fs'", 'from "fs"', "from 'path'", 'from "path"',
      "from 'http'", 'from "http"', "from 'crypto'", 'from "crypto"',
      "from 'child_process", 'from "child_process',
      "from 'os'", 'from "os"',
      "from 'async_hooks'", 'from "async_hooks"',
    ];
    for (const pattern of nodeImports) {
      if (content.includes(pattern)) {
        v.fail(`Node.js runtime import: ${pattern}`, shortPath(file));
      }
    }
  }

  // 4. No runtime code (class definitions, function calls at module level)
  for (const file of files) {
    const content = readFile(file);
    const stripped = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/^(export\s+)?(class|function)\s/m.test(stripped)) {
      // Allow type-only function overloads and arrow functions in const
      // But reject actual class/function implementations
      const hasImpl = /^(export\s+)?(class\s|function\s[a-zA-Z]+\s*\()/m.test(stripped);
      if (hasImpl) {
        v.warn(`Possible runtime code (class/function)`, shortPath(file));
      }
    }
  }

  // 5. Package.json has zero dependencies
  try {
    const pkg = JSON.parse(readFile(ROOT + '/packages/shared/package.json'));
    const depCount = Object.keys(pkg.dependencies || {}).length;
    const devDepCount = Object.keys(pkg.devDependencies || {}).length;
    if (depCount > 0 || devDepCount > 0) {
      v.fail(`package.json has ${depCount} dependencies + ${devDepCount} devDependencies (expected 0)`);
    }
  } catch (err) {
    v.fail(`Cannot read packages/shared/package.json: ${err.message}`);
  }

  // 6. Must export through barrel index.ts
  const hasBarrel = files.some(f => f.replace(/\\/g, '/').endsWith('/index.ts'));
  if (!hasBarrel) {
    v.fail('Missing barrel export file: packages/shared/src/index.ts');
  }

  return v;
}
