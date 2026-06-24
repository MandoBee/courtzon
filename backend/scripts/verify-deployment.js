#!/usr/bin/env node
/**
 * Deployment Verification Script
 *
 * Usage: node scripts/verify-deployment.js [base-url]
 *   Default base URL: http://localhost:3000
 *
 * Checks:
 *   /health
 *   /health/live
 *   /health/ready
 *   /public/countries
 *   /public/languages
 *   /public/feature-flags
 *   /public/app-settings
 */

const BASE_URL = process.argv[2] || process.env.APP_URL || 'http://localhost:3000';

async function check(label, url, expectedStatus = 200) {
  try {
    const res = await fetch(`${BASE_URL}${url}`);
    const body = await res.json();
    const ok = res.status === expectedStatus;
    const icon = ok ? '✅' : '❌';
    console.log(`  ${icon} ${label} (${res.status})`);
    return ok;
  } catch (err) {
    console.log(`  ❌ ${label} — ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('═'.repeat(60));
  console.log(`  CourtZon Deployment Verification`);
  console.log(`  Target: ${BASE_URL}`);
  console.log('═'.repeat(60));

  const checks = [
    ['Health', '/health'],
    ['Liveness', '/health/live'],
    ['Readiness', '/health/ready'],
    ['Public Countries', '/public/countries'],
    ['Public Languages', '/public/languages'],
    ['Feature Flags', '/public/feature-flags'],
    ['App Settings', '/public/app-settings'],
  ];

  let passed = 0;
  let failed = 0;

  for (const [label, url] of checks) {
    const ok = await check(label, url);
    if (ok) passed++; else failed++;
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`  ${failed === 0 ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'}`);
  console.log(`  ${passed}/${checks.length} passed, ${failed} failed`);
  console.log('═'.repeat(60) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

main();
