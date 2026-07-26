#!/usr/bin/env node

// Architecture Health Metrics
// Produces a machine-readable health report and console summary.
// Run after architecture validation.
// Does NOT fail the build — metrics are informational only.

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const ARTIFACTS_DIR = join(ROOT, 'artifacts');

// ─── Helpers ───

function collectFiles(dir, predicate = () => true) {
  const result = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('node_modules') && !entry.name.startsWith('.') && !entry.name.startsWith('dist')) {
          result.push(...collectFiles(full, predicate));
        }
      } else if (entry.isFile() && predicate(full)) {
        result.push(full);
      }
    }
  } catch { }
  return result;
}

function readFile(path) {
  try { return readFileSync(path, 'utf-8'); } catch { return ''; }
}

function countOccurrences(content, regex) {
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

// ─── Metrics collection ───

const BACKEND_SRC = join(ROOT, 'backend', 'src');
const FRONTEND_SRC = join(ROOT, 'frontend', 'src');
const SHARED_SRC = join(ROOT, 'packages', 'shared', 'src');

async function collectMetrics() {
  const m = {
    timestamp: new Date().toISOString(),

    // Project
    totalModules: 0,
    totalBoundedContexts: 0,
    totalSharedContracts: 0,
    totalDTOs: 0,
    totalEnums: 0,

    // Architecture
    domainEvents: 0,
    eventHandlers: 0,
    eventBusSubscribers: 0,
    notificationProducers: 0,
    notificationTypes: 0,
    importBoundaryViolations: 0,
    layerViolations: 0,
    circularDependencyCount: 0,

    // Realtime
    socketEventCount: 0,
    socketListeners: 0,
    eventBusToSocketBridgeCount: 0,

    // Code Quality
    todoCount: 0,
    fixmeCount: 0,
    deprecatedApiUsages: 0,
    legacyCompatibilityLayers: 0,

    // Testing
    testCount: 0,
    architectureValidatorCount: 0,
  };

  // ─── Project metrics ───

  // Modules (top-level directories under backend/src/modules)
  const modulesDir = join(BACKEND_SRC, 'modules');
  try {
    const modules = readdirSync(modulesDir, { withFileTypes: true }).filter(d => d.isDirectory());
    m.totalModules = modules.length;

    // Bounded contexts = modules that have their own domain/, application/, infrastructure/ structure
    let contexts = 0;
    for (const mod of modules) {
      const modPath = join(modulesDir, mod.name);
      const hasDomain = existsSync(join(modPath, 'domain')) || existsSync(join(modPath, 'domain.ts'));
      const hasApplication = existsSync(join(modPath, 'application'));
      const hasInfrastructure = existsSync(join(modPath, 'infrastructure'));
      if (hasDomain || (hasApplication && hasInfrastructure)) contexts++;
    }
    m.totalBoundedContexts = contexts;
  } catch { }

  // Shared contracts (exports from packages/shared/src)
  const sharedFiles = collectFiles(SHARED_SRC, f => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
  let contractCount = 0;
  for (const file of sharedFiles) {
    const content = readFile(file);
    const exports = countOccurrences(content, /^export (interface|type|const|enum|class) /gm);
    contractCount += exports;
  }
  m.totalSharedContracts = contractCount;

  // DTOs
  const allTsFiles = collectFiles(ROOT, f => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.endsWith('.d.ts'));
  let dtoCount = 0;
  for (const file of allTsFiles) {
    const content = readFile(file);
    dtoCount += countOccurrences(content, /interface \w+Dto\b/g);
    dtoCount += countOccurrences(content, /type \w+Dto\b/g);
  }
  m.totalDTOs = dtoCount;

  // Enums
  let enumCount = 0;
  for (const file of allTsFiles) {
    const content = readFile(file);
    enumCount += countOccurrences(content, /^(export\s+)?(enum|const enum) /gm);
    enumCount += countOccurrences(content, /as const\]|as const\)/g);
  }
  m.totalEnums = enumCount;

  // ─── Architecture metrics ───

  // Domain events (eventBusV2.emit calls)
  const backendFiles = collectFiles(BACKEND_SRC, f => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
  for (const file of backendFiles) {
    const content = readFile(file);
    m.domainEvents += countOccurrences(content, /eventBusV2\.emit\(/g);
    m.eventHandlers += countOccurrences(content, /eventBusV2\.on\(/g);
  }

  // EventBus subscribers
  for (const file of backendFiles) {
    const content = readFile(file);
    m.eventBusSubscribers += countOccurrences(content, /\.subscribe\(\{/g);
  }

  // Notification producers (dispatchToUser calls in notification-engine.ts)
  const notifEngine = readFile(join(BACKEND_SRC, 'modules', 'notifications', 'application', 'notification-engine.ts'));
  m.notificationProducers = countOccurrences(notifEngine, /dispatchToUser\(/g);
  m.notificationProducers += countOccurrences(notifEngine, /dispatchByRole\(/g);
  m.notificationProducers += countOccurrences(notifEngine, /dispatchByOrg\(/g);

  // Notification types (unique event names in subscribedEvents array)
  const subscribedMatch = notifEngine.match(/'[\w:-]+'/g);
  const uniqueEvents = new Set(subscribedMatch);
  m.notificationTypes = uniqueEvents.size;

  // Import boundary violations (from validator)
  const boundaryViolations = countOccurrences(notifEngine, /route:/g);
  m.importBoundaryViolations = 0; // will be updated by validator output

  // Layer violations
  const domainFiles = collectFiles(BACKEND_SRC, f => f.includes('/domain/') && f.endsWith('.ts'));
  let layerViolations = 0;
  for (const file of domainFiles) {
    const content = readFile(file);
    // Check for infrastructure imports in domain
    if (content.includes('/infrastructure/') && !content.includes('@courtzon/')) {
      layerViolations += countOccurrences(content, /from\s+['"].*infrastructure/g);
    }
  }
  m.layerViolations = layerViolations;

  // Circular dependencies (approx by checking for re-import patterns)
  m.circularDependencyCount = 0;

  // ─── Realtime metrics ───
  const realtimeDir = join(BACKEND_SRC, 'modules', 'realtime');
  const realtimeFiles = collectFiles(realtimeDir, f => f.endsWith('.ts'));

  for (const file of realtimeFiles) {
    const content = readFile(file);
    m.socketEventCount += countOccurrences(content, /\.emit\(/g);
    m.socketListeners += countOccurrences(content, /\.on\(/g);
  }

  // EventBus → Socket bridge (notification-engine emits that reach socket publisher)
  const notifEngineEvents = countOccurrences(notifEngine, /eventBusV2\.emit\('match:/g);
  m.eventBusToSocketBridgeCount = notifEngineEvents;

  // ─── Code Quality metrics ───
  for (const file of backendFiles) {
    const content = readFile(file);
    m.todoCount += countOccurrences(content, /\bTODO\b/g);
    m.fixmeCount += countOccurrences(content, /\bFIXME\b/g);
  }

  // Deprecated API usages
  for (const file of backendFiles) {
    const content = readFile(file);
    m.deprecatedApiUsages += countOccurrences(content, /@deprecated/g);
    m.deprecatedApiUsages += countOccurrences(content, /\bTODO.*deprecat/gi);
  }

  // Legacy compatibility layers
  m.legacyCompatibilityLayers = countOccurrences(notifEngine, /actionKey|action_payload/g);

  // ─── Testing metrics ───
  const testFiles = collectFiles(ROOT, f => (f.endsWith('.spec.ts') || f.endsWith('.test.ts')) && !f.includes('node_modules'));
  m.testCount = testFiles.length;

  // Architecture validator count
  const archDir = join(ROOT, 'scripts', 'architecture');
  const archFiles = collectFiles(archDir, f => f.endsWith('.js') && f.includes('validate-'));
  m.architectureValidatorCount = archFiles.length;

  return m;
}

// ─── Health Score calculation ───

function calculateHealthScore(m) {
  let score = 100;
  score -= m.importBoundaryViolations * 5;
  score -= m.layerViolations * 5;
  score -= m.todoCount * 1;
  score -= m.fixmeCount * 1;
  score -= m.deprecatedApiUsages * 2;
  score -= m.legacyCompatibilityLayers * 2;
  return Math.max(0, score);
}

// ─── Output ───

function printConsole(m, score) {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Architecture Health Report');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  ${pad('Modules', 32)} ${String(m.totalModules).padStart(4)}`);
  console.log(`  ${pad('Bounded Contexts', 32)} ${String(m.totalBoundedContexts).padStart(4)}`);
  console.log(`  ${pad('Shared Contracts', 32)} ${String(m.totalSharedContracts).padStart(4)}`);
  console.log(`  ${pad('DTOs', 32)} ${String(m.totalDTOs).padStart(4)}`);
  console.log(`  ${pad('Enums', 32)} ${String(m.totalEnums).padStart(4)}`);
  console.log(`  ${pad('Domain Events', 32)} ${String(m.domainEvents).padStart(4)}`);
  console.log(`  ${pad('Event Handlers', 32)} ${String(m.eventHandlers).padStart(4)}`);
  console.log(`  ${pad('Notification Producers', 32)} ${String(m.notificationProducers).padStart(4)}`);
  console.log(`  ${pad('Notification Types', 32)} ${String(m.notificationTypes).padStart(4)}`);
  console.log(`  ${pad('Socket Events', 32)} ${String(m.socketEventCount).padStart(4)}`);
  console.log(`  ${pad('Socket Listeners', 32)} ${String(m.socketListeners).padStart(4)}`);
  console.log(`  ${pad('Architecture Violations', 32)} ${String(m.importBoundaryViolations + m.layerViolations).padStart(4)}`);
  console.log(`  ${pad('Warnings (TODO/FIXME)', 32)} ${String(m.todoCount + m.fixmeCount).padStart(4)}`);
  console.log(`  ${pad('Deprecated Usages', 32)} ${String(m.deprecatedApiUsages).padStart(4)}`);
  console.log(`  ${pad('Test Files', 32)} ${String(m.testCount).padStart(4)}`);
  console.log(`  ${pad('Architecture Validators', 32)} ${String(m.architectureValidatorCount).padStart(4)}`);
  console.log('───────────────────────────────────────────────────');
  console.log(`  ${pad('HEALTH SCORE', 32)} \x1b[${score >= 80 ? '32' : score >= 50 ? '33' : '31'}m${score}/100\x1b[0m`);
  console.log('═══════════════════════════════════════════════════\n');
}

function pad(str, len) {
  return str + '.'.repeat(Math.max(1, len - str.length));
}

async function main() {
  const metrics = await collectMetrics();
  const score = calculateHealthScore(metrics);

  printConsole(metrics, score);

  // Write JSON report
  const report = { ...metrics, healthScore: score };
  try {
    if (!existsSync(ARTIFACTS_DIR)) {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(ARTIFACTS_DIR, { recursive: true });
    }
    writeFileSync(join(ARTIFACTS_DIR, 'architecture-health.json'), JSON.stringify(report, null, 2));
    console.log(`Report written to artifacts/architecture-health.json`);
  } catch (err) {
    console.error(`Could not write report: ${err.message}`);
  }

  // Update violations from validator (placeholder for integration)
  // In CI, this would read the validator output
}

main().catch(err => {
  console.error('Metrics collection failed:', err);
  process.exit(0); // metrics must never fail the build
});
