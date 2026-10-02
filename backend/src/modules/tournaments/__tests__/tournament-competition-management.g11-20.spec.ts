import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { CompetitionService } from '../application/competition.service.js';

/**
 * G11.20 — Competition Category Management (unit).
 *
 * Covers the service-level business invariants WITHOUT a database:
 *   A. create a non-default category
 *   B. PATCH semantics (absent key = untouched)
 *   C. deactivation guards (default / last / dependency)
 *   D. exactly-one-default invariant
 *   E. cross-organisation and cross-tournament fail-closed behaviour
 *   F. capacity reduction guard
 *   G. configuration reference validation
 */

const compRepo = vi.hoisted(() => ({
  createDefault: vi.fn(),
  findById: vi.fn(),
  findDefaultByTournament: vi.fn(),
  findByTournament: vi.fn(),
  setVenueOverride: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setActive: vi.fn(),
  countByTournament: vi.fn(),
  countDependents: vi.fn(),
  missingReferences: vi.fn(),
}));

const tRepo = vi.hoisted(() => ({ findById: vi.fn() }));
const pdRepo = vi.hoisted(() => ({
  countParticipantsByCompetition: vi.fn(),
  countWaitingParticipantsByCompetition: vi.fn(),
}));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));

vi.mock('../infrastructure/repositories/competition.repository.js', () => ({ competitionRepository: compRepo }));
vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: tRepo }));
vi.mock('../infrastructure/repositories/participant-draw.repository.js', () => ({ participantDrawRepository: pdRepo }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));

const svc = new CompetitionService();

const ORG = 7;
const TOURNAMENT_ID = 100;

function competition(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    public_id: 'uuid',
    tournament_id: TOURNAMENT_ID,
    competition_type: 'singles',
    name: 'Default',
    entry_fee: 0,
    registration_fee: 0,
    currency_code: 'EGP',
    price_type: 'FIXED',
    max_participants: null,
    min_participants: 2,
    waitlist_enabled: 0,
    is_default: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tRepo.findById.mockResolvedValue({
    id: TOURNAMENT_ID,
    organisation_id: ORG,
    currency_code: 'EGP',
    entry_fee: 100,
    sport_id: 5,
    bracket_type_id: 2,
  });
  compRepo.missingReferences.mockResolvedValue([]);
  compRepo.countByTournament.mockResolvedValue(2);
  compRepo.countDependents.mockResolvedValue({});
  compRepo.create.mockResolvedValue(501);
  compRepo.update.mockResolvedValue(true);
  compRepo.setActive.mockResolvedValue(true);
  pdRepo.countParticipantsByCompetition.mockResolvedValue(0);
  pdRepo.countWaitingParticipantsByCompetition.mockResolvedValue(0);
});

describe('G11.20 A — CREATE a competition category', () => {
  it('A1. creates a non-default category and audits it', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501, name: 'Doubles', competition_type: 'doubles', is_default: 0 }));

    const created = await svc.createCompetition(TOURNAMENT_ID, ORG, 42, {
      competition_type: 'doubles',
      name: 'Doubles',
      entry_fee: 250,
    });

    expect(created.name).toBe('Doubles');
    // is_default is NEVER part of the insert payload — the default stays unique.
    const payload = compRepo.create.mock.calls[0][0] as any;
    expect(payload.is_default).toBeUndefined();
    expect(payload.tournament_id).toBe(TOURNAMENT_ID);
    expect(payload.entry_fee).toBe(250);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'TOURNAMENT.COMPETITION_CREATED',
      entityType: 'tournament_competition',
      entityId: 501,
    }));
    // Realtime event for dashboard refresh.
    expect(bus.emit).toHaveBeenCalledWith('tournament:competition-created', expect.anything(), expect.anything());
  });

  it('A2. inherits currency / sport / bracket from the tournament when omitted', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501 }));
    tRepo.findById.mockResolvedValue({ id: TOURNAMENT_ID, organisation_id: ORG, currency_code: 'SAR', sport_id: 77, bracket_type_id: 9 });

    await svc.createCompetition(TOURNAMENT_ID, ORG, 42, { competition_type: 'team', name: 'Teams' });

    const payload = compRepo.create.mock.calls[0][0] as any;
    expect(payload.currency_code).toBe('SAR');
    expect(payload.sport_id).toBe(77);
    expect(payload.bracket_type_id).toBe(9);
  });

  it('A3. registration_fee defaults to the entry fee when only one is given', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501 }));
    await svc.createCompetition(TOURNAMENT_ID, ORG, 42, { competition_type: 'singles', name: 'S', entry_fee: 300 });
    expect((compRepo.create.mock.calls[0][0] as any).registration_fee).toBe(300);
  });

  it('A4. rejects min_participants greater than max_participants', async () => {
    await expect(svc.createCompetition(TOURNAMENT_ID, ORG, 42, {
      competition_type: 'singles', name: 'Bad', min_participants: 8, max_participants: 4,
    })).rejects.toThrow(/min_participants cannot exceed max_participants/);
    expect(compRepo.create).not.toHaveBeenCalled();
  });

  it('A5. rejects unknown configuration references (clean 422, not a raw FK error)', async () => {
    compRepo.missingReferences.mockResolvedValue(['match_format_id']);
    await expect(svc.createCompetition(TOURNAMENT_ID, ORG, 42, {
      competition_type: 'singles', name: 'S', match_format_id: 999999,
    })).rejects.toThrow(/Unknown competition reference\(s\): match_format_id/);
    expect(compRepo.create).not.toHaveBeenCalled();
  });
});

describe('G11.20 E — tenancy fails closed', () => {
  it('E1. create against a tournament owned by ANOTHER organisation is NotFound', async () => {
    tRepo.findById.mockResolvedValue({ id: TOURNAMENT_ID, organisation_id: 999 });
    await expect(svc.createCompetition(TOURNAMENT_ID, ORG, 42, {
      competition_type: 'singles', name: 'S',
    })).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_NOT_FOUND });
    expect(compRepo.create).not.toHaveBeenCalled();
  });

  it('E2. update rejects a competition belonging to ANOTHER tournament', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501, tournament_id: 200 }));
    await expect(svc.updateCompetition(TOURNAMENT_ID, 501, ORG, 42, { name: 'X' }))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_COMPETITION_NOT_FOUND });
    expect(compRepo.update).not.toHaveBeenCalled();
  });

  it('E3. deactivate rejects a competition belonging to ANOTHER tournament', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501, tournament_id: 200, is_default: 0 }));
    await expect(svc.deactivateCompetition(TOURNAMENT_ID, 501, ORG, 42))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_COMPETITION_NOT_FOUND });
    expect(compRepo.setActive).not.toHaveBeenCalled();
  });

  it('E4. update rejects when the tournament is not owned by the organisation', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501 }));
    tRepo.findById.mockResolvedValue({ id: TOURNAMENT_ID, organisation_id: 4242 });
    // resolveCompetition(..., { organisationId }) is the FIRST guard, so the org
    // mismatch surfaces as a fail-closed Competition NotFound — existence of the
    // competition is never leaked across the tenant boundary.
    await expect(svc.updateCompetition(TOURNAMENT_ID, 501, ORG, 42, { name: 'X' }))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_COMPETITION_NOT_FOUND });
    expect(compRepo.update).not.toHaveBeenCalled();
  });
});

describe('G11.20 B — UPDATE a competition category', () => {
  beforeEach(() => {
    compRepo.findById.mockResolvedValue(competition({ id: 501, name: 'Doubles', entry_fee: 250, is_default: 0 }));
  });

  it('B1. PATCH writes only the supplied keys', async () => {
    compRepo.findById
      .mockResolvedValueOnce(competition({ id: 501, name: 'Doubles', entry_fee: 250, is_default: 0 }))
      .mockResolvedValueOnce(competition({ id: 501, name: 'Doubles Doubles', entry_fee: 250, is_default: 0 }));

    await svc.updateCompetition(TOURNAMENT_ID, 501, ORG, 42, { name: 'Doubles Doubles' });

    const patch = compRepo.update.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(patch)).toEqual(['name']);
  });

  it('B2. tournament_id and is_default can NEVER be changed', async () => {
    await svc.updateCompetition(TOURNAMENT_ID, 501, ORG, 42, {
      name: 'X', tournament_id: 555, is_default: 1,
    } as any);
    const patch = compRepo.update.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.tournament_id).toBeUndefined();
    expect(patch.is_default).toBeUndefined();
  });

  it('B3. an empty patch is a no-op (no write, no audit)', async () => {
    const r = await svc.updateCompetition(TOURNAMENT_ID, 501, ORG, 42, {});
    expect(compRepo.update).not.toHaveBeenCalled();
    expect(audit.recordAudit).not.toHaveBeenCalled();
    expect(r.id).toBe(501);
  });

  it('B4. audits the before/after configuration', async () => {
    compRepo.findById
      .mockResolvedValueOnce(competition({ id: 501, name: 'Doubles', entry_fee: 250, currency_code: 'EGP', is_default: 0 }))
      .mockResolvedValueOnce(competition({ id: 501, name: 'Renamed', entry_fee: 400, currency_code: 'SAR', is_default: 0 }));
    await svc.updateCompetition(TOURNAMENT_ID, 501, ORG, 42, { name: 'Renamed', entry_fee: 400, currency_code: 'SAR' });
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'TOURNAMENT.COMPETITION_UPDATED',
      beforeState: expect.objectContaining({ name: 'Doubles', entry_fee: 250 }),
      afterState: expect.objectContaining({ name: 'Renamed', entry_fee: 400, currency_code: 'SAR' }),
    }));
  });

  it('B5. validates the MERGED min/max range (a max-only edit cannot invert it)', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501, is_default: 0, min_participants: 6, max_participants: 8 }));
    await expect(svc.updateCompetition(TOURNAMENT_ID, 501, ORG, 42, { max_participants: 4 }))
      .rejects.toThrow(/min_participants cannot exceed max_participants/);
    expect(compRepo.update).not.toHaveBeenCalled();
  });

  it('F1. refuses to shrink capacity below the participants already admitted', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501, is_default: 0, max_participants: 16 }));
    pdRepo.countParticipantsByCompetition.mockResolvedValue(12);
    await expect(svc.updateCompetition(TOURNAMENT_ID, 501, ORG, 42, { max_participants: 8 }))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_CAPACITY_FULL });
    expect(compRepo.update).not.toHaveBeenCalled();
  });

  it('F2. allows growing capacity regardless of the current active count', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501, is_default: 0, max_participants: 16 }));
    pdRepo.countParticipantsByCompetition.mockResolvedValue(12);
    compRepo.findById.mockResolvedValueOnce(competition({ id: 501, is_default: 0, max_participants: 16 }))
      .mockResolvedValueOnce(competition({ id: 501, is_default: 0, max_participants: 32 }));
    const r = await svc.updateCompetition(TOURNAMENT_ID, 501, ORG, 42, { max_participants: 32 });
    expect(r.max_participants).toBe(32);
  });
});

describe('G11.20 C/D — DEACTIVATE guards and the exactly-one-default invariant', () => {
  it('C1. the DEFAULT competition can never be deactivated', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 1, is_default: 1 }));
    await expect(svc.deactivateCompetition(TOURNAMENT_ID, 1, ORG, 42))
      .rejects.toThrow(/default competition cannot be deactivated/);
    expect(compRepo.setActive).not.toHaveBeenCalled();
  });

  it('C2. the LAST remaining competition can never be deactivated', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501, is_default: 0 }));
    compRepo.countByTournament.mockResolvedValue(1);
    await expect(svc.deactivateCompetition(TOURNAMENT_ID, 501, ORG, 42))
      .rejects.toThrow(/at least one competition category/);
    expect(compRepo.setActive).not.toHaveBeenCalled();
  });

  it('C3. refuses deactivation while ANY descendant row still references the category', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501, is_default: 0 }));
    compRepo.countDependents.mockResolvedValue({
      tournament_registrations: 0, tournament_participants: 0, tournament_seeds: 0,
      tournament_draws: 0, tournament_groups: 0, tournament_matches: 0, tournament_stages: 0,
      tournament_placements: 0, tournament_prizes: 0, tournament_prize_awards: 0,
      // any one non-zero row is enough — these cascade on delete
      tournament_seeds: 3,
    } as any);
    await expect(svc.deactivateCompetition(TOURNAMENT_ID, 501, ORG, 42))
      .rejects.toThrow(/still has registrations or tournament data/);
    expect(compRepo.setActive).not.toHaveBeenCalled();
  });

  it('C4. deactivates an unused non-default category and audits it', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501, name: 'Doubles', competition_type: 'doubles', is_default: 0 }));
    const r = await svc.deactivateCompetition(TOURNAMENT_ID, 501, ORG, 42);
    expect(r).toEqual({ deactivated: true, competition_id: 501 });
    expect(compRepo.setActive).toHaveBeenCalledWith(501, false);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'TOURNAMENT.COMPETITION_DEACTIVATED',
      beforeState: expect.objectContaining({ name: 'Doubles', competition_type: 'doubles' }),
    }));
    expect(bus.emit).toHaveBeenCalledWith('tournament:competition-deactivated', expect.anything(), expect.anything());
  });

  it('D1. createCompetition never sets is_default, so exactly-one-default is preserved by construction', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501, is_default: 0 }));
    await svc.createCompetition(TOURNAMENT_ID, ORG, 42, { competition_type: 'doubles', name: 'D' });
    // The repository method used for new categories hard-codes is_default = 0 in SQL.
    expect(compRepo.createDefault).not.toHaveBeenCalled();
    expect((compRepo.create.mock.calls[0][0] as any).is_default).toBeUndefined();
  });

  it('D2. updateCompetition cannot promote a category to default (and performs no write at all)', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501, is_default: 0 }));
    await svc.updateCompetition(TOURNAMENT_ID, 501, ORG, 42, { is_default: 1 } as any);
    // `is_default` is stripped, leaving an empty patch → no UPDATE is issued.
    expect(compRepo.update).not.toHaveBeenCalled();
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });
});

describe('G11.20 — management view', () => {
  it('reports can_deactivate = false for the default and for a category holding data', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 1, is_default: 1 }));
    const view = await svc.describeForManagement(TOURNAMENT_ID, 1, ORG);
    expect(view.can_deactivate).toBe(false);
    expect(view.is_default).toBe(true);
  });

  it('reports the exact blocking tables so the UI can explain the refusal', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501, is_default: 0 }));
    compRepo.countDependents.mockResolvedValue({
      tournament_registrations: 2, tournament_participants: 2, tournament_seeds: 0,
      tournament_draws: 0, tournament_groups: 0, tournament_matches: 0, tournament_stages: 0,
      tournament_placements: 0, tournament_prizes: 0, tournament_prize_awards: 0,
    } as any);
    pdRepo.countParticipantsByCompetition.mockResolvedValue(2);
    pdRepo.countWaitingParticipantsByCompetition.mockResolvedValue(1);
    const view = await svc.describeForManagement(TOURNAMENT_ID, 501, ORG);
    expect(view.can_deactivate).toBe(false);
    expect(view.deactivation_blockers).toEqual(['tournament_registrations', 'tournament_participants']);
    expect(view.active_participants).toBe(2);
    expect(view.waiting_participants).toBe(1);
  });

  it('allows deactivation of a clean non-default category', async () => {
    compRepo.findById.mockResolvedValue(competition({ id: 501, is_default: 0 }));
    const view = await svc.describeForManagement(TOURNAMENT_ID, 501, ORG);
    expect(view.can_deactivate).toBe(true);
  });
});