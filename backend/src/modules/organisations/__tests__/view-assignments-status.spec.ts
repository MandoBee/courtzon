import { describe, it, expect, vi, beforeEach } from 'vitest';

// Scripted pool: feeds the Padel Edge history rows to the listing query.
const scriptedRows: any[] = [];

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: async () => [scriptedRows, []],
  }),
}));

import { OrganisationRepository } from '../infrastructure/repositories/organisation.repository.js';
import { deriveEffectiveStatus } from '../../../shared/utils/subscription-validator.js';

const repo = new OrganisationRepository();
const getAllOrganisationSubscriptions = () => repo.getAllOrganisationSubscriptions();

type Row = Record<string, any>;

function padelRow(overrides: Row): Row {
  return {
    org_id: 6,
    org_name: 'Padel Edge',
    subscription_id: overrides.id,
    plan_name: 'Promo Club',
    billing_cycle: 'monthly',
    is_unlimited: 0,
    ...overrides,
  };
}

/** The two live records from the incident report. */
const OLD_PERIOD: Row = padelRow({
  id: 20,
  subscription_status: 'expired',
  start_date: '2026-07-17',
  end_date: '2026-08-17',
});

const RENEWED_PERIOD: Row = padelRow({
  id: 21,
  subscription_status: 'active',
  start_date: '2026-08-18',
  end_date: '2026-09-18',
});

/** Mirrors frontend/utils/subscription-status.ts label mapping. */
function label(status: string | null | undefined): string {
  const map: Record<string, string> = {
    active: 'Active', suspended: 'Suspended', pending: 'Pending',
    expired: 'Expired', cancelled: 'Cancelled',
  };
  return map[status ?? ''] ?? 'No Subscription';
}

describe('View Assignments uses the canonical status derivation', () => {
  beforeEach(() => {
    scriptedRows.length = 0;
  });

  it('old Padel Edge period (17/07 → 17/08) resolves to Expired', async () => {
    scriptedRows.push(OLD_PERIOD);
    const rows = await getAllOrganisationSubscriptions();
    expect(rows).toHaveLength(1);
    expect(rows[0].effective_status).toBe('expired');
    expect(label(rows[0].effective_status)).toBe('Expired');
  });

  it('renewed Padel Edge period (18/08 → 18/09) resolves to Active — never Expired', async () => {
    scriptedRows.push(RENEWED_PERIOD);
    const rows = await getAllOrganisationSubscriptions();
    expect(rows[0].effective_status).toBe('active');
    expect(label(rows[0].effective_status)).toBe('Active');
  });

  it('listing shows BOTH records with their own statuses (history preserved)', async () => {
    scriptedRows.push(OLD_PERIOD, RENEWED_PERIOD);
    const rows = await getAllOrganisationSubscriptions();
    expect(rows.map((r: any) => r.effective_status)).toEqual(['expired', 'active']);
  });

  it('parity: every listed status equals the canonical derivation used by the resolver', async () => {
    scriptedRows.push(OLD_PERIOD, RENEWED_PERIOD);
    const rows = await getAllOrganisationSubscriptions();
    for (const row of rows as any[]) {
      // deriveEffectiveStatus is THE function CurrentSubscriptionService uses
      // for its effectiveStatus — one calculation, zero drift.
      expect(row.effective_status).toBe(deriveEffectiveStatus(row));
      expect(row.effective_status).toBe(
        deriveEffectiveStatus({ subscription_status: row.subscription_status, end_date: row.end_date }),
      );
    }
    const [oldRes, renewedRes] = rows as any[];
    expect(oldRes.effective_status).toBe(deriveEffectiveStatus(OLD_PERIOD));
    expect(renewedRes.effective_status).toBe(deriveEffectiveStatus(RENEWED_PERIOD));
    expect(label(oldRes.effective_status)).not.toBe(label(renewedRes.effective_status));
  });

  it('a stored-active row whose end_date passed is Expired in BOTH listing and resolver (no drift)', async () => {
    const staleActive = padelRow({ id: 30, subscription_status: 'active', start_date: '2026-07-01', end_date: '2026-08-01' });
    scriptedRows.push(staleActive);
    const rows = await getAllOrganisationSubscriptions();
    expect(rows[0].effective_status).toBe('expired');
    expect(deriveEffectiveStatus(staleActive)).toBe('expired');
  });
});
