import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 2 Step 1 — Position Authority foundations (READ-ONLY foundations).
 *
 * Proves:
 *  1. PositionService reads ONLY financial_entitlements
 *  2. Available/pending/held/reserved/settled buckets are correct
 *  3. Collector-aware balances are correct for CARD vs CASH custody
 *  4. Reconciliation returns zero difference for matching entitlement/GL positions
 *  5. Reconciliation exposes drift WITHOUT modifying either source (SELECT-only)
 *  6. Multiple organisations remain isolated
 *  7. No legacy ledger (marketplace_ledger_entries / bookings columns / orders)
 *     is used as a position authority
 */

type CapturedQuery = { sql: string; params: any[] };
const captured: CapturedQuery[] = [];

// Deterministic fake result sets keyed by table + shape.
const entitlementRowsByOrg = new Map<number, any[]>();
const glRowsByOrg = new Map<number, any[]>();
const controlAccounts = [
  { id: 27, code: '2200' },
  { id: 36, code: '1160' },
];

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: vi.fn(async (sql: string, params: any[] = []) => {
      captured.push({ sql, params });
      const lower = sql.toLowerCase();

      if (lower.includes('from financial_entitlements')) {
        const orgId = Number(params[0]);
        const rows = entitlementRowsByOrg.get(orgId) ?? [];
        if (lower.includes('group by status')) {
          const grouped = new Map<string, { status: string; isReserved: number; cnt: number; total: number }>();
          for (const r of rows) {
            if (r.status === 'CANCELLED') continue;
            const key = `${r.status}|${r.settlement_id ? 1 : 0}`;
            const g = grouped.get(key) ?? { status: r.status, isReserved: r.settlement_id ? 1 : 0, cnt: 0, total: 0 };
            g.cnt += 1; g.total += Number(r.amount);
            grouped.set(key, g);
          }
          return [[...grouped.values()].map((g) => ({ ...g, total: String(g.total) })), []];
        }
        if (lower.includes('group by entitlement_type')) {
          // collector breakdown — respects OPEN status filter when present
          const openOnly = lower.includes('status in (?, ?, ?)');
          const grouped = new Map<string, any>();
          for (const r of rows) {
            if (openOnly && !['PENDING', 'AVAILABLE', 'ON_HOLD'].includes(r.status)) continue;
            if (r.status === 'CANCELLED') continue;
            const key = `${r.entitlement_type}|${r.collector}|${r.status}`;
            const g = grouped.get(key) ?? { entitlementType: r.entitlement_type, collector: r.collector, status: r.status, total: 0 };
            g.total += Number(r.amount);
            grouped.set(key, g);
          }
          return [[...grouped.values()].map((g) => ({ ...g, total: String(g.total) })), []];
        }
        if (lower.includes('count(*)')) {
          const openOnly = lower.includes("status in ('pending', 'available', 'on_hold')") || lower.includes('status in (?, ?, ?)');
          const orgId = Number(params[0]);
          const n = (entitlementRowsByOrg.get(orgId) ?? [])
            .filter((r) => !openOnly || ['PENDING', 'AVAILABLE', 'ON_HOLD'].includes(r.status)).length;
          return [[{ cnt: n }], []];
        }
        // detail listing
        const detailOpenOnly = lower.includes("status in ('pending', 'available', 'on_hold')");
        return [(entitlementRowsByOrg.get(orgId) ?? []).filter((r) => !detailOpenOnly || ['PENDING', 'AVAILABLE', 'ON_HOLD'].includes(r.status)), []];
      }

      if (lower.includes('from accounting_event_mapping_lines') && lower.includes('join chart_of_accounts')) {
        return [controlAccounts.map((c) => ({ id: c.id, code: c.code })), []];
      }

      if (lower.includes('from general_ledger')) {
        if (lower.includes('group by gl.account_id')) {
          const orgId = Number(params[params.length - 1]);
          const rows = glRowsByOrg.get(orgId) ?? [];
          const grouped = new Map<number, { accountId: number; debits: number; credits: number }>();
          for (const r of rows) {
            const g = grouped.get(r.account_id) ?? { accountId: r.account_id, debits: 0, credits: 0 };
            g.debits += Number(r.debit); g.credits += Number(r.credit);
            grouped.set(r.account_id, g);
          }
          return [[...grouped.values()].map((g) => ({ ...g, debits: String(g.debits), credits: String(g.credits) })), []];
        }
        if (lower.includes('select distinct organisation_id')) {
          const orgs = new Set<number>();
          for (const rows of glRowsByOrg.values()) for (const r of rows) orgs.add(r.organisation_id);
          return [[...orgs].map((o) => ({ organisationId: o })), []];
        }
      }

      if (lower.includes('select distinct organisation_id')) {
        const orgs = new Set<number>();
        for (const rows of entitlementRowsByOrg.values()) for (const r of rows) orgs.add(r.organisation_id);
        return [[...orgs].map((o) => ({ organisationId: o })), []];
      }

      return [[], []];
    }),
    query: vi.fn(async () => [[], []]),
  }),
}));

import { positionService } from '../application/position.service.js';
import { reconciliationService } from '../application/reconciliation.service.js';
import { positionRepository } from '../infrastructure/repositories/position.repository.js';
import { glControlRepository } from '../infrastructure/repositories/gl-control.repository.js';

// Fixture helper — an entitlement row on financial_entitlements.
function ent(orgId: number, over: Partial<any> = {}) {
  return {
    organisation_id: orgId,
    id: Math.floor(Math.random() * 1e6),
    public_id: 'pub',
    entitlement_type: 'ORGANIZATION_EARNING',
    collector: 'courtzon',
    status: 'AVAILABLE',
    settlement_id: null,
    source_type: 'marketplace',
    source_id: 1,
    amount: 100,
    debit: 0, credit: 0, account_id: null,
    ...over,
  };
}

beforeEach(() => {
  captured.length = 0;
  entitlementRowsByOrg.clear();
  glRowsByOrg.clear();
});

describe('Phase 2 Step 1 — PositionService facade', () => {
  it('1. reads ONLY from financial_entitlements (no GL/bookings/orders/legacy tables)', async () => {
    entitlementRowsByOrg.set(10, [ent(10)]);
    await positionService.getOrganisationPositionSummary(10);

    expect(captured.length).toBeGreaterThan(0);
    for (const { sql } of captured) {
      expect(sql.toLowerCase()).toContain('financial_entitlements');
      expect(sql.toLowerCase()).not.toMatch(/general_ledger|ledger_entries|bookings|\borders\b|marketplace_ledger_entries|transactions|settlements\b/);
    }
  });

  it('2. available/pending/held/reserved/settled buckets are calculated correctly', async () => {
    entitlementRowsByOrg.set(20, [
      ent(20, { status: 'PENDING', amount: 100 }),
      ent(20, { status: 'AVAILABLE', amount: 250 }),
      ent(20, { status: 'ON_HOLD', amount: 75, hold_reason: 'dispute' }),                    // held
      ent(20, { status: 'ON_HOLD', amount: 125, settlement_id: 9 }),                         // reserved
      ent(20, { status: 'SETTLED', amount: 400, settlement_id: 8 }),
      ent(20, { status: 'CANCELLED', amount: 999 }),                                          // excluded
    ]);
    const b = await positionService.getStatusBalances(20);
    expect(b.pending).toEqual({ amount: 100, count: 1 });
    expect(b.available).toEqual({ amount: 250, count: 1 });
    expect(b.held).toEqual({ amount: 75, count: 1 });
    expect(b.reserved).toEqual({ amount: 125, count: 1 });
    expect(b.settled).toEqual({ amount: 400, count: 1 });
  });

  it('3. collector-aware positions are correct for CARD vs CASH custody', async () => {
    // Org A — CARD sale: CourtZon collected → owes the org its earning.
    entitlementRowsByOrg.set(30, [
      ent(30, { entitlement_type: 'ORGANIZATION_EARNING', collector: 'courtzon', amount: 900 }),
      ent(30, { entitlement_type: 'COURTZON_COMMISSION', collector: 'courtzon', amount: 100 }),
    ]);
    // Org B — CASH/COD sale: the ORG collected → owes CourtZon its commission.
    entitlementRowsByOrg.set(31, [
      ent(31, { entitlement_type: 'ORGANIZATION_EARNING', collector: 'org', amount: 900 }),      // org keeps own earning — no cross obligation
      ent(31, { entitlement_type: 'COURTZON_COMMISSION', collector: 'org', amount: 100 }),       // receivable from org
    ]);

    const a = await positionService.getOpenPosition(30);
    expect(a.owedToOrg).toBe(900);
    expect(a.owedByOrg).toBe(0);
    expect(a.direction).toBe('PAYABLE_TO_ORGANISATION');

    const b = await positionService.getOpenPosition(31);
    expect(b.owedToOrg).toBe(0);   // cash earning never becomes CourtZon payable
    expect(b.owedByOrg).toBe(100); // commission receivable from the collecting org
    expect(b.direction).toBe('RECEIVABLE_FROM_ORGANISATION');
  });

  it('6. multiple organisations remain isolated (params scoped per org)', async () => {
    entitlementRowsByOrg.set(40, [ent(40, { amount: 700 })]);
    entitlementRowsByOrg.set(41, [ent(41, { amount: 300 })]);

    const s40 = await positionService.getOrganisationPositionSummary(40);
    const s41 = await positionService.getOrganisationPositionSummary(41);

    expect(s40.earnings.lifetime).toBe(700);
    expect(s41.earnings.lifetime).toBe(300);
    // every query was parameterised with exactly one org id
    for (const { params } of captured) {
      const orgParams = params.filter((p) => p === 40 || p === 41);
      expect(orgParams.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('Phase 2 Step 1 — Reconciliation (read-only)', () => {
  function mockMatchingPosition(orgId: number, earning: number, commissionCollectedByOrg = 0) {
    // Entitlement side: payable leg (CourtZon collected card sale)
    entitlementRowsByOrg.set(orgId, [
      ent(orgId, { entitlement_type: 'ORGANIZATION_EARNING', collector: 'courtzon', amount: earning }),
      ...(commissionCollectedByOrg > 0
        ? [ent(orgId, { entitlement_type: 'COURTZON_COMMISSION', collector: 'org', amount: commissionCollectedByOrg })]
        : []),
    ]);
    // GL mirror: credit 2200 by earning (payable), debit 1160 by COD commission receivable,
    // minus a settlement_paid-style debit clearing part of the payable (settled leg excluded from open).
    glRowsByOrg.set(orgId, [
      { organisation_id: orgId, account_id: 27, debit: 0, credit: earning },                        // payable created
      { organisation_id: orgId, account_id: 27, debit: 0, credit: 0 },                              // no-op keeps fingerprint simple
      ...(commissionCollectedByOrg > 0
        ? [{ organisation_id: orgId, account_id: 36, debit: commissionCollectedByOrg, credit: 0 }]  // receivable created at delivery
        : []),
    ]);
  }

  it('4. returns ZERO difference when entitlement and GL positions match', async () => {
    mockMatchingPosition(50, 950);
    const report = await reconciliationService.reconcileOrganisation(50);

    expect(report.reconciled).toBe(true);
    expect(report.difference).toBe(0);
    expect(report.entitlements.payableToOrg).toBe(950);
    expect(report.gl.payableToOrg).toBe(950);
  });

  it('4b. mixed CARD+COD positions net correctly to zero against both control accounts', async () => {
    mockMatchingPosition(51, 950, 100);
    const report = await reconciliationService.reconcileOrganisation(51);
    expect(report.entitlements.net).toBe(850);
    expect(report.gl.net).toBe(850);
    expect(report.difference).toBe(0);
  });

  it('5. exposes drift WITHOUT modifying either source (SELECT-only)', async () => {
    mockMatchingPosition(52, 950);
    // Extra GL credit with NO entitlement counterpart → drift of -500
    glRowsByOrg.get(52)!.push({ organisation_id: 52, account_id: 27, debit: 0, credit: 500 });

    const report = await reconciliationService.reconcileOrganisation(52);

    expect(report.reconciled).toBe(false);
    expect(report.difference).toBe(-500);
    expect(report.sources.length).toBeGreaterThanOrEqual(1); // affected sources listed

    // READ-ONLY proof: only SELECT statements were executed
    expect(captured.every(({ sql }) => /^\s*SELECT/i.test(sql.trim()))).toBe(true);
    expect(captured.some(({ sql }) => /insert|update|delete/i.test(sql))).toBe(false);
  });

  it('7. no legacy ledger is consulted as a position authority', async () => {
    entitlementRowsByOrg.set(60, [ent(60)]);
    glRowsByOrg.set(60, [{ organisation_id: 60, account_id: 27, debit: 0, credit: 100 }]);
    await reconciliationService.reconcileAll({ limit: 10 });
    await positionService.getOrganisationPositionSummary(60);

    const all = captured.map((c) => c.sql.toLowerCase());
    // marketplace_ledger_entries / bookings settled columns / orders financial
    // columns are NEVER queried by either foundation service.
    for (const sql of all) {
      expect(sql).not.toContain('marketplace_ledger_entries');
      expect(sql).not.toContain('from bookings');
      expect(sql).not.toContain('join bookings');
      expect(sql).toMatch(/financial_entitlements|general_ledger|chart_of_accounts|accounting_event_mapping_lines/);
    }
  });
});
