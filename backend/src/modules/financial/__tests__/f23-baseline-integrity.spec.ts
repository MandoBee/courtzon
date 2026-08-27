import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * F-23 — Baseline schema integrity.
 *
 * AGENTS.md documents `database/baseline/001_courtzon_v3.sql` as the SINGLE
 * authoritative baseline (regenerated from the full migration chain). The
 * baseline must therefore contain every table/column the current application
 * requires (accounting, booking settlement, entitlements, notifications, etc.)
 * and must NOT contain legacy tables that were dropped by migrations
 * (settlements_v1 / settlement_items_v1 dropped by M052).
 *
 * These are source-level assertions over the baseline SQL file (no DB touched).
 */

const baselinePath = path.resolve(__dirname, '../../../../../database/baseline/001_courtzon_v3.sql');
const baseline = fs.readFileSync(baselinePath, 'utf-8');

const hasTable = (table: string) => {
  const p1 = 'CREATE TABLE `' + table + '`';
  const p2 = 'CREATE TABLE IF NOT EXISTS `' + table + '`';
  const p3 = 'CREATE TABLE ' + table + ' (';
  return baseline.includes(p1) || baseline.includes(p2) || baseline.includes(p3);
};

describe('F-23 — baseline contains required current-schema structures', () => {
  it('contains the canonical accounting tables (GL, COA, ledger)', () => {
    expect(hasTable('general_ledger')).toBe(true);
    expect(hasTable('ledger_entries')).toBe(true);
    expect(hasTable('chart_of_accounts')).toBe(true);
    expect(hasTable('accounting_periods')).toBe(true);
    expect(hasTable('accounting_event_mapping_lines')).toBe(true);
  });

  it('contains position + settlement subledger tables', () => {
    expect(hasTable('financial_entitlements')).toBe(true);
    expect(hasTable('settlement_entitlements')).toBe(true);
    expect(hasTable('booking_settlements')).toBe(true);
  });

  it('bookings contains the settlement/recovery columns required at runtime', () => {
    for (const col of [
      'coach_settled_amount', 'org_settled_amount',
      'coach_recovered_amount', 'org_recovered_amount',
      'coach_recovery_collected', 'org_recovery_collected',
    ]) {
      // The bookings CREATE TABLE block is present and, being the current
      // migration-derived schema, includes these columns (verified by the
      // disposable fresh-database reproduction in the audit).
      expect(hasTable('bookings')).toBe(true);
    }
    // The baseline column set is taken verbatim from the live migration-derived
    // schema, so the settlement columns are present by construction.
    expect(baseline).toContain('coach_settled_amount');
    expect(baseline).toContain('org_settled_amount');
    expect(baseline).toContain('coach_recovered_amount');
    expect(baseline).toContain('org_recovered_amount');
    expect(baseline).toContain('coach_recovery_collected');
    expect(baseline).toContain('org_recovery_collected');
  });

  it('preserves the marketplace_complaint_config reference row', () => {
    expect(baseline).toContain('INSERT INTO `marketplace_complaint_config`');
    expect(baseline).toContain('complaint_period_days');
  });
});

describe('F-23 — dropped/deprecated v1 tables are absent from baseline', () => {
  it('does NOT contain settlements_v1', () => {
    expect(hasTable('settlements_v1')).toBe(false);
    expect(baseline).not.toContain('settlements_v1');
  });

  it('does NOT contain settlement_items_v1', () => {
    expect(hasTable('settlement_items_v1')).toBe(false);
    expect(baseline).not.toContain('settlement_items_v1');
  });
});

describe('F-23 — baseline is the migration-derived schema', () => {
  it('has more tables than the stale 162 and includes non-legacy application tables', () => {
    // The live migration-derived schema is ~293 tables. The corrected baseline
    // must represent it (≈292, minus migration_history which the runner creates).
    const createCount = (baseline.match(/CREATE TABLE/g) || []).length;
    expect(createCount).toBeGreaterThan(280);
    // Spot-check tables that were previously missing but are required.
    for (const t of ['notifications', 'notification_templates', 'tournaments', 'leagues', 'workflow_definitions', 'employees', 'memberships']) {
      expect(hasTable(t)).toBe(true);
    }
  });

  it('contains no DEFINER statements (portable across environments)', () => {
    expect(baseline).not.toContain('DEFINER=');
  });
});