import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { ParticipantDrawService } from '../application/participant-draw.service.js';

/**
 * G11.20 â€” COMPETITION-SCOPED WAITLIST PROMOTION + COMPETITION-SCOPED PAYMENT.
 *
 * These are the two latent defects that G11.20 discovery classified as Severity A:
 *   F2 â€” `promoteNextWaitlisted` picked the FIFO head tournament-wide and never
 *        re-checked competition capacity, so once a second category became
 *        reachable it would overfill a full competition.
 *   F3 â€” promotion/replacement called `settleRegistrationPayment` WITHOUT
 *        `opts`, falling back to the tournament-level entry fee. With a
 *        competition-specific price this charged the WRONG amount.
 *
 * Covered here:
 *   1. the FIFO head is drawn from the requested competition only;
 *   2. capacity is re-checked inside the existing FOR UPDATE transaction;
 *   3. a promotion can never overfill a competition (txn rolls back);
 *   4. promotion payment uses the participant's OWN competition fee + currency;
 *   5. replacement payment uses the replacement's competition fee + currency;
 *   6. two competitions can carry different fees and different currencies;
 *   7. cross-competition waitlist isolation (head never leaks across categories);
 *   8. single-competition behavior is byte-identical to pre-G11.20.
 */

const pdRepo = vi.hoisted(() => ({
  findParticipantById: vi.fn(),
  findParticipantByRegistration: vi.fn(),
  findWaitlistHead: vi.fn(),
  listWaitingParticipants: vi.fn(),
  updateParticipantStatus: vi.fn(),
  updateParticipantWaitingOrder: vi.fn(),
  createParticipant: vi.fn(),
  findActiveParticipantByPlayer: vi.fn(),
  findActiveParticipantByPlayerInCompetition: vi.fn(),
  countParticipantsByCompetition: vi.fn(),
  findSeedByParticipant: vi.fn(),
  findCurrentDraw: vi.fn(),
  findDrawById: vi.fn(),
  findEntryByParticipant: vi.fn(),
  deleteDrawEntryByParticipant: vi.fn(),
  markDrawRequiresRedraw: vi.fn(),
  updateDraw: vi.fn(),
}));

const tRepo = vi.hoisted(() => ({
  findById: vi.fn(),
  findRegistrationsByTournament: vi.fn(),
  updateRegistrationStatus: vi.fn(),
  updateRegistrationWaitingOrder: vi.fn(),
  hasAnyStartedMatch: vi.fn(),
  updateRegistrationPaymentStatus: vi.fn(),
  createCashPaymentTransaction: vi.fn(),
}));

const tournamentServiceMock = vi.hoisted(() => ({
  resolveEffectiveRegistrationPaymentMethods: vi.fn(),
  resolveWithdrawnSlots: vi.fn(),
}));

const compRepo = vi.hoisted(() => ({
  findById: vi.fn(),
  findDefaultByTournament: vi.fn(),
  findByTournament: vi.fn(),
}));

const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const ratingRepo = vi.hoisted(() => ({ getRating: vi.fn() }));
const ratingSvc = vi.hoisted(() => ({ resolveOverallPercent: vi.fn() }));
const reminder = vi.hoisted(() => ({ remove: vi.fn(async () => undefined) }));
const paymentService = vi.hoisted(() => ({ charge: vi.fn() }));

const poolConn = vi.hoisted(() => ({
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(),
  query: vi.fn(async () => [[]]),
  execute: vi.fn(async () => [[]]),
}));
const poolMock = vi.hoisted(() => ({
  getConnection: vi.fn(async () => poolConn),
  query: vi.fn(async () => [[]]),
  execute: vi.fn(async () => [[]]),
}));

vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: pdRepo }));
vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: tRepo }));
vi.mock('../infrastructure/repositories/competition.repository.js', () => ({ competitionRepository: compRepo }));
vi.mock('../application/tournament.service.js', () => ({ tournamentService: tournamentServiceMock }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => poolMock }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../notifications/application/scheduler.service.js', () => ({ removeTournamentStartReminder: reminder.remove }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../match-result/infrastructure/rating.repository.js', () => ({ ratingRepository: ratingRepo }));
vi.mock('../../match-result/application/rating/rating.service.js', () => ({ ratingService: ratingSvc }));
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService }));

const svc = new ParticipantDrawService();

const COMP_A = 11;
const COMP_B = 22;

function comp(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    public_id: `uuid-${id}`,
    tournament_id: 1,
    competition_type: 'singles',
    name: `Comp ${id}`,
    entry_fee: 0,
    registration_fee: 0,
    currency_code: 'EGP',
    price_type: 'FIXED',
    max_participants: null,
    min_participants: 2,
    waitlist_enabled: 1,
    is_default: id === COMP_A ? 1 : 0,
    ...overrides,
  };
}

function participant(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    tournament_id: 1,
    competition_id: COMP_A,
    registration_id: id * 10,
    participant_type: 'individual',
    status: 'waiting',
    waiting_order: 1,
    member_user_ids: [id * 10],
    ...overrides,
  };
}

// The TOURNAMENT-level fee is deliberately 999 so that ANY fallback to
// `t.entry_fee` (the F3 defect) is unmistakably wrong.
const TOURN = {
  id: 1,
  organisation_id: 7,
  sport_id: 22,
  name: 'Cup',
  status: 'registration_open',
  entry_fee: 999,
  registration_fee: 999,
  currency_code: 'AED',
  max_participants: 64,
  registration_payment_methods: ['cash', 'card'],
};

beforeEach(() => {
  vi.clearAllMocks();
  tRepo.findById.mockResolvedValue(TOURN);
  tRepo.findRegistrationsByTournament.mockResolvedValue([]);
  tRepo.hasAnyStartedMatch.mockResolvedValue(false);
  tRepo.updateRegistrationStatus.mockResolvedValue(undefined);
  tRepo.updateRegistrationWaitingOrder.mockResolvedValue(undefined);
  tRepo.updateRegistrationPaymentStatus.mockResolvedValue(undefined);
  tRepo.createCashPaymentTransaction.mockResolvedValue(9001);
  // Faithful stand-in for the real resolver: the COMPETITION's allowed methods
  // are what reach this function (see `promoteNextWaitlisted`), and it returns
  // them unchanged — so a competition restricted to `cash` really does reject `card`.
  tournamentServiceMock.resolveEffectiveRegistrationPaymentMethods.mockImplementation(
    async (t: any) => (Array.isArray(t?.registration_payment_methods) && t.registration_payment_methods.length
      ? t.registration_payment_methods
      : ['cash', 'card']),
  );
  tournamentServiceMock.resolveWithdrawnSlots.mockResolvedValue({ resolvedSlots: 0, cancelledMatches: 0, releasedCourts: 0 });
  compRepo.findById.mockImplementation(async (id: number) => comp(Number(id)));
  compRepo.findByTournament.mockResolvedValue([comp(COMP_A), comp(COMP_B)]);
  pdRepo.countParticipantsByCompetition.mockResolvedValue(0);
  pdRepo.findParticipantById.mockImplementation(async (id: number) => participant(Number(id), { status: 'active' }));
  pdRepo.findSeedByParticipant.mockResolvedValue(null);
  pdRepo.findCurrentDraw.mockResolvedValue(null);
  pdRepo.findActiveParticipantByPlayer.mockResolvedValue(null);
  pdRepo.findActiveParticipantByPlayerInCompetition.mockResolvedValue(null);
});

describe('G11.20 â€” 1. the waitlist head is competition-scoped', () => {
  it('1a. the head is requested for the TARGET competition only', async () => {
    pdRepo.findWaitlistHead.mockResolvedValue(participant(5, { competition_id: COMP_B }));

    await svc.promoteNextWaitlisted(1, 42, 'cash', COMP_B);

    // Signature is (tournamentId, competitionId, conn) â€” the scope is explicit.
    expect(pdRepo.findWaitlistHead).toHaveBeenCalledWith(1, COMP_B, expect.anything());
  });

  it('1b. cross-competition isolation: a head in another competition is never promoted', async () => {
    // The repository is asked for COMP_B's head and returns nothing â€” the waiting
    // participant in COMP_A must NOT be promoted into COMP_B.
    pdRepo.findWaitlistHead.mockResolvedValue(null);

    const r = await svc.promoteNextWaitlisted(1, 42, 'cash', COMP_B);

    expect(r).toBeNull();
    expect(pdRepo.updateParticipantStatus).not.toHaveBeenCalled();
    expect(poolConn.commit).not.toHaveBeenCalled();
  });

  it('1c. an ambiguous promotion (multi-competition, no id) is rejected, never guessed', async () => {
    await expect(svc.promoteNextWaitlisted(1, 42, 'cash')).rejects.toMatchObject({
      code: ErrorCodes.TOURNAMENT_COMPETITION_REQUIRED,
    });
    expect(pdRepo.findWaitlistHead).not.toHaveBeenCalled();
  });

  it('1d. a client-supplied competition from ANOTHER tournament fails closed', async () => {
    compRepo.findById.mockResolvedValue(comp(999, { tournament_id: 2 }));
    await expect(svc.promoteNextWaitlisted(1, 42, 'cash', 999)).rejects.toMatchObject({
      code: ErrorCodes.TOURNAMENT_COMPETITION_NOT_FOUND,
    });
  });

  it('1e. listWaitingParticipants forwards the competition filter', async () => {
    pdRepo.listWaitingParticipants.mockResolvedValue([]);
    await svc.listWaitingParticipants(1, COMP_B);
    expect(pdRepo.listWaitingParticipants).toHaveBeenCalledWith(1, COMP_B);
  });
});

describe('G11.20 â€” 2/3. capacity is re-checked and a competition is never overfilled', () => {
  it('2a. capacity is read INSIDE the FOR UPDATE transaction', async () => {
    pdRepo.findWaitlistHead.mockResolvedValue(participant(5, { competition_id: COMP_B }));

    await svc.promoteNextWaitlisted(1, 42, 'cash', COMP_B);

    expect(poolConn.query).toHaveBeenCalledWith('SELECT id FROM tournaments WHERE id = ? FOR UPDATE', [1]);
    expect(pdRepo.countParticipantsByCompetition).toHaveBeenCalledWith(1, COMP_B, poolConn);
  });

  it('3a. a FULL competition rejects the promotion and rolls the transaction back', async () => {
    pdRepo.findWaitlistHead.mockResolvedValue(participant(5, { competition_id: COMP_B }));
    compRepo.findById.mockImplementation(async (id: number) => (Number(id) === COMP_B
      ? comp(COMP_B, { max_participants: 4 })
      : comp(COMP_A)));
    pdRepo.countParticipantsByCompetition.mockResolvedValue(4); // already full

    await expect(svc.promoteNextWaitlisted(1, 42, 'cash', COMP_B)).rejects.toMatchObject({
      code: ErrorCodes.TOURNAMENT_CAPACITY_FULL,
    });

    // Nothing was promoted, nothing was committed.
    expect(pdRepo.updateParticipantStatus).not.toHaveBeenCalled();
    expect(poolConn.rollback).toHaveBeenCalled();
    expect(poolConn.commit).not.toHaveBeenCalled();
  });

  it('3b. an unlimited competition (max_participants = 0) is never treated as full', async () => {
    pdRepo.findWaitlistHead.mockResolvedValue(participant(5, { competition_id: COMP_B }));
    compRepo.findById.mockImplementation(async (id: number) => (Number(id) === COMP_B
      ? comp(COMP_B, { max_participants: 0 })
      : comp(COMP_A)));
    pdRepo.countParticipantsByCompetition.mockResolvedValue(9999);

    const r = await svc.promoteNextWaitlisted(1, 42, 'cash', COMP_B);

    expect(pdRepo.countParticipantsByCompetition).not.toHaveBeenCalled();
    expect(pdRepo.updateParticipantStatus).toHaveBeenCalledWith(5, 'active', expect.anything());
    expect(r?.status).toBe('active');
  });

  it('3c. one free slot left â†’ the promotion succeeds', async () => {
    pdRepo.findWaitlistHead.mockResolvedValue(participant(5, { competition_id: COMP_B }));
    compRepo.findById.mockImplementation(async (id: number) => (Number(id) === COMP_B
      ? comp(COMP_B, { max_participants: 4 })
      : comp(COMP_A)));
    pdRepo.countParticipantsByCompetition.mockResolvedValue(3);

    await svc.promoteNextWaitlisted(1, 42, 'cash', COMP_B);

    expect(pdRepo.updateParticipantStatus).toHaveBeenCalledWith(5, 'active', expect.anything());
    expect(poolConn.commit).toHaveBeenCalled();
  });
});

describe('G11.20 â€” 4/6. promotion payment uses the participant OWN competition fee', () => {
  it('4a. cash promotion charges the COMPETITION fee, never the tournament fee', async () => {
    pdRepo.findWaitlistHead.mockResolvedValue(participant(5, { competition_id: COMP_B }));
    compRepo.findById.mockImplementation(async (id: number) => (Number(id) === COMP_B
      ? comp(COMP_B, { entry_fee: 350, currency_code: 'SAR' })
      : comp(COMP_A, { entry_fee: 100, currency_code: 'EGP' })));

    await svc.promoteNextWaitlisted(1, 42, 'cash', COMP_B);

    // Tournament entry_fee is 999 â€” a fallback would have charged 999/AED.
    expect(tRepo.createCashPaymentTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 350, currency: 'SAR' }),
    );
  });

  it('4b. card promotion charges the COMPETITION amount to the gateway', async () => {
    pdRepo.findWaitlistHead.mockResolvedValue(participant(5, { competition_id: COMP_B, registration_id: 55 }));
    pdRepo.findParticipantById.mockImplementation(async (id: number) => participant(Number(id), { status: 'active', registration_id: 55 }));
    compRepo.findById.mockImplementation(async (id: number) => (Number(id) === COMP_B
      ? comp(COMP_B, { entry_fee: 275, currency_code: 'USD' })
      : comp(COMP_A)));
    paymentService.charge.mockResolvedValue({ success: true, status: 'pending', paymentId: 77 });

    await svc.promoteNextWaitlisted(1, 42, 'card', COMP_B);

    expect(paymentService.charge).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      amount: 275,
      currency: 'USD',
    }));
  });

  it('6a. two competitions genuinely charge different fees and currencies', async () => {
    compRepo.findById.mockImplementation(async (id: number) => (Number(id) === COMP_B
      ? comp(COMP_B, { entry_fee: 350, currency_code: 'SAR' })
      : comp(COMP_A, { entry_fee: 120, currency_code: 'EGP' })));

    pdRepo.findWaitlistHead.mockResolvedValueOnce(participant(5, { competition_id: COMP_A }));
    await svc.promoteNextWaitlisted(1, 42, 'cash', COMP_A);
    expect(tRepo.createCashPaymentTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount: 120, currency: 'EGP' }),
    );

    pdRepo.findWaitlistHead.mockResolvedValueOnce(participant(6, { competition_id: COMP_B, registration_id: 61 }));
    await svc.promoteNextWaitlisted(1, 42, 'cash', COMP_B);
    expect(tRepo.createCashPaymentTransaction).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount: 350, currency: 'SAR' }),
    );
  });

  it('4c. a FREE competition requires NO payment at all', async () => {
    pdRepo.findWaitlistHead.mockResolvedValue(participant(5, { competition_id: COMP_B, registration_id: 55 }));
    compRepo.findById.mockImplementation(async (id: number) => (Number(id) === COMP_B
      ? comp(COMP_B, { entry_fee: 0, currency_code: 'EGP' })
      : comp(COMP_A, { entry_fee: 100 })));

    const r = await svc.promoteNextWaitlisted(1, 42, 'cash', COMP_B);

    expect(tRepo.createCashPaymentTransaction).not.toHaveBeenCalled();
    expect(r?.payment).toBeNull();
  });

  it('4d. the payment method is validated against the COMPETITION allowed methods', async () => {
    pdRepo.findWaitlistHead.mockResolvedValue(participant(5, { competition_id: COMP_B }));
    compRepo.findById.mockImplementation(async (id: number) => (Number(id) === COMP_B
      ? comp(COMP_B, { registration_payment_methods: ['cash'] })
      : comp(COMP_A)));

    await expect(svc.promoteNextWaitlisted(1, 42, 'card', COMP_B)).rejects.toMatchObject({
      code: ErrorCodes.TOURNAMENT_INVALID_PAYMENT_METHOD,
    });
  });

  it('4e. the audit trail records the competition, fee and currency actually used', async () => {
    pdRepo.findWaitlistHead.mockResolvedValue(participant(5, { competition_id: COMP_B }));
    compRepo.findById.mockImplementation(async (id: number) => (Number(id) === COMP_B
      ? comp(COMP_B, { entry_fee: 350, currency_code: 'SAR' })
      : comp(COMP_A)));

    await svc.promoteNextWaitlisted(1, 42, 'cash', COMP_B);

    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'TOURNAMENT.WAITLIST_PROMOTED',
      afterState: expect.objectContaining({ competition_id: COMP_B, entry_fee: 350, currency: 'SAR' }),
    }));
  });
});

describe('G11.20 â€” 5. replacement payment + competition isolation', () => {
  function withdrawn(id: number, competitionId: number) {
    return { id, tournament_id: 1, competition_id: competitionId, registration_id: id * 10, participant_type: 'individual', status: 'withdrawn', member_user_ids: [id * 10] };
  }

  it('5a. replacement charges the REPLACEMENT competition fee', async () => {
    pdRepo.findParticipantById.mockImplementation(async (id: number) => (
      Number(id) === 60
        ? withdrawn(60, COMP_B)
        : participant(Number(id), { status: 'waiting', competition_id: COMP_B, registration_id: 61 })
    ));
    compRepo.findById.mockImplementation(async (id: number) => (Number(id) === COMP_B
      ? comp(COMP_B, { entry_fee: 480, currency_code: 'GBP' })
      : comp(COMP_A)));

    const r = await svc.replaceParticipant(1, 60, 61, 42, 'cash', COMP_B);

    expect(tRepo.createCashPaymentTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 480, currency: 'GBP' }),
    );
    // The replacement's own row is what transitions to active.
    expect(pdRepo.updateParticipantStatus).toHaveBeenCalledWith(61, 'active', poolConn);
    expect(poolConn.commit).toHaveBeenCalled();
  });

  it('5b. a replacement from a DIFFERENT competition than the withdrawn slot is rejected', async () => {
    pdRepo.findParticipantById.mockImplementation(async (id: number) => (
      Number(id) === 60
        ? withdrawn(60, COMP_A)
        : participant(Number(id), { status: 'waiting', competition_id: COMP_B, registration_id: 61 })
    ));

    await expect(svc.replaceParticipant(1, 60, 61, 42)).rejects.toMatchObject({
      code: ErrorCodes.TOURNAMENT_COMPETITION_TYPE_INVALID,
    });
    expect(pdRepo.updateParticipantStatus).not.toHaveBeenCalled();
  });

  it('5c. replacement also refuses to overfill a full competition', async () => {
    pdRepo.findParticipantById.mockImplementation(async (id: number) => (
      Number(id) === 60
        ? withdrawn(60, COMP_B)
        : participant(Number(id), { status: 'waiting', competition_id: COMP_B, registration_id: 61 })
    ));
    compRepo.findById.mockImplementation(async (id: number) => (Number(id) === COMP_B
      ? comp(COMP_B, { max_participants: 2 })
      : comp(COMP_A)));
    pdRepo.countParticipantsByCompetition.mockResolvedValue(2);

    await expect(svc.replaceParticipant(1, 60, 61, 42)).rejects.toMatchObject({
      code: ErrorCodes.TOURNAMENT_CAPACITY_FULL,
    });
    expect(poolConn.rollback).toHaveBeenCalled();
    expect(poolConn.commit).not.toHaveBeenCalled();
  });

  it('5d. the duplicate-player check is scoped to the resolved competition', async () => {
    pdRepo.findParticipantById.mockImplementation(async (id: number) => (
      Number(id) === 60
        ? withdrawn(60, COMP_B)
        : participant(Number(id), { status: 'waiting', competition_id: COMP_B, registration_id: 61 })
    ));
    await svc.replaceParticipant(1, 60, 61, 42, 'cash', COMP_B);
    expect(pdRepo.findActiveParticipantByPlayerInCompetition).toHaveBeenCalledWith(1, COMP_B, 610);
  });
});

describe('G11.20 â€” 8. single-competition behavior is unchanged (regression)', () => {
  beforeEach(() => {
    // A tournament with exactly ONE competition (the legacy shape).
    compRepo.findByTournament.mockResolvedValue([comp(COMP_A, { entry_fee: 999, currency_code: 'AED' })]);
    compRepo.findById.mockImplementation(async (id: number) => comp(Number(id), { entry_fee: 999, currency_code: 'AED' }));
    pdRepo.findWaitlistHead.mockResolvedValue(participant(5, { competition_id: COMP_A, registration_id: 55 }));
  });

  it('8a. omitting the competition id still promotes into the only competition', async () => {
    const r = await svc.promoteNextWaitlisted(1, 42, 'cash');
    expect(pdRepo.findWaitlistHead).toHaveBeenCalledWith(1, COMP_A, expect.anything());
    expect(r?.status).toBe('active');
  });

  it('8b. the default competition mirrors the tournament, so the amount is the legacy amount', async () => {
    await svc.promoteNextWaitlisted(1, 42, 'cash');
    expect(tRepo.createCashPaymentTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 999, currency: 'AED' }),
    );
  });

  it('8c. a tournament with NO competition rows keeps the legacy tournament-level fallback', async () => {
    compRepo.findByTournament.mockResolvedValue([]);
    compRepo.findById.mockImplementation(async () => { throw new Error('no competition'); });
    // Realistic legacy shape: a pre-migration participant carries no competition_id.
    pdRepo.findWaitlistHead.mockResolvedValue(participant(5, { competition_id: null, registration_id: 55 }));
    await svc.promoteNextWaitlisted(1, 42, 'cash');
    expect(tRepo.createCashPaymentTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 999, currency: 'AED' }),
    );
  });
});