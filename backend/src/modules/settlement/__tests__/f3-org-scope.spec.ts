import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * F-3 — Unified Settlement organisation-scope & isolation.
 *
 * GET /unified-settlements/:id
 * GET /unified-settlements
 * POST /unified-settlements/:id/pay
 * POST /unified-settlements/:id/cancel
 * GET /unified-settlements/export
 *
 * must all enforce organisation scope:
 *   - platform admin  → unrestricted
 *   - org-authorized  → only authorised orgs
 *   - unauthorised    → 403 (or empty scoped result)
 * The organisation is resolved from the canonical settlement record, never from
 * a client-supplied id.
 */

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn() }));

vi.mock('../application/unified-settlement.service.js', () => ({
  unifiedSettlementService: {
    preview: vi.fn(), create: vi.fn(), get: vi.fn(),
    recordPayment: vi.fn(), cancel: vi.fn(), list: vi.fn(), listForExport: vi.fn(),
  },
}));

vi.mock('../infrastructure/repositories/unified-settlement.repository.js', () => ({
  unifiedSettlementRepository: {
    findBySettlementId: vi.fn(),
  },
}));

vi.mock('../../../shared/middleware/org-access.js', () => ({
  isPlatformAdmin: vi.fn(),
  canAccessOrganisation: vi.fn(),
  findAccessibleOrgIds: vi.fn(),
}));

vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));

import { unifiedSettlementService as svc } from '../application/unified-settlement.service.js';
import { unifiedSettlementRepository } from '../infrastructure/repositories/unified-settlement.repository.js';
import { isPlatformAdmin, canAccessOrganisation, findAccessibleOrgIds } from '../../../shared/middleware/org-access.js';
import {
  getSettlementHandler, recordSettlementPaymentHandler, cancelSettlementHandler,
  listSettlementsHandler, exportSettlementsHandler,
} from '../presentation/unified-settlement.controller.js';

const mockReply = () => ({
  send: vi.fn((x) => x),
  status: vi.fn(() => ({ send: vi.fn() })),
  header: vi.fn(() => mockReply()),
});

const mkReq = (userId: number, params: any = {}, query: any = {}, body: any = {}) => ({
  userId,
  params,
  query,
  body,
} as any);

const mkSettlement = (overrides: any = {}) => ({
  id: 1,
  organisation_id: 77,
  settlement_status: 'requested',
  aggregate_version: 1,
  final_amount: 900,
  settlement_direction: 'courtzon_to_org',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('F-3 — settlement detail org scope', () => {
  it('platform admin can view any settlement', async () => {
    (isPlatformAdmin as any).mockResolvedValue(true);
    (unifiedSettlementRepository.findBySettlementId as any).mockResolvedValue(mkSettlement());
    (svc.get as any).mockResolvedValue({ settlement: mkSettlement(), entitlements: [], financials: {} });

    await getSettlementHandler(mkReq(1, { id: '10' }), mockReply());

    expect(svc.get).toHaveBeenCalledWith(10);
  });

  it('authorised organisation user can view own settlement', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    (canAccessOrganisation as any).mockResolvedValue(true);
    (unifiedSettlementRepository.findBySettlementId as any).mockResolvedValue(mkSettlement({ id: 7 }));
    (svc.get as any).mockResolvedValue({ settlement: mkSettlement({ id: 7 }), entitlements: [], financials: {} });

    await getSettlementHandler(mkReq(9, { id: '7' }), mockReply());

    expect(canAccessOrganisation).toHaveBeenCalledWith(9, 77);
    expect(svc.get).toHaveBeenCalledWith(7);
  });

  it('unauthorised organisation user receives 403 on another org settlement', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    (canAccessOrganisation as any).mockResolvedValue(false);
    (unifiedSettlementRepository.findBySettlementId as any).mockResolvedValue(mkSettlement({ id: 7, organisation_id: 88 }));

    const reply = mockReply();
    await expect(getSettlementHandler(mkReq(9, { id: '7' }), reply)).rejects.toThrow('Access to this organisation denied');
    expect(svc.get).not.toHaveBeenCalled();
  });

  it('returns 404 when the settlement does not exist (no access leak)', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    (unifiedSettlementRepository.findBySettlementId as any).mockResolvedValue(null);

    const reply = mockReply();
    await expect(getSettlementHandler(mkReq(9, { id: '404' }), reply)).rejects.toThrow('Settlement not found');
    expect(svc.get).not.toHaveBeenCalled();
  });

  it('never trusts a client-supplied org id for an existing settlement', async () => {
    // Settlement belongs to org 88 regardless of any client hint; actor only
    // authorised for org 77 → denied.
    (isPlatformAdmin as any).mockResolvedValue(false);
    (canAccessOrganisation as any).mockResolvedValue(false);
    (unifiedSettlementRepository.findBySettlementId as any).mockResolvedValue(mkSettlement({ organisation_id: 88 }));

    await expect(getSettlementHandler(mkReq(9, { id: '1' }, {}, { organisationId: 77 }), mockReply()))
      .rejects.toThrow('Access to this organisation denied');
    expect(svc.get).not.toHaveBeenCalled();
  });
});

describe('F-3 — settlement pay org scope', () => {
  it('platform admin can pay a settlement', async () => {
    (isPlatformAdmin as any).mockResolvedValue(true);
    (unifiedSettlementRepository.findBySettlementId as any).mockResolvedValue(mkSettlement());
    (svc.recordPayment as any).mockResolvedValue({ settlement: mkSettlement(), entitlements: [], financials: {} });

    await recordSettlementPaymentHandler(mkReq(1, { id: '5' }, {}, { paymentMethod: 'bank_transfer' }), mockReply());

    expect(svc.recordPayment).toHaveBeenCalledWith(5, expect.objectContaining({ paymentMethod: 'bank_transfer', paidBy: 1 }));
  });

  it('authorised organisation user can pay own settlement', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    (canAccessOrganisation as any).mockResolvedValue(true);
    (unifiedSettlementRepository.findBySettlementId as any).mockResolvedValue(mkSettlement());
    (svc.recordPayment as any).mockResolvedValue({ settlement: mkSettlement(), entitlements: [], financials: {} });

    await recordSettlementPaymentHandler(mkReq(9, { id: '5' }, {}, {}), mockReply());

    expect(canAccessOrganisation).toHaveBeenCalledWith(9, 77);
    expect(svc.recordPayment).toHaveBeenCalled();
  });

  it('unauthorised organisation cannot pay another org settlement', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    (canAccessOrganisation as any).mockResolvedValue(false);
    (unifiedSettlementRepository.findBySettlementId as any).mockResolvedValue(mkSettlement({ organisation_id: 88 }));

    await expect(recordSettlementPaymentHandler(mkReq(9, { id: '5' }, {}, {}), mockReply()))
      .rejects.toThrow('Access to this organisation denied');
    expect(svc.recordPayment).not.toHaveBeenCalled();
  });
});

describe('F-3 — settlement cancel org scope', () => {
  it('platform admin can cancel a settlement', async () => {
    (isPlatformAdmin as any).mockResolvedValue(true);
    (unifiedSettlementRepository.findBySettlementId as any).mockResolvedValue(mkSettlement());
    (svc.cancel as any).mockResolvedValue({ settlement: mkSettlement(), entitlements: [], financials: {} });

    await cancelSettlementHandler(mkReq(1, { id: '6' }, {}, { reason: 'admin cancel' }), mockReply());

    expect(svc.cancel).toHaveBeenCalledWith(6, 1, 'admin cancel');
  });

  it('authorised organisation user can cancel own settlement', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    (canAccessOrganisation as any).mockResolvedValue(true);
    (unifiedSettlementRepository.findBySettlementId as any).mockResolvedValue(mkSettlement());
    (svc.cancel as any).mockResolvedValue({ settlement: mkSettlement(), entitlements: [], financials: {} });

    await cancelSettlementHandler(mkReq(9, { id: '6' }, {}, {}), mockReply());

    expect(canAccessOrganisation).toHaveBeenCalledWith(9, 77);
    expect(svc.cancel).toHaveBeenCalled();
  });

  it('unauthorised organisation cannot cancel another org settlement', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    (canAccessOrganisation as any).mockResolvedValue(false);
    (unifiedSettlementRepository.findBySettlementId as any).mockResolvedValue(mkSettlement({ organisation_id: 88 }));

    await expect(cancelSettlementHandler(mkReq(9, { id: '6' }, {}, {}), mockReply()))
      .rejects.toThrow('Access to this organisation denied');
    expect(svc.cancel).not.toHaveBeenCalled();
  });
});

describe('F-3 — settlement list org scope', () => {
  it('platform admin list is unrestricted (all organisations)', async () => {
    (isPlatformAdmin as any).mockResolvedValue(true);
    (svc.list as any).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

    await listSettlementsHandler(mkReq(1, {}, { page: 1, limit: 20 }), mockReply());

    expect(svc.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20, orgId: undefined }));
    expect(findAccessibleOrgIds).not.toHaveBeenCalled();
  });

  it('authorised org user lists only their authorised organisations', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    (findAccessibleOrgIds as any).mockResolvedValue([77, 88]);
    (svc.list as any).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

    await listSettlementsHandler(mkReq(9, {}, { page: 1, limit: 20 }), mockReply());

    expect(svc.list).toHaveBeenCalledWith(expect.objectContaining({ orgIds: [77, 88] }));
  });

  it('multi-org user lists settlements across ALL authorised organisations', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    (findAccessibleOrgIds as any).mockResolvedValue([10, 20, 30]);
    (svc.list as any).mockResolvedValue({ data: [{ id: 1, organisation_id: 10 }], total: 1, page: 1, limit: 20 });

    await listSettlementsHandler(mkReq(9, {}, { page: 1, limit: 20 }), mockReply());

    expect(svc.list).toHaveBeenCalledWith(expect.objectContaining({ orgIds: [10, 20, 30] }));
  });

  it('org user with no authorised orgs gets an empty scoped result', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    (findAccessibleOrgIds as any).mockResolvedValue([]);

    await listSettlementsHandler(mkReq(9, {}, { page: 1, limit: 20 }), mockReply());

    expect(svc.list).toHaveBeenCalledWith(expect.objectContaining({ orgIds: [] }));
  });

  it('client orgId filter is honoured only when the caller is authorised for it', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    (findAccessibleOrgIds as any).mockResolvedValue([77]);
    (svc.list as any).mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

    await listSettlementsHandler(mkReq(9, {}, { page: 1, limit: 20, orgId: 77 }), mockReply());
    expect(svc.list).toHaveBeenCalledWith(expect.objectContaining({ orgIds: [77] }));
  });

  it('client orgId for an unauthorised org is excluded (returns empty intersection)', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    (findAccessibleOrgIds as any).mockResolvedValue([77]);

    await listSettlementsHandler(mkReq(9, {}, { page: 1, limit: 20, orgId: 88 }), mockReply());

    expect(svc.list).toHaveBeenCalledWith(expect.objectContaining({ orgIds: [] }));
  });
});

describe('F-3 — export org scope', () => {
  it('platform admin export is unrestricted', async () => {
    (isPlatformAdmin as any).mockResolvedValue(true);
    (svc.listForExport as any).mockResolvedValue([]);

    await exportSettlementsHandler(mkReq(1, {}, { page: 1, limit: 20 }), mockReply());

    expect(svc.listForExport).toHaveBeenCalledWith(expect.objectContaining({ orgId: undefined }));
  });

  it('org user export is scoped to authorised organisations', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    (findAccessibleOrgIds as any).mockResolvedValue([77, 88]);
    (svc.listForExport as any).mockResolvedValue([]);

    await exportSettlementsHandler(mkReq(9, {}, { page: 1, limit: 20 }), mockReply());

    expect(svc.listForExport).toHaveBeenCalledWith(expect.objectContaining({ orgIds: [77, 88] }));
  });
});

describe('F-3 — cross-organisation attack scenario', () => {
  it('GET + PAY + CANCEL on another org settlement all 403 and never reach the service', async () => {
    const settlementB = mkSettlement({ id: 99, organisation_id: 88 });
    (isPlatformAdmin as any).mockResolvedValue(false);
    (canAccessOrganisation as any).mockResolvedValue(false);
    (unifiedSettlementRepository.findBySettlementId as any).mockResolvedValue(settlementB);

    // Actor authorised only for org A (77); settlement belongs to org B (88).
    await expect(getSettlementHandler(mkReq(9, { id: '99' }), mockReply())).rejects.toThrow('Access to this organisation denied');
    await expect(recordSettlementPaymentHandler(mkReq(9, { id: '99' }, {}, {}), mockReply())).rejects.toThrow('Access to this organisation denied');
    await expect(cancelSettlementHandler(mkReq(9, { id: '99' }, {}, {}), mockReply())).rejects.toThrow('Access to this organisation denied');

    // No financial operation was reached — settlement/entitlement/GL untouched.
    expect(svc.get).not.toHaveBeenCalled();
    expect(svc.recordPayment).not.toHaveBeenCalled();
    expect(svc.cancel).not.toHaveBeenCalled();
    expect(svc.list).not.toHaveBeenCalled();
  });
});