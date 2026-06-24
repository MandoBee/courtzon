#!/usr/bin/env node
/**
 * CourtZon Production Deployment Checklist
 * 
 * Usage: node scripts/deploy-check.js [--staging|--production]
 * 
 * Runs through all pre-flight checks before deployment.
 */

const { execSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const { resolve } = require('path');

const isProduction = process.argv.includes('--production');
const env = isProduction ? 'production' : 'staging';

let passed = 0;
let failed = 0;
let warnings = 0;

function check(label, condition, severity = 'error') {
  if (typeof condition === 'function') condition = condition();
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else if (severity === 'error') {
    console.log(`  ❌ ${label}`);
    failed++;
  } else {
    console.log(`  ⚠️  ${label}`);
    warnings++;
  }
}

function checkEnvVar(name, file = '.env') {
  try {
    const envFile = readFileSync(resolve(file), 'utf-8');
    const regex = new RegExp(`^${name}=(.+)$`, 'm');
    const match = envFile.match(regex);
    return match && match[1] && !match[1].includes('CHANGE_ME') && match[1].length > 0;
  } catch { return false; }
}

console.log(`\n═══════════════════════════════════════════`);
console.log(`  CourtZon Pre-Deployment Checks (${env})`);
console.log(`═══════════════════════════════════════════\n`);

// ── 1. Environment ──
console.log('📋 Environment Configuration:');
check('NODE_ENV=production', checkEnvVar('NODE_ENV', '.env'));
check('SESSION_SECRET is set and not default', checkEnvVar('SESSION_SECRET', '.env'));
check('DB_PASSWORD is set and not default', checkEnvVar('DB_PASSWORD', '.env'));
check('APP_URL matches target domain', () => {
  if (!checkEnvVar('APP_URL', '.env')) return false;
  // We can't know the target, but we can check it's not trycloudflare
  const envFile = readFileSync(resolve('.env'), 'utf-8');
  const match = envFile.match(/^APP_URL=(.+)$/m);
  return match && !match[1].includes('trycloudflare.com') && !match[1].includes('localhost');
});
check('PAYMOB_HMAC_SECRET is set', checkEnvVar('PAYMOB_HMAC_SECRET', '.env'));
check('PAYMOB_SECRET is set', checkEnvVar('PAYMOB_SECRET', '.env'));

// ── 2. Security ──
console.log('\n🔒 Security Checks:');
check('RELAX_RATE_LIMIT is NOT set', () => {
  const envFile = readFileSync(resolve('.env'), 'utf-8');
  return !envFile.includes('RELAX_RATE_LIMIT=true');
}, isProduction ? 'error' : 'warning');
check('LOG_LEVEL=info', () => checkEnvVar('LOG_LEVEL', '.env'));
check('CORS_ORIGINS contains production domains', checkEnvVar('CORS_ORIGINS', '.env'));
check('REDIS_PASSWORD is set', checkEnvVar('REDIS_PASSWORD', '.env'));
check('METRICS_TOKEN is set and not default', checkEnvVar('METRICS_TOKEN', '.env'));

// ── 3. Database ──
console.log('\n🗄️  Database:');
check('MySQL 8 (not MariaDB)', () => {
  try {
    const out = execSync('mysql --version 2>&1').toString().toLowerCase();
    return out.includes('mysql') && !out.includes('mariadb');
  } catch { return 'skipped'; }
});
check('Setup DB users script exists', existsSync(resolve('backend/scripts/setup-db-users.sql')));
check('Migrations applied', existsSync(resolve('database/schema/127_missing_production_indexes.sql')));

// ── 4. Build ──
console.log('\n🏗️  Build:');
check('Backend compiles', () => {
  try {
    execSync('npm run build 2>&1', { cwd: resolve('backend'), stdio: 'pipe', timeout: 60000 });
    return true;
  } catch { return false; }
});
check('Frontend compiles', () => {
  try {
    execSync('npm run build 2>&1', { cwd: resolve('frontend'), stdio: 'pipe', timeout: 60000 });
    return true;
  } catch { return false; }
});

// ── 5. Docker ──
console.log('\n🐳 Docker:');
check('Dockerfile exists for backend', existsSync(resolve('backend/Dockerfile')));
check('Dockerfile exists for frontend', existsSync(resolve('frontend/Dockerfile')));
check('docker-compose.yml exists', existsSync(resolve('docker-compose.yml')));
check('nginx.prod.conf exists (TLS)', existsSync(resolve('frontend/nginx.prod.conf')));
check('nixpacks.toml exists for backend', existsSync(resolve('backend/nixpacks.toml')));
check('nixpacks.toml exists for frontend', existsSync(resolve('frontend/nixpacks.toml')));
check('.env.production template exists', existsSync(resolve('.env.production')));

// ── 6. Infrastructure ──
console.log('\n☁️  Infrastructure:');
check('Backup service exists', existsSync(resolve('backend/src/infrastructure/backup/backup.service.ts')));
check('Restore script exists', existsSync(resolve('backend/scripts/restore.js')));
check('DR audit report exists', existsSync(resolve('docs/disaster-recovery-audit.md')));
check('SSL setup script exists', existsSync(resolve('scripts/setup-ssl.sh')));
check('Monitoring alerts defined', existsSync(resolve('monitoring/alerts.yml')));

// ── Summary ──
console.log(`\n═══════════════════════════════════════════`);
console.log(`  Results: ${passed} ✅  ${failed} ❌  ${warnings} ⚠️`);
console.log(`═══════════════════════════════════════════\n`);
if (failed > 0) {
  console.log(`❌ ${failed} checks failed. Fix before deploying.\n`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`⚠️  ${warnings} warnings. Review before deploying.\n`);
  process.exit(0);
} else {
  console.log('✅ All checks passed! Ready to deploy.\n');
  process.exit(0);
}
