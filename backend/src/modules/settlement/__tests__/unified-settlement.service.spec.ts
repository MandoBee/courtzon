import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Unit-test the orchestration of unifiedSettlementService with mocked
// repository + entitlement service, so we can assert reservation/finalization/
// release and idempotency without a live DB.

const { unifiedSettlementService } = await import('../application/unified-settlement.service.js');
const { unifiedSettlementRepository } = await import('../infrastructure/repositories/unified-settlement.repository.js');
const { financialEntitlementService } = await import('../../financial/application/financial-entitlement.service.js');
const { eventBusV2 } = await import('../../../shared/event-bus/index.js');
const { getPool } = await import('../../../database/mysql.js');

const mkEnt = (overrides: any) => ({
  id: overrides.id,
  public_id: `p-${overrides.id}`,
  organisation_id: overrides.organisationId ?? 1,
  branch_id: null,
  entitlement_type: overrides.entitlementType,
  source_type: 'marketplace',
  source_id: overrides.sourceId ?? overrides.id,
  collector: overrides.collector,
  amount: overrides.amount,
  currency: 'EGP',
  status: 'AVAILABLE',
  hold_reason: null,
  cancelled_reason: null,
  available_at: new Date().toISOString(),
  settled_at: null,
  settled_by: null,
  settlement_id: null,
  description: null,
  metadata: null,
  aggregate_version: 1,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

describe('Unified Settlement Service — orchestration', () => {
  let conn: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Keep the event-bus emit mocked so no outbox DB write happens in tests.
    vi.spyOn(eventBusV2, 'emit').mockResolvedValue(undefined as any);
    // Mock getPool().execute so the internal entitlement-detail fetch returns empty (no live DB).
    const pool = getPool();
    vi.spyOn(pool, 'execute').mockResolvedValue([[], []] as any);
    conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
  });

  it('create defaults to all eligible entitlements and reserves them (ON_HOLD)', async () => {
    const ents = [
      mkEnt({ id: 1, entitlementType: 'ORGANIZATION_EARNING', amount: 900, collector: 'courtzon' }),
      mkEnt({ id: 2, entitlementType: 'COURTZON_COMMISSION', amount: 100, collector: 'courtzon' }),
    ];
    vi.spyOn(financialEntitlementService, 'getAvailableForOrganisation').mockResolvedValue(ents);
    vi.spyOn(financialEntitlementService, 'reserveForSettlement').mockResolvedValue(undefined);
    vi.spyOn(financialEntitlementService, 'finalizeSettled').mockResolvedValue(undefined);
    vi.spyOn(financialEntitlementService, 'releaseFromSettlement').mockResolvedValue(undefined);
    vi.spyOn(unifiedSettlementRepository, 'create').mockResolvedValue(101);
    vi.spyOn(unifiedSettlementRepository, 'linkEntitlements').mockResolvedValue(undefined);
    vi.spyOn(unifiedSettlementRepository, 'findEntitlementIds').mockResolvedValue([1, 2]);
    vi.spyOn(unifiedSettlementRepository, 'findBySettlementId').mockResolvedValue({ id: 101, organisation_id: 1, settlement_status: 'requested', aggregate_version: 1, final_amount: 900, settlement_direction: 'courtzon_to_org' });

    const { getPool } = await import('../../../database/mysql.js');
    vi.spyOn(getPool(), 'getConnection').mockResolvedValue(conn);

    const detail = await unifiedSettlementService.create({ orgId: 1, requestedBy: 9, requestedByRole: 'admin' });

    expect(unifiedSettlementRepository.create).toHaveBeenCalledTimes(1);
    const createArg = (unifiedSettlementRepository.create as any).mock.calls[0][0];
    expect(createArg.organizationPosition).toBe(0);
    expect(createArg.courtzonPosition).toBe(900);
    expect(createArg.direction).toBe('COURTZON_TO_ORGANIZATION');
    expect(createArg.finalAmount).toBe(900);
    expect(financialEntitlementService.reserveForSettlement).toHaveBeenCalledWith([1, 2], 101, conn);
    expect(unifiedSettlementRepository.linkEntitlements).toHaveBeenCalledWith(101, [1, 2], conn);
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
  });

  it('create with explicit selection validates eligibility', async () => {
    const ents = [mkEnt({ id: 1, entitlementType: 'ORGANIZATION_EARNING', amount: 900, collector: 'courtzon' })];
    vi.spyOn(financialEntitlementService, 'getAvailableForOrganisation').mockResolvedValue(ents);
    vi.spyOn(unifiedSettlementRepository, 'create').mockResolvedValue(1);
    const { getPool } = await import('../../../database/mysql.js');
    vi.spyOn(getPool(), 'getConnection').mockResolvedValue(conn);

    await expect(unifiedSettlementService.create({ orgId: 1, selectedEntitlementIds: [999], requestedBy: 9, requestedByRole: 'admin' }))
      .rejects.toThrow(/not eligible/);
    expect(unifiedSettlementRepository.create).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalled();
  });

  it('create fails when no entitlements are eligible', async () => {
    vi.spyOn(financialEntitlementService, 'getAvailableForOrganisation').mockResolvedValue([]);
    const { getPool } = await import('../../../database/mysql.js');
    vi.spyOn(getPool(), 'getConnection').mockResolvedValue(conn);
    await expect(unifiedSettlementService.create({ orgId: 1, requestedBy: 9, requestedByRole: 'admin' }))
      .rejects.toThrow(/No eligible/);
    expect(conn.rollback).toHaveBeenCalled();
  });

  it('recordPayment finalizes entitlements as SETTLED and records payment', async () => {
    const { getPool } = await import('../../../database/mysql.js');
    vi.spyOn(getPool(), 'getConnection').mockResolvedValue(conn);
    vi.spyOn(unifiedSettlementRepository, 'findBySettlementId').mockResolvedValue({ id: 5, organisation_id: 1, settlement_status: 'requested', aggregate_version: 1, final_amount: 600, settlement_direction: 'courtzon_to_org' });
    vi.spyOn(unifiedSettlementRepository, 'findEntitlementIds').mockResolvedValue([1, 2]);
    vi.spyOn(financialEntitlementService, 'finalizeSettled').mockResolvedValue(undefined);
    vi.spyOn(unifiedSettlementRepository, 'persistTransition').mockResolvedValue(undefined);

    const detail = await unifiedSettlementService.recordPayment(5, { paymentMethod: 'bank_transfer', paymentReference: 'REF-1', paidBy: 9 });
    expect(financialEntitlementService.finalizeSettled).toHaveBeenCalledWith([1, 2], 5, 9, conn);
    const transitionExtra = (unifiedSettlementRepository.persistTransition as any).mock.calls[0][3];
    expect(transitionExtra.payment_reference).toBe('REF-1');
    expect(transitionExtra.paid_amount).toBe(600);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('recordPayment on already-completed settlement is idempotent (no double finalize)', async () => {
    const { getPool } = await import('../../../database/mysql.js');
    vi.spyOn(getPool(), 'getConnection').mockResolvedValue(conn);
    vi.spyOn(unifiedSettlementRepository, 'findBySettlementId').mockResolvedValue({ id: 5, organisation_id: 1, settlement_status: 'completed', aggregate_version: 1, final_amount: 600, settlement_direction: 'courtzon_to_org' });
    vi.spyOn(financialEntitlementService, 'finalizeSettled').mockResolvedValue(undefined);
    vi.spyOn(unifiedSettlementRepository, 'persistTransition').mockResolvedValue(undefined);

    await unifiedSettlementService.recordPayment(5, { paymentMethod: 'bank_transfer', paidBy: 9 });
    expect(financialEntitlementService.finalizeSettled).not.toHaveBeenCalled();
    expect(unifiedSettlementRepository.persistTransition).not.toHaveBeenCalled();
  });

  it('cancel releases reserved entitlements back to AVAILABLE', async () => {
    const { getPool } = await import('../../../database/mysql.js');
    vi.spyOn(getPool(), 'getConnection').mockResolvedValue(conn);
    vi.spyOn(unifiedSettlementRepository, 'findBySettlementId').mockResolvedValue({ id: 7, organisation_id: 1, settlement_status: 'requested', aggregate_version: 1 });
    vi.spyOn(unifiedSettlementRepository, 'findEntitlementIds').mockResolvedValue([1, 2]);
    vi.spyOn(financialEntitlementService, 'releaseFromSettlement').mockResolvedValue(undefined);
    vi.spyOn(unifiedSettlementRepository, 'persistTransition').mockResolvedValue(undefined);

    await unifiedSettlementService.cancel(7, 9, 'changed mind');
    expect(financialEntitlementService.releaseFromSettlement).toHaveBeenCalledWith([1, 2], 7, conn);
    expect((unifiedSettlementRepository.persistTransition as any).mock.calls[0][1]).toBe('cancelled');
  });

  it('cancel on completed settlement is rejected', async () => {
    const { getPool } = await import('../../../database/mysql.js');
    vi.spyOn(getPool(), 'getConnection').mockResolvedValue(conn);
    vi.spyOn(unifiedSettlementRepository, 'findBySettlementId').mockResolvedValue({ id: 7, organisation_id: 1, settlement_status: 'completed', aggregate_version: 1 });
    await expect(unifiedSettlementService.cancel(7, 9)).rejects.toThrow(/cannot cancel/i);
  });
});