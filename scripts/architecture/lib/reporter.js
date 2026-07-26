// Validation result reporter.
// Collects pass/fail results and produces a structured report.

export class Validator {
  constructor(name) {
    this.name = name;
    this.errors = [];
    this.warnings = [];
  }

  fail(message, file = '') {
    this.errors.push({ message, file });
  }

  warn(message, file = '') {
    this.warnings.push({ message, file });
  }

  get passed() {
    return this.errors.length === 0;
  }

  report() {
    console.log(`\n── ${this.name} ──`);
    for (const w of this.warnings) {
      console.log(`  ⚠  ${w.message}${w.file ? `  (${w.file})` : ''}`);
    }
    for (const e of this.errors) {
      console.log(`  ❌  ${e.message}${e.file ? `  (${e.file})` : ''}`);
    }
    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('  ✅ All checks passed');
    }
    return this.passed;
  }

  summary() {
    return `${this.name}: ${this.errors.length} errors, ${this.warnings.length} warnings`;
  }
}

export function printSummary(validators) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('ARCHITECTURE VALIDATION SUMMARY');
  console.log('='.repeat(60));
  let totalErrors = 0;
  for (const v of validators) {
    console.log(`  ${v.summary()}`);
    totalErrors += v.errors.length;
  }
  console.log('='.repeat(60));
  if (totalErrors > 0) {
    console.log(`❌ FAILED: ${totalErrors} architecture violation(s) found`);
    process.exit(1);
  }
  console.log('✅ PASSED: All architecture rules satisfied');
}
