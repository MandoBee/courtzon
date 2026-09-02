import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

/**
 * Organisation settlement parity + scoping.
 *
 * The organisation "Outstanding / Available to Settle" projection and the
 * org settlement request are SCOPED VIEWS of the SAME canonical unified
 * settlement service Super Admin uses:
 *   - GET  /org/:orgId/settlements/outstanding  → unifiedSettlementService.preview(routeOrgId)
 *   - POST /org/:orgId/settlements             → unifiedSettlementService.create({ orgId: routeOrgId, ... })
 * The orgId comes EXCLUSIVELY from the route (guarded server-side by
 * requireOrganisationAccess); a client-supplied organisationId is never used.
 * The admin preview handler and the org outstanding handler call the SAME
 * preview(orgId) — parity by construction.
 */

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn() }));

vi.mock('../../settlement/application/unified-settlement.service.js', () => ({
  unifiedSettlementService: {
    preview: vi.fn(), create: vi.fn(),
  },
}));

vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));

vi.mock('../../../shared/middleware/org-access.js', () => ({
  isPlatformAdmin: vi.fn().mockResolvedValue(true),
  canAccessOrganisation: vi.fn().mockResolvedValue(true),
  findAccessibleOrgIds: vi.fn(),
}));

import { unifiedSettlementService as svc } from '../../settlement/application/unified-settlement.service.js';
import { recordAudit } from '../../audit-log/index.js';
import {
  getOrgSettlementsOutstandingHandler,
  createOrgSettlementHandler,
} from '../presentation/org-portal.controller.js';

const mockReply = () => ({
  send: vi.fn((x) => x),
  status: vi.fn(() => ({ send: vi.fn((x) => x) })),
});

const mkReq = (params: any = {}, body: any = {}, query: any = {}) => ({
  userId: 7,
  params,
  body,
  query,
  headers: {},
  ip: '10.0.0.1',
} as any);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('org settlement outstanding — canonical parity & scoping', () => {
  it('passes the ROUTE orgId to the same canonical preview the Super Admin uses', async () => {
    (svc.preview as any).mockResolvedValue({ entitlements: [], financials: {}, financialsAll: {} });

    await getOrgSettlementsOutstandingHandler(mkReq({ orgId: '77' }), mockReply());

    expect(svc.preview).toHaveBeenCalledWith(77);
  });

  it('never reads orgId from query/body (route is authoritative)', async () => {
    (svc.preview as any).mockResolvedValue({ entitlements: [], financials: {}, financialsAll: {} });

    await getOrgSettlementsOutstandingHandler(mkReq({ orgId: '77' }, { organisationId: 999 }), mockReply());

    expect(svc.preview).toHaveBeenCalledWith(77);
    expect(svc.preview).not.toHaveBeenCalledWith(999);
  });

  it('organisation A requesting org B via route still targets org B only through the guard path (orgId from route)', async () => {
    // The handler is only reachable after requireOrganisationAccess; when an
    // authorised call hits it, the orgId it passes is the ROUTE orgId — never a
    // spoofed body value.
    (svc.preview as any).mockResolvedValue({ entitlements: [], financials: {}, financialsAll: {} });

    await getOrgSettlementsOutstandingHandler(mkReq({ orgId: '88' }, { organisationId: 77 }), mockReply());

    expect(svc.preview).toHaveBeenCalledWith(88);
  });

  it('Super Admin preview and org outstanding use the same canonical preview function (parity)', async () => {
    const { previewSettlementHandler } = await import('../../settlement/presentation/unified-settlement.controller.js');
    (svc.preview as any).mockResolvedValue({ entitlements: [], financials: {}, financialsAll: {} });

    await previewSettlementHandler(mkReq({}, {}, { orgId: '77' }), mockReply());
    expect(svc.preview).toHaveBeenCalledTimes(1);

    await getOrgSettlementsOutstandingHandler(mkReq({ orgId: '77' }), mockReply());
    expect(svc.preview).toHaveBeenCalledTimes(2);
    // Both handlers delegate to the IDENTICAL canonical computation for org 77
    // (Super Admin passes the query string, org route passes the integer — the
    // same function, same organisation, same result).
    expect(Number(svc.preview.mock.calls[0][0])).toBe(77);
    expect(Number(svc.preview.mock.calls[1][0])).toBe(77);
  });
});

describe('org settlement create — canonical & org-scoped', () => {
  it('forces ROUTE orgId into the canonical create (body orgId never trusted)', async () => {
    (svc.create as any).mockResolvedValue({ settlement: { id: 50, net_amount: 900, settlement_direction: 'courtzon_to_org' }, entitlements: [], financials: {} });

    await createOrgSettlementHandler(mkReq({ orgId: '77' }, { organisationId: 999, notes: 'n' }), mockReply());

    expect(svc.create).toHaveBeenCalledWith(expect.objectContaining({ orgId: 77, requestedBy: 7, requestedByRole: 'org', notes: 'n' }));
    expect(svc.create).not.toHaveBeenCalledWith(expect.objectContaining({ orgId: 999 }));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'SETTLEMENT.CREATE', entityId: 50 }));
  });

  it('forwards exclusions/selection without letting the client choose an amount', async () => {
    (svc.create as any).mockResolvedValue({ settlement: { id: 51 }, entitlements: [], financials: {} });

    await createOrgSettlementHandler(mkReq({ orgId: '77' }, { excludeEntitlementIds: [1, 2], selectedEntitlementIds: [3], notes: 'n' }), mockReply());

    expect(svc.create).toHaveBeenCalledWith(expect.objectContaining({ orgId: 77, excludeEntitlementIds: [1, 2], selectedEntitlementIds: [3], notes: 'n' }));
    // No amount may be supplied by the client — the canonical service computes it.
    expect(svc.create.mock.calls[0][0].amount).toBeUndefined();
  });
});