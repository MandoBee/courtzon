// ============================================================================
// LAYER B — tournament refund settlement-reservation preflight.
//
// Unit-only: repository/settlement/gateway dependencies are mocked. Proves the
// preflight runs before the payment lookup, the gateway-settlement dismantle and
// the gateway refund, and that a reserved registration is rejected up-front.
// No HTTP context is required (internal/worker-safe).
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unit-only: no real DB/Redis connection is ever opened.
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

const mockPreflight = vi.hoisted(() => vi.fn(async () => undefined));
const mockDetach = vi.hoisted(() => vi.fn(async () => ({ paymentId: 1, settlementId: 1, lineId: 1, lineReleased: false })));
const mockDbExecute = vi.hoisted(() => vi.fn(async () => [[{ status: 'draft' }], []]));

const tournamentRepo = vi.hoisted(() => ({
  findById: vi.fn(async () => ({ id: 9, organisation_id: 7 })),
  getRegistrationById: vi.fn(async () => ({ id: 41, tournament_id: 9, participant_id: 3 })),
  findPaymentByRegistration: vi.fn(async () => null),
  findParticipantByRegistration: vi.fn(async () => ({ id: 3 })),
  lockPaymentRow: vi.fn(async () => null),
  markPaymentRefundedIfPaid: vi.fn(async () => true),
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn(() => ({ execute: mockDbExecute })) }));
vi.mock('../../../database/database.transaction.js', () => ({ withTransaction: vi.fn() }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: tournamentRepo }));
vi.mock('../infrastructure/repositories/tournament-refund-request.repository.js', () => ({
  tournamentRefundRequestRepository: {
    findByIdForUpdate: vi.fn(),
    updateStatus: vi.fn(),
  },
}));
vi.mock('../../settlement/application/gateway-settlement.service.js', () => ({
  gatewaySettlementService: { detachPaymentTransaction: mockDetach },
}));
vi.mock('./tournament-realtime-scope.js', () => ({ emitTournamentScoped: vi.fn() }));
vi.mock('../../financial/application/financial-entitlement.service.js', () => ({
  financialEntitlementService: { assertNoActiveSettlementReservation: mockPreflight },
}));

const { tournamentRefundService } = await import('../application/tournament-refund.service.js');

const fakeConn: any = { execute: mockDbExecute };

const runCore = () =>
  (tournamentRefundService as any).executeFullRefundCore(fakeConn, {
    tournament: { id: 9, organisation_id: 7, currency_code: 'EGP' },
    registrationId: 41,
    actorId: 900,
    reason: 'player request',
  });

describe('LAYER B — tournament refund settlement-reservation preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreflight.mockReset().mockResolvedValue(undefined);
    mockDetach.mockReset().mockResolvedValue({ paymentId: 1, settlementId: 1, lineId: 1, lineReleased: false });
    tournamentRepo.getRegistrationById.mockResolvedValue({ id: 41, tournament_id: 9, participant_id: 3 } as any);
    mockDbExecute.mockResolvedValue([[{ status: 'draft' }], []] as any);
  });

  it('runs the preflight with the canonical registration source BEFORE the payment work', async () => {
    await expect(runCore()).rejects.toThrow(/No tournament payment found/);
    expect(mockPreflight).toHaveBeenCalledWith('tournament', [41]);
    expect(tournamentRepo.findPaymentByRegistration).toHaveBeenCalled();
  });

  it('blocks the refund before any payment lookup/dismantle/gateway call when reserved', async () => {
    const { ConflictError } = await import('../../../shared/errors/app-error.js');
    mockPreflight.mockRejectedValueOnce(new ConflictError('Refund blocked: entitlement 1 is reserved by settlement 91'));

    await expect(runCore()).rejects.toMatchObject({ statusCode: 409 });

    expect(tournamentRepo.findPaymentByRegistration).not.toHaveBeenCalled();
    expect(mockDetach).not.toHaveBeenCalled();
  });

  it('orders preflight strictly before the payment lookup', async () => {
    const sequence: string[] = [];
    mockPreflight.mockImplementationOnce(async () => {
      sequence.push('preflight');
    });
    tournamentRepo.findPaymentByRegistration.mockImplementationOnce(async () => {
      sequence.push('payment-lookup');
      throw new Error('stop-after-payment-lookup');
    });

    await expect(runCore()).rejects.toThrow(/stop-after-payment-lookup/);
    expect(sequence).toEqual(['preflight', 'payment-lookup']);
  });

  it('keeps a deterministic 409 on repeated attempts (idempotent rejection, no partial work)', async () => {
    const { ConflictError } = await import('../../../shared/errors/app-error.js');
    mockPreflight.mockRejectedValue(new ConflictError('Refund blocked: entitlement 1 is reserved by settlement 91'));

    await expect(runCore()).rejects.toMatchObject({ statusCode: 409 });
    await expect(runCore()).rejects.toMatchObject({ statusCode: 409 });

    expect(tournamentRepo.findPaymentByRegistration).not.toHaveBeenCalled();
    expect(mockDetach).not.toHaveBeenCalled();
  });

  it('works without any HTTP user context (internal refund execution)', async () => {
    await expect(runCore()).rejects.toThrow(/No tournament payment found/);
    expect(mockPreflight).toHaveBeenCalledTimes(1);
  });
});
