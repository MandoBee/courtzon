import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
import type { Tournament } from '../domain/tournament-aggregate.js';

const repo = vi.hoisted(() => ({
  findByCode: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  findByIdDetailed: vi.fn(),
  findPrizesByTournament: vi.fn(),
  findSponsorsByTournament: vi.fn(),
  findBracketTypeById: vi.fn(),
  findRegistrationsByTournament: vi.fn(),
  createRegistration: vi.fn(),
  getRegistrationById: vi.fn(),
  createCashPaymentTransaction: vi.fn(),
  updateRegistrationPaymentStatus: vi.fn(),
  countUnresolvedRequiredMatches: vi.fn(),
  findMatches: vi.fn(),
  getOrgActivePaymentMethodSlugs: vi.fn(),
  findPlayerIdsForSport: vi.fn(),
  findEligibleDiscoveryAudience: vi.fn(),
  update: vi.fn(),
  updateStatus: vi.fn(),
}));

const mrRepo = vi.hoisted(() => ({
  findFormatById: vi.fn(),
  findRuleSetById: vi.fn(),
  resolveDefaultFormatForSport: vi.fn(),
  findActiveRuleSetForFormat: vi.fn(),
  listRuleSetsBySport: vi.fn(),
}));

const branchRepo = vi.hoisted(() => ({ findById: vi.fn() }));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const pool = vi.hoisted(() => ({
  execute: vi.fn(async () => [[]]),
  query: vi.fn(async () => [[]]),
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(),
}));
pool.getConnection = vi.fn(async () => pool);
const commission = vi.hoisted(() => ({ getCommissionRate: vi.fn(), getCurrentSubscription: vi.fn() }));
const paymentService = vi.hoisted(() => ({ charge: vi.fn() }));
const pdRepo = vi.hoisted(() => ({
  getNextWaitingOrderByTournament: vi.fn(),
  createParticipant: vi.fn(),
  findParticipantByRegistration: vi.fn(),
  listParticipantsByTournament: vi.fn(),
}));

const queue = vi.hoisted(() => ({
  add: vi.fn(async () => 'bull-id'),
  removeJob: vi.fn(async () => undefined),
}));

// G11.12 — the lifecycle trigger tests assert the scheduler call; the actual
// BullMQ job/delay/jobId semantics are unit-tested in tournament-start-reminder.spec.ts.
const reminder = vi.hoisted(() => ({
  schedule: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
}));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: pdRepo }));
vi.mock('../../../infrastructure/queue/queue.service.js', () => ({
  queueService: { add: queue.add, removeJob: queue.removeJob, addBulk: vi.fn() },
}));
vi.mock('../../notifications/application/scheduler.service.js', () => ({
  scheduleTournamentStartReminder: reminder.schedule,
  removeTournamentStartReminder: reminder.remove,
  tournamentStartUtc: () => new Date('2026-12-01T00:00:00.000Z'),
  tournamentReminderJobId: (tournamentId: number, userId: number) => `tournament-reminder-${tournamentId}-${userId}`,
}));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mrRepo }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({
  getCommissionRate: commission.getCommissionRate,
  getCurrentSubscription: commission.getCurrentSubscription,
}));
vi.mock('../../organisations/infrastructure/repositories/branch.repository.js', () => ({ branchRepository: branchRepo }));
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService }));

const RR = { id: 3, name: 'Round Robin', slug: 'round-robin', is_active: 1, config_schema: null };

function makeTournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 1, creator_id: 1, bracket_type_id: 3, format: 'round_robin',
    name: 'T1', max_participants: 8, min_participants: 2, entry_fee: 0,
    currency_code: 'AED', price_type: 'FREE', status: 'registration_open',
    sport_id: 22, match_format_id: 1, rule_set_id: 1, draw_seed: 42,
    start_date: '2026-12-01',
    registration_payment_methods: ['cash', 'card'],
    // G11 Phase 3 — a tournament is always owned by an organisation, so venue
    // branch validation is always evaluated against a real owning org.
    organisation_id: 1001,
    ...overrides,
  };
}

function makeReg(overrides: Record<string, unknown> = {}) {
  return { id: 1, tournament_id: 1, user_id: 5, player_id: 5, seed: 1, status: 'registered', payment_status: 'unpaid', registered_at: '2026-01-01 00:00:00', ...overrides };
}

const svc = new TournamentService();

/** Flush the microtask chain used by fire-and-forget reminder scheduling/removal. */
const flush = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  vi.clearAllMocks();
  repo.findByCode.mockResolvedValue(null);
  repo.findBracketTypeById.mockResolvedValue(RR);
  repo.create.mockResolvedValue(10);
  repo.findById.mockResolvedValue(makeTournament({ id: 10 }));
  repo.findByIdDetailed.mockResolvedValue(makeTournament({ id: 10 }));
  repo.findPrizesByTournament.mockResolvedValue([]);
  repo.findRegistrationsByTournament.mockResolvedValue([]);
  repo.createRegistration.mockResolvedValue(2);
  repo.getRegistrationById.mockResolvedValue(makeReg({ id: 2, registration_id: 2 }));
  repo.createCashPaymentTransaction.mockResolvedValue(5001);
  repo.updateRegistrationPaymentStatus.mockResolvedValue(undefined);
  repo.getOrgActivePaymentMethodSlugs.mockResolvedValue([]);
  repo.findPlayerIdsForSport.mockResolvedValue([]);
  repo.findEligibleDiscoveryAudience.mockResolvedValue([]);
  repo.update.mockResolvedValue(undefined);
  repo.updateStatus.mockResolvedValue(undefined);
  repo.countUnresolvedRequiredMatches.mockResolvedValue(0);
  repo.findMatches.mockResolvedValue([]);
  pdRepo.listParticipantsByTournament.mockResolvedValue([]);
  branchRepo.findById.mockResolvedValue({ id: 5, opening_time: '08:00:00', closing_time: '22:00:00' });
  mrRepo.findFormatById.mockResolvedValue({ formatId: 1, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel', isActive: true });
  mrRepo.findRuleSetById.mockResolvedValue({ formatId: 1, ruleSetId: 1, version: 1, rules: { best_of: 3 }, standingsRules: null });
  commission.getCommissionRate.mockResolvedValue(null);
  commission.getCurrentSubscription.mockResolvedValue({ exists: false, planName: null });
  paymentService.charge.mockResolvedValue({ success: true, paymentId: 9001, status: 'pending', paymentUrl: 'https://pay' });
  pdRepo.getNextWaitingOrderByTournament.mockResolvedValue(1);
  pdRepo.createParticipant.mockResolvedValue(1);
  pdRepo.findParticipantByRegistration.mockResolvedValue(null);
});

describe('Group 4 — registration deadline validation', () => {
  it('1. accepts a valid registration deadline before the tournament start', async () => {
    await svc.create(makeTournament({ start_date: '2026-12-01', registration_closes: '2026-11-30T18:00:00' }), 1);
    expect(repo.create).toHaveBeenCalled();
  });

  it('3. rejects a registration deadline on/after the tournament start', async () => {
    await expect(svc.create(makeTournament({ start_date: '2026-12-01', registration_closes: '2026-12-01T00:00:00' }), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_SCHEDULE });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('3b. rejects a registration deadline clearly after the tournament start (update path too)', async () => {
    await expect(svc.update(10, { registration_closes: '2027-01-01T00:00:00' } as any))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_SCHEDULE });
  });

  it('4. registration after the deadline is rejected server-side', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, start_date: '2026-12-01', registration_closes: '2020-01-01T00:00:00', registration_payment_methods: ['cash', 'card'] }));
    await expect(svc.register(1, 5)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_REGISTRATION_CLOSED });
    expect(repo.createRegistration).not.toHaveBeenCalled();
  });

  it('5. registration before the deadline succeeds', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, start_date: '2026-12-01', registration_closes: '2099-01-01T00:00:00', registration_payment_methods: ['cash', 'card'] }));
    const reg = await svc.register(1, 5);
    expect(repo.createRegistration).toHaveBeenCalled();
    expect(reg.payment_status).toBe('unpaid');
  });

  it('5b. registration with NO configured deadline remains backward compatible', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, registration_closes: undefined }));
    await svc.register(1, 5);
    expect(repo.createRegistration).toHaveBeenCalled();
  });
});

describe('Group 4 — daily playing window validation', () => {
  it('6. accepts a valid daily window (start < end)', async () => {
    await svc.create(makeTournament({ start_date: '2026-12-01', daily_start_time: '09:00:00', daily_end_time: '21:00:00' }), 1);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ daily_start_time: '09:00:00', daily_end_time: '21:00:00' }));
  });

  it('7. rejects a daily window with start >= end', async () => {
    await expect(svc.create(makeTournament({ start_date: '2026-12-01', daily_start_time: '21:00:00', daily_end_time: '09:00:00' }), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_SCHEDULE });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('7b. rejects a daily window configured with only one bound', async () => {
    await expect(svc.create(makeTournament({ start_date: '2026-12-01', daily_start_time: '09:00:00' }), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_SCHEDULE });
  });

  it('8. rejects a daily window outside the venue branch operating hours', async () => {
    branchRepo.findById.mockResolvedValue({ id: 5, opening_time: '08:00:00', closing_time: '22:00:00' });
    await expect(svc.create(makeTournament({
      start_date: '2026-12-01', branch_id: 5, daily_start_time: '06:00:00', daily_end_time: '08:00:00',
    }), 1)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_SCHEDULE });
  });

  it('8b. accepts a daily window inside the venue branch operating hours', async () => {
    branchRepo.findById.mockResolvedValue({ id: 5, opening_time: '08:00:00', closing_time: '22:00:00' });
    await svc.create(makeTournament({
      start_date: '2026-12-01', branch_id: 5, daily_start_time: '09:00:00', daily_end_time: '21:00:00',
    }), 1);
    expect(repo.create).toHaveBeenCalled();
  });

  it('8c. a daily window without a branch is NOT branch-validated (org-owned, no venue branch)', async () => {
    branchRepo.findById.mockResolvedValue(null);
    await svc.create(makeTournament({ start_date: '2026-12-01', daily_start_time: '06:00:00', daily_end_time: '23:00:00' }), 1);
    expect(repo.create).toHaveBeenCalled();
  });

  it('8d. overnight venue hours (13:00–01:00) accept a fitting window and reject a non-fitting one', async () => {
    branchRepo.findById.mockResolvedValue({ id: 1, opening_time: '13:00:00', closing_time: '01:00:00' });
    // 14:00–21:00 fits the overnight window (13:00 → midnight).
    await svc.create(makeTournament({ start_date: '2026-12-01', branch_id: 1, daily_start_time: '14:00:00', daily_end_time: '21:00:00' }), 1);
    expect(repo.create).toHaveBeenCalled();

    // 09:00–21:00 does NOT fit (starts before the 13:00 opening).
    await expect(svc.create(makeTournament({ start_date: '2026-12-01', branch_id: 1, daily_start_time: '09:00:00', daily_end_time: '21:00:00' }), 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_SCHEDULE });
  });
});

describe('Group 4 — venue resolution + detail response', () => {
  it('10/11. detail response attaches venue + sport icon + daily window + deadline', async () => {
    repo.findByIdDetailed.mockResolvedValue({
      id: 10, name: 'T1', organisation_id: 6, branch_id: 5, start_date: '2026-12-01',
      registration_closes: '2026-11-30T18:00:00', registration_deadline: '2026-11-30T18:00:00',
      daily_start_time: '09:00:00', daily_end_time: '21:00:00',
      sport_name: 'Padel', sport_icon: 'padel.png',
      branch_name: 'Padel Edge City', branch_address_line1: '12 Corniche', branch_city: 'Dubai',
      branch_latitude: 25.2048, branch_longitude: 55.2708, branch_timezone: 'Asia/Dubai',
      branch_opening_time: '08:00:00', branch_closing_time: '22:00:00',
    });
    const detail = await svc.getByIdDetailed(10);
    expect(detail.venue).toEqual(expect.objectContaining({
      branchId: 5, name: 'Padel Edge City', addressLine1: '12 Corniche', city: 'Dubai',
      timezone: 'Asia/Dubai', mapsUrl: expect.stringContaining('google.com/maps/search'),
    }));
    expect(detail.sport_icon).toBe('padel.png');
    expect(detail.daily_start_time).toBe('09:00:00');
    expect(detail.registration_deadline).toBe('2026-11-30T18:00:00');
  });

  it('venue mapsUrl is null when no address/coordinates exist (never invented)', async () => {
    repo.findByIdDetailed.mockResolvedValue({
      id: 10, name: 'T1', branch_id: 5, branch_name: 'Anon Branch',
      branch_address_line1: null, branch_city: null, branch_latitude: null, branch_longitude: null,
    });
    const detail = await svc.getByIdDetailed(10);
    expect(detail.venue.mapsUrl).toBeNull();
  });

  it('venue is null for a tournament without a branch', async () => {
    repo.findByIdDetailed.mockResolvedValue({ id: 10, name: 'T1', branch_id: null });
    const detail = await svc.getByIdDetailed(10);
    expect(detail.venue).toBeNull();
  });
});

describe('Group 4 — publication notification targeting', () => {
  it('13. publish() emits tournament:registration-open ONLY for players matching the tournament sport', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, sport_id: 22, status: 'draft' }));
    repo.findEligibleDiscoveryAudience.mockResolvedValue([42, 43]);
    await svc.publish(1);
    expect(repo.findEligibleDiscoveryAudience).toHaveBeenCalledWith(expect.objectContaining({ sport_id: 22 }));
    expect(bus.emit).toHaveBeenCalledWith('tournament:registration-open', expect.objectContaining({ tournamentId: 1, userId: 42 }), expect.anything());
    expect(bus.emit).toHaveBeenCalledWith('tournament:registration-open', expect.objectContaining({ tournamentId: 1, userId: 43 }), expect.anything());
    // An unrelated sport's audience is excluded by the sport-scoped query — no
    // users outside the returned sport audience are ever notified.
    const emittedUserIds = bus.emit.mock.calls
      .filter((c) => c[0] === 'tournament:registration-open')
      .map((c) => c[1].userId);
    expect(emittedUserIds).toEqual([42, 43]);
  });

  it('openRegistration() notifies the same sport audience', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, sport_id: 22, status: 'published' }));
    repo.findEligibleDiscoveryAudience.mockResolvedValue([42]);
    await svc.openRegistration(1);
    expect(repo.findEligibleDiscoveryAudience).toHaveBeenCalledWith(expect.objectContaining({ sport_id: 22 }));
    expect(bus.emit).toHaveBeenCalledWith('tournament:registration-open', expect.objectContaining({ userId: 42 }), expect.anything());
  });

  it('publish() does NOT notify when the tournament has no sport (no fabricated audience)', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 1, sport_id: undefined, status: 'draft' }));
    await svc.publish(1);
    expect(repo.findEligibleDiscoveryAudience).not.toHaveBeenCalled();
    expect(bus.emit.mock.calls.some((c) => c[0] === 'tournament:registration-open')).toBe(false);
  });
});

describe('Group 4 — realtime + payment regression', () => {
  it('14. update() emits tournament:schedule-updated when the schedule actually changes', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, daily_start_time: '09:00:00', daily_end_time: '21:00:00' }));
    await svc.update(10, { daily_start_time: '10:00:00', daily_end_time: '22:00:00' } as any);
    expect(bus.emit).toHaveBeenCalledWith('tournament:schedule-updated', expect.objectContaining({ tournamentId: 10, dailyStartTime: '10:00:00', dailyEndTime: '22:00:00' }), expect.anything());
  });

  it('14b. update() does NOT emit tournament:schedule-updated when nothing changed', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, daily_start_time: '09:00:00', daily_end_time: '21:00:00' }));
    await svc.update(10, { daily_start_time: '09:00:00', daily_end_time: '21:00:00' } as any);
    expect(bus.emit.mock.calls.some((c) => c[0] === 'tournament:schedule-updated')).toBe(false);
  });

  it('15. registration payment flow is unchanged by the schedule work', async () => {
    repo.findById.mockResolvedValue(makeTournament({
      id: 1, entry_fee: 150, currency_code: 'AED', registration_closes: '2099-01-01T00:00:00',
      registration_payment_methods: ['cash'],
    }));
    const reg = await svc.register(1, 5, undefined, 'cash');
    expect(repo.createCashPaymentTransaction).toHaveBeenCalledWith(expect.objectContaining({ userId: 5, registrationId: 2, amount: 150, currency: 'AED' }));
    expect(repo.updateRegistrationPaymentStatus).toHaveBeenCalledWith(2, 'paid');
    expect(reg.payment).toEqual(expect.objectContaining({ method: 'cash', status: 'paid' }));
  });

  it('register with a disallowed payment method is still rejected (Group 3 unchanged)', async () => {
    repo.findById.mockResolvedValue(makeTournament({
      id: 1, entry_fee: 100, registration_closes: '2099-01-01T00:00:00', registration_payment_methods: ['card'],
    }));
    await expect(svc.register(1, 5, undefined, 'cash')).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_PAYMENT_METHOD });
  });
});

describe('G11.10 D4 — registration-closed lifecycle emitter', () => {
  it('closeRegistration() emits tournament:registration-closed after a valid transition', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, name: 'RR Cup', status: 'registration_open', organisation_id: 1001 }));
    await svc.closeRegistration(10);

    expect(repo.updateStatus).toHaveBeenCalledWith(10, 'registration_closed', undefined, 'registration_open');
    expect(bus.emit).toHaveBeenCalledWith(
      'tournament:registration-closed',
      expect.objectContaining({ tournamentId: 10, name: 'RR Cup', organisationId: 1001 }),
      expect.anything(),
    );
    // Tenant scope is resolved from the authoritative aggregate.
    const emit = bus.emit.mock.calls.find((c: any) => c[0] === 'tournament:registration-closed');
    expect(emit?.[1]).toMatchObject({ tournamentId: 10, organisationId: 1001, creatorId: 1 });
  });

  it('closeRegistration() does NOT emit for an invalid transition (lifecycle semantics preserved)', async () => {
    // e.g. draft → registration_closed is not a listed transition.
    repo.findById.mockResolvedValue(makeTournament({ id: 10, name: 'X', status: 'draft' }));
    await expect(svc.closeRegistration(10)).rejects.toThrow();
    expect(bus.emit.mock.calls.some((c: any) => c[0] === 'tournament:registration-closed')).toBe(false);
    expect(repo.updateStatus).not.toHaveBeenCalled();
  });
});

describe('G11.11 — terminal lifecycle emitters (cancel / archive / operator complete)', () => {
  it('cancel() emits tournament:cancelled after a valid running → cancelled transition', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, name: 'Cup', status: 'running', organisation_id: 1001 }));
    await svc.cancel(10);

    expect(repo.updateStatus).toHaveBeenCalledWith(10, 'cancelled', undefined, 'running');
    expect(bus.emit).toHaveBeenCalledWith(
      'tournament:cancelled',
      expect.objectContaining({ tournamentId: 10, name: 'Cup', organisationId: 1001 }),
      expect.anything(),
    );
  });

  it('cancel() does NOT emit for an invalid transition (silent close preserved)', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, name: 'X', status: 'draft' }));
    await expect(svc.cancel(10)).rejects.toThrow();
    expect(bus.emit.mock.calls.some((c: any) => c[0] === 'tournament:cancelled')).toBe(false);
  });

  it('archive() emits tournament:archived after a valid completed → archived transition', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, name: 'Cup', status: 'completed', organisation_id: 1001 }));
    await svc.archive(10);

    expect(repo.updateStatus).toHaveBeenCalledWith(10, 'archived', undefined, 'completed');
    expect(bus.emit).toHaveBeenCalledWith(
      'tournament:archived',
      expect.objectContaining({ tournamentId: 10, name: 'Cup', organisationId: 1001 }),
      expect.anything(),
    );
  });

  it('archive() does NOT emit for an invalid transition', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, name: 'X', status: 'registration_open' }));
    await expect(svc.archive(10)).rejects.toThrow();
    expect(bus.emit.mock.calls.some((c: any) => c[0] === 'tournament:archived')).toBe(false);
  });

  it('operator complete() of a bracket/knockout tournament emits tournament:completed (no winner, operator marker)', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, name: 'KO Cup', status: 'running', format: 'knockout', organisation_id: 1001 }));
    await svc.complete(10);

    const emit = bus.emit.mock.calls.find((c: any) => c[0] === 'tournament:completed');
    expect(emit).toBeTruthy();
    expect(emit[1]).toMatchObject({ tournamentId: 10, name: 'KO Cup', operatorCompleted: true, organisationId: 1001 });
    expect(emit[1].userId).toBeUndefined();
  });

  it('round-robin complete() behavior is UNCHANGED (standings-finalized, no operator completed)', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, name: 'RR Cup', status: 'running', format: 'round_robin', organisation_id: 1001 }));
    await svc.complete(10);

    expect(bus.emit).toHaveBeenCalledWith('tournament:standings-finalized', expect.objectContaining({ tournamentId: 10 }), expect.anything());
    const completedEmits = bus.emit.mock.calls.filter((c: any) => c[0] === 'tournament:completed');
    expect(completedEmits.some((c: any) => c[1].operatorCompleted === true)).toBe(false);
  });
});

describe('G11.12 — tournament start reminder scheduling (lifecycle triggers)', () => {
  function scheduledPairs(): string[] {
    return reminder.schedule.mock.calls.map((c: any) => `${c[0]}:${c[2]}`);
  }
  function removedPairs(): string[] {
    return reminder.remove.mock.calls.map((c: any) => `${c[0]}:${c[1]}`);
  }

  it('A. register() schedules a start reminder for the newly active participant', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, start_date: '2026-12-01' }));
    await svc.register(10, 5);
    await flush();

    expect(scheduledPairs()).toContain('10:5');
    expect(reminder.schedule.mock.calls[0][1]).toBeInstanceOf(Date); // UTC start passed
    expect(reminder.schedule.mock.calls[0][3]).toBe('T1'); // name passed for template
  });

  it('B. publish()/openRegistration() schedule every ACTIVE participant member (incl. team multi-member)', async () => {
    pdRepo.listParticipantsByTournament.mockResolvedValue([
      { id: 1, tournament_id: 10, status: 'active', member_user_ids: [50, 51] },
      { id: 2, tournament_id: 10, status: 'active', member_user_ids: [52] },
    ]);
    repo.findById.mockResolvedValue(makeTournament({ id: 10, status: 'draft', start_date: '2026-12-01', name: 'Cup' }));
    repo.findEligibleDiscoveryAudience.mockResolvedValue([]);

    await svc.publish(10);
    await flush();

    expect(scheduledPairs()).toEqual(expect.arrayContaining(['10:50', '10:51', '10:52']));
  });

  it('B2. repeated publish keeps a deterministic job id per user (queue-level dedup covered at unit level)', async () => {
    pdRepo.listParticipantsByTournament.mockResolvedValue([{ id: 1, tournament_id: 10, status: 'active', member_user_ids: [50] }]);
    repo.findById.mockResolvedValue(makeTournament({ id: 10, status: 'draft', start_date: '2026-12-01' }));
    repo.findEligibleDiscoveryAudience.mockResolvedValue([]);

    await svc.publish(10);
    await svc.publish(10);
    await flush();

    expect(scheduledPairs().filter((p) => p === '10:50')).toHaveLength(2); // same deterministic id each time
  });

  it('C. update() start change removes the old reminder then schedules the new one (same user)', async () => {
    pdRepo.listParticipantsByTournament.mockResolvedValue([{ id: 1, tournament_id: 10, status: 'active', member_user_ids: [5] }]);
    repo.findById.mockResolvedValue(makeTournament({ id: 10, start_date: '2026-12-01' }));

    await svc.update(10, { start_date: '2026-12-20' } as any);
    await flush();

    expect(removedPairs()).toContain('10:5');
    expect(scheduledPairs()).toContain('10:5');
  });

  it('C2. unrelated updates do NOT touch reminders', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, start_date: '2026-12-01' }));
    await svc.update(10, { name: 'Renamed' } as any);
    await flush();
    expect(reminder.remove).not.toHaveBeenCalled();
    expect(reminder.schedule).not.toHaveBeenCalled();
  });

  it('D. cancel() removes queued reminders for active participants (G11.11 emit unchanged)', async () => {
    pdRepo.listParticipantsByTournament.mockResolvedValue([{ id: 1, tournament_id: 10, status: 'active', member_user_ids: [5] }]);
    repo.findById.mockResolvedValue(makeTournament({ id: 10, status: 'running', organisation_id: 1001 }));

    await svc.cancel(10);
    await flush();

    expect(bus.emit).toHaveBeenCalledWith('tournament:cancelled', expect.anything(), expect.anything());
    expect(removedPairs()).toContain('10:5');
  });

  it('E. archive() removes queued reminders for active participants (G11.11 emit unchanged)', async () => {
    pdRepo.listParticipantsByTournament.mockResolvedValue([{ id: 1, tournament_id: 10, status: 'active', member_user_ids: [5] }]);
    repo.findById.mockResolvedValue(makeTournament({ id: 10, status: 'completed', organisation_id: 1001 }));

    await svc.archive(10);
    await flush();

    expect(bus.emit).toHaveBeenCalledWith('tournament:archived', expect.anything(), expect.anything());
    expect(removedPairs()).toContain('10:5');
  });
});

describe('G11.13 — operator bracket champion resolution on manual complete()', () => {
  function finalSlot(overrides: Record<string, unknown> = {}) {
    return {
      id: 9, tournament_id: 10, round: 3, status: 'completed', progression_state: 'completed', winner_id: 77,
      progression_meta: JSON.stringify({ is_bracket: true }),
      ...overrides,
    };
  }
  function completedEmits() {
    return bus.emit.mock.calls.filter((c: any) => c[0] === 'tournament:completed');
  }

  it('1. resolves the champion from the persisted final bracket slot and includes winnerId on the event', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, name: 'KO Cup', status: 'running', format: 'knockout', organisation_id: 1001 }));
    repo.findMatches.mockResolvedValue([finalSlot()]);

    await svc.complete(10);

    const emit = completedEmits().find((c: any) => c[1].operatorCompleted === true);
    expect(emit).toBeTruthy();
    expect(emit[1]).toMatchObject({ tournamentId: 10, operatorCompleted: true, winnerId: 77 });
    // No user-keyed winner-dispatch duplication — the prize listener reads winnerId.
    expect(emit[1].userId).toBeUndefined();
  });

  it('2. team/legacy winner_id (the PRIMARY MEMBER USER id) is forwarded verbatim', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, name: 'KO Cup', status: 'running', format: 'knockout', organisation_id: 1001 }));
    repo.findMatches.mockResolvedValue([finalSlot({ winner_id: 777 })]);

    await svc.complete(10);

    const emit = completedEmits().find((c: any) => c[1].operatorCompleted === true);
    expect(emit[1].winnerId).toBe(777);
  });

  it('3. no matches at all → complete() succeeds WITHOUT winnerId (never fabricate)', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, name: 'KO Cup', status: 'running', format: 'knockout', organisation_id: 1001 }));
    repo.findMatches.mockResolvedValue([]);

    await svc.complete(10);

    const emit = completedEmits().find((c: any) => c[1].operatorCompleted === true);
    expect(emit).toBeTruthy();
    expect(emit[1].operatorCompleted).toBe(true);
    expect(emit[1].winnerId).toBeUndefined();
  });

  it('4. final slot still scheduled/incomplete → no winnerId', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, name: 'KO Cup', status: 'running', format: 'knockout', organisation_id: 1001 }));
    repo.findMatches.mockResolvedValue([finalSlot({ status: 'scheduled', progression_state: 'scheduled' })]);

    await svc.complete(10);

    const emit = completedEmits().find((c: any) => c[1].operatorCompleted === true);
    expect(emit[1].winnerId).toBeUndefined();
  });

  it('5. ambiguous finals (two final slots) → no winnerId (fail closed)', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, name: 'KO Cup', status: 'running', format: 'knockout', organisation_id: 1001 }));
    repo.findMatches.mockResolvedValue([finalSlot({ id: 9 }), finalSlot({ id: 10 })]);

    await svc.complete(10);

    const emit = completedEmits().find((c: any) => c[1].operatorCompleted === true);
    expect(emit[1].winnerId).toBeUndefined();
  });

  it('6. bye-only final slot is excluded → no winnerId', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, name: 'KO Cup', status: 'running', format: 'knockout', organisation_id: 1001 }));
    repo.findMatches.mockResolvedValue([finalSlot({ progression_meta: JSON.stringify({ is_bracket: true, bye: true }) })]);

    await svc.complete(10);

    const emit = completedEmits().find((c: any) => c[1].operatorCompleted === true);
    expect(emit[1].winnerId).toBeUndefined();
  });

  it('7. round-robin operator complete() remains UNCHANGED (no operator tournament:completed)', async () => {
    repo.findById.mockResolvedValue(makeTournament({ id: 10, name: 'RR Cup', status: 'running', format: 'round_robin', organisation_id: 1001 }));
    repo.findMatches.mockResolvedValue([finalSlot()]); // noise — RR must not use the bracket resolver

    await svc.complete(10);

    expect(bus.emit).toHaveBeenCalledWith('tournament:standings-finalized', expect.objectContaining({ tournamentId: 10 }), expect.anything());
    expect(completedEmits().some((c: any) => c[1].operatorCompleted === true)).toBe(false);
  });
});