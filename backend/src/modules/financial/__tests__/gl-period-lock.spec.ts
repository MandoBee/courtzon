import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P4-08 — closing the B35 period-lock coverage gap.
 *
 * `glProjectionService` is the last gate before a validated journal reaches
 * `general_ledger`. Its period rules are the single source of truth for every
 * posting path (automatic and manual):
 *   - an organisation's OWN period covering the date is authoritative — even
 *     when closed, so the caller rejects the posting with a meaningful error;
 *   - an org without its own period falls back to the platform period
 *     (open preferred) for backward compatibility;
 *   - platform postings never consult an org period;
 *   - another organisation's period is never returned;
 *   - no covering period at all is a hard error, never a silent NULL period.
 *
 * These tests exercise the real service against a mocked pool, so the SQL
 * scoping (org id / platform) and the open/closed boundary are both asserted.
 */

const db = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: db.execute }),
  closePool: vi.fn(),
}));

import { glProjectionService } from '../application/gl-projection.service.js';

const BUSINESS_DATE = '2026-10-27';
const ORG_ID = 77;

type Row = { id: number; status: string };

function mockExecute(handlers: {
  org?: Row[];
  platform?: Row[];
  open?: Row[];
}) {
  db.execute.mockImplementation(async (sql: string, params: unknown[]) => {
    if (/organisation_id = \?/.test(sql) && /start_date/.test(sql)) {
      return [handlers.org ?? [], []];
    }
    if (/organisation_id IS NULL/.test(sql) && /start_date/.test(sql)) {
      return [handlers.platform ?? [], []];
    }
    if (/FROM accounting_periods WHERE id = \?/.test(sql)) {
      return [handlers.open ?? [], []];
    }
    throw new Error(`unexpected SQL in period test: ${sql} :: ${JSON.stringify(params)}`);
  });
}

function callsMatching(re: RegExp): Array<{ sql: string; params: unknown[] }> {
  return db.execute.mock.calls
    .filter(([sql]) => re.test(String(sql)))
    .map(([sql, params]) => ({ sql: String(sql), params: (params ?? []) as unknown[] }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExecute({});
});

describe('P4-08 GL period resolution — organisation scope', () => {
  it('returns the organisation period covering the date, even when it is closed (caller must reject)', async () => {
    mockExecute({ org: [{ id: 501, status: 'closed' }], platform: [{ id: 1, status: 'open' }] });

    const period = await glProjectionService.resolvePostingPeriod(BUSINESS_DATE, ORG_ID);

    // The org book is authoritative: the platform period is NOT substituted.
    expect(period).toEqual({ id: 501, status: 'closed' });
    const orgCalls = callsMatching(/organisation_id = \?/);
    expect(orgCalls).toHaveLength(1);
    expect(orgCalls[0].params).toEqual([BUSINESS_DATE, ORG_ID]);
    expect(callsMatching(/organisation_id IS NULL/)).toHaveLength(0);
  });

  it('rejects posting into a closed organisation period', async () => {
    mockExecute({ org: [{ id: 501, status: 'closed' }] });

    await expect(glProjectionService.resolvePeriod(BUSINESS_DATE, ORG_ID))
      .rejects.toThrow(/period 501 is not open/i);
    // Never falls back to an open platform period once the org period exists.
    expect(callsMatching(/organisation_id IS NULL/)).toHaveLength(0);
  });

  it('an open organisation period is accepted', async () => {
    mockExecute({ org: [{ id: 502, status: 'open' }] });
    await expect(glProjectionService.resolvePeriod(BUSINESS_DATE, ORG_ID)).resolves.toBe(502);
  });

  it('an org without its own period falls back to the platform period (backward compatibility)', async () => {
    mockExecute({ org: [], platform: [{ id: 9, status: 'open' }] });

    const period = await glProjectionService.resolvePostingPeriod(BUSINESS_DATE, ORG_ID);

    expect(period).toEqual({ id: 9, status: 'open' });
    expect(callsMatching(/organisation_id = \?/)).toHaveLength(1); // org checked first
    const platformCalls = callsMatching(/organisation_id IS NULL/);
    expect(platformCalls).toHaveLength(1);
    expect(platformCalls[0].params).toEqual([BUSINESS_DATE]);
    // Open platform period preferred by SQL ordering (closed only as last resort).
    expect(platformCalls[0].sql).toContain("ORDER BY (status = 'open') DESC");
  });

  it('a closed platform fallback is returned for a precise rejection (boundary)', async () => {
    mockExecute({ org: [], platform: [{ id: 9, status: 'closed' }] });

    await expect(glProjectionService.resolvePostingPeriod(BUSINESS_DATE, ORG_ID))
      .resolves.toEqual({ id: 9, status: 'closed' });
    await expect(glProjectionService.resolvePeriod(BUSINESS_DATE, ORG_ID))
      .rejects.toThrow(/period 9 is not open/i);
  });
});

describe('P4-08 GL period resolution — platform scope and missing periods', () => {
  it('a platform posting never consults an organisation period', async () => {
    mockExecute({ org: [{ id: 501, status: 'open' }], platform: [{ id: 1, status: 'open' }] });

    const period = await glProjectionService.resolvePostingPeriod(BUSINESS_DATE, null);

    expect(period.id).toBe(1);
    expect(callsMatching(/organisation_id = \?/)).toHaveLength(0);
    expect(callsMatching(/organisation_id IS NULL/)).toHaveLength(1);
  });

  it('throws when no period covers the date (never posts with a NULL period)', async () => {
    mockExecute({ org: [], platform: [] });

    await expect(glProjectionService.resolvePostingPeriod(BUSINESS_DATE, ORG_ID))
      .rejects.toThrow(/No accounting period found/i);
    await expect(glProjectionService.resolvePeriod(BUSINESS_DATE, null))
      .rejects.toThrow(/No accounting period found/i);
  });

  it('validateOpenPeriod accepts only an OPEN period id', async () => {
    mockExecute({ open: [{ id: 10, status: 'open' }] });
    await expect(glProjectionService.validateOpenPeriod(10)).resolves.toBeUndefined();
    expect(callsMatching(/FROM accounting_periods WHERE id = \?/)[0].params).toEqual([10]);

    mockExecute({ open: [] });
    await expect(glProjectionService.validateOpenPeriod(10)).rejects.toThrow(/period 10 is not open/i);
  });

  it('org isolation: the org query is bound to the requested organisation only', async () => {
    mockExecute({ org: [], platform: [{ id: 1, status: 'open' }] });

    await glProjectionService.resolvePostingPeriod(BUSINESS_DATE, 1234);

    const orgCalls = callsMatching(/organisation_id = \?/);
    expect(orgCalls[0].params).toEqual([BUSINESS_DATE, 1234]);
    // A different org's period is never fetched or returned by this path.
    for (const call of orgCalls) {
      expect(call.params[1]).toBe(1234);
    }
  });
});
