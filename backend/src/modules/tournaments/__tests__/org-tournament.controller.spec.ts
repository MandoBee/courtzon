import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../shared/errors/app-error.js';

const repo = vi.hoisted(() => ({
  listForOrg: vi.fn(),
  getOrganisationId: vi.fn(),
  getRegistrationOrganisationId: vi.fn(),
  getMatchOrganisationId: vi.fn(),
}));

const service = vi.hoisted(() => ({
  getById: vi.fn(),
  getByIdDetailed: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  publish: vi.fn(),
  openRegistration: vi.fn(),
  closeRegistration: vi.fn(),
  startTournament: vi.fn(),
  complete: vi.fn(),
  cancel: vi.fn(),
  archive: vi.fn(),
  getRegistrations: vi.fn(),
  register: vi.fn(),
  cancelRegistration: vi.fn(),
  confirmRegistration: vi.fn(),
  generateGroups: vi.fn(),
  getGroups: vi.fn(),
  getMatches: vi.fn(),
  getMatchesDetailed: vi.fn(),
  getStandings: vi.fn(),
  getBracket: vi.fn(),
  createStage: vi.fn(),
  getStages: vi.fn(),
  assignCourt: vi.fn(),
  assignReferee: vi.fn(),
  recordMatchResult: vi.fn(),
  recordSharedResult: vi.fn(),
  startTournamentMatch: vi.fn(),
  completeTournamentMatch: vi.fn(),
  listBracketTypes: vi.fn(),
  listBracketTypeOptions: vi.fn(),
  getOrgCommissionConfig: vi.fn(),
  listSportFormatsCascade: vi.fn(),
}));

const drawService = vi.hoisted(() => ({
  generateDraw: vi.fn(),
  getCurrentDraw: vi.fn(),
  validateDraw: vi.fn(),
  approveDraw: vi.fn(),
  lockDraw: vi.fn(),
}));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../application/tournament.service.js', () => ({ tournamentService: service }));
vi.mock('../application/participant-draw.service.js', () => ({ participantDrawService: drawService }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));

import * as ctrl from '../presentation/org-tournament.controller.js';

const ORG_A = 1001;
const ORG_B = 2002;

function req(overrides: any = {}): any {
  return {
    params: {},
    body: {},
    query: {},
    userId: 42,
    ...overrides,
  };
}

function res(): any {
  const r = { sent: null, statusCode: 200 };
  r.send = vi.fn((val: any) => { r.sent = val; return r; });
  r.status = vi.fn((code: number) => { r.statusCode = code; return r; });
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('org-tournament.controller (tenant isolation)', () => {
  it('list: delegates to repository.listForOrg with the URL scoped orgId', async () => {
    repo.listForOrg.mockResolvedValue({ data: [], total: 0 });
    const reply = res();
    await ctrl.listOrgTournamentsHandler(req({ params: { orgId: String(ORG_A) }, query: { page: 1 } }), reply);
    expect(repo.listForOrg).toHaveBeenCalledWith(ORG_A, expect.objectContaining({ page: 1 }));
    expect(reply.sent).toEqual({ data: [], total: 0 });
  });

  it('get: allows a tournament owned by the scoped org (enriched detail shape)', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    service.getByIdDetailed.mockResolvedValue({ id: 7, organisation_id: ORG_A, name: 'T', sport_name: 'Padel', max_players: 16, prizes: [{ id: 1, placement: 1, prize_type: 'cash', amount: 100, currency_code: 'USD', display_order: 0 }] });
    const reply = res();
    await ctrl.getOrgTournamentHandler(req({ params: { orgId: String(ORG_A), id: '7' } }), reply);
    expect(service.getByIdDetailed).toHaveBeenCalledWith(7);
    expect(reply.sent.name).toBe('T');
    // Group 2 — org detail carries structured prizes.
    expect(reply.sent.prizes).toHaveLength(1);
    expect(reply.sent.prizes[0].prize_type).toBe('cash');
  });

  it('create: passes structured prizes through with the org-forced body (tenant-scoped)', async () => {
    service.create.mockResolvedValue({ id: 9, organisation_id: ORG_A });
    const reply = res();
    await ctrl.createOrgTournamentHandler(
      req({ params: { orgId: String(ORG_A) }, body: { name: 'X', organisation_id: ORG_B, max_participants: 8, bracket_type_id: 1, start_date: '2026-10-01', prizes: [{ placement: 1, prize_type: 'cash', amount: 100, currency_code: 'EGP' }] } }),
      reply,
    );
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ organisation_id: ORG_A, prizes: [{ placement: 1, prize_type: 'cash', amount: 100, currency_code: 'EGP' }] }), 42);
    expect(reply.statusCode).toBe(201);
  });

  it('update: rejects cross-tenant prize modification before delegating', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_B);
    const reply = res();
    await expect(ctrl.updateOrgTournamentHandler(
      req({ params: { orgId: String(ORG_A), id: '7' }, body: { prizes: [{ placement: 1, prize_type: 'trophy' }] } }),
      reply,
    )).rejects.toMatchObject({ statusCode: 404, errorCode: 'TOURNAMENT_NOT_FOUND' });
    expect(service.update).not.toHaveBeenCalled();
  });

  it('get: rejects a tournament owned by a DIFFERENT org (cross-tenant leak blocked)', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_B);
    const reply = res();
    await expect(ctrl.getOrgTournamentHandler(req({ params: { orgId: String(ORG_A), id: '7' } }), reply))
      .rejects.toThrow(AppError);
    await expect(ctrl.getOrgTournamentHandler(req({ params: { orgId: String(ORG_A), id: '7' } }), reply))
      .rejects.toMatchObject({ statusCode: 404, errorCode: 'TOURNAMENT_NOT_FOUND' });
    expect(service.getByIdDetailed).not.toHaveBeenCalled();
  });

  it('create: forces organisation_id to the URL org and never trusts the client body', async () => {
    service.create.mockResolvedValue({ id: 9, organisation_id: ORG_A });
    const reply = res();
    await ctrl.createOrgTournamentHandler(
      req({ params: { orgId: String(ORG_A) }, body: { name: 'X', organisation_id: ORG_B, max_participants: 8, bracket_type_id: 1, start_date: '2026-10-01' } }),
      reply,
    );
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ organisation_id: ORG_A }), 42);
    expect(reply.statusCode).toBe(201);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.CREATE', entityId: 9 }));
  });

  it('register: asserts tournament ownership, then delegates with the AUTHENTICATED user (never client ids)', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    service.register.mockResolvedValue({ id: 5 });
    const reply = res();
    await ctrl.registerOrgPlayerHandler(
      req({ params: { orgId: String(ORG_A), id: '7' }, body: { team_id: '3' } }),
      reply,
    );
    expect(service.register).toHaveBeenCalledWith(7, 42, 3, undefined, { operatorBypass: true });
    expect(reply.statusCode).toBe(201);
  });

  it('register: rejects when the tournament belongs to another org', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_B);
    const reply = res();
    await expect(ctrl.registerOrgPlayerHandler(req({ params: { orgId: String(ORG_A), id: '7' } }), reply))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(service.register).not.toHaveBeenCalled();
  });

  it('cancel/confirm registration: ownership asserted via the registration row', async () => {
    repo.getRegistrationOrganisationId.mockResolvedValue(ORG_A);
    service.cancelRegistration.mockResolvedValue({});
    await ctrl.cancelOrgRegistrationHandler(req({ params: { orgId: String(ORG_A), regId: '10' } }), res());
    expect(service.cancelRegistration).toHaveBeenCalledWith(10);

    repo.getRegistrationOrganisationId.mockResolvedValue(ORG_B);
    await expect(ctrl.cancelOrgRegistrationHandler(req({ params: { orgId: String(ORG_A), regId: '10' } }), res()))
      .rejects.toMatchObject({ statusCode: 404, errorCode: 'REGISTRATION_NOT_FOUND' });
    expect(service.confirmRegistration).not.toHaveBeenCalled();
  });

  it('match result: only org-owned matches accept a result through the shared lifecycle', async () => {
    repo.getMatchOrganisationId.mockResolvedValue(ORG_A);
    service.recordSharedResult.mockResolvedValue({ resultId: 3, sharedMatchId: 900 });
    const payload = { outcome: 'completed', score: { sets: [{ home: 6, away: 4 }] } };
    const reply = res();
    await ctrl.recordOrgMatchResultHandler(
      req({ params: { orgId: String(ORG_A), matchId: '77' }, body: payload }),
      reply,
    );
    expect(service.recordSharedResult).toHaveBeenCalledWith(77, 42, payload, undefined);
    expect(reply.statusCode).toBe(201);

    repo.getMatchOrganisationId.mockResolvedValue(ORG_B);
    await expect(ctrl.recordOrgMatchResultHandler(req({ params: { orgId: String(ORG_A), matchId: '77' }, body: payload }), res()))
      .rejects.toMatchObject({ statusCode: 404, errorCode: 'MATCH_NOT_FOUND' });
    expect(service.recordSharedResult).toHaveBeenCalledTimes(1);
  });

  it('start/complete match: org-tenanted via the match row (T-B shared session bridge)', async () => {
    repo.getMatchOrganisationId.mockResolvedValue(ORG_A);
    service.startTournamentMatch.mockResolvedValue({ status: 'in_progress' });
    service.completeTournamentMatch.mockResolvedValue({ status: 'completed' });
    await ctrl.startOrgTournamentMatchHandler(req({ params: { orgId: String(ORG_A), matchId: '77' } }), res());
    expect(service.startTournamentMatch).toHaveBeenCalledWith(77, 42);
    await ctrl.completeOrgTournamentMatchHandler(req({ params: { orgId: String(ORG_A), matchId: '77' } }), res());
    expect(service.completeTournamentMatch).toHaveBeenCalledWith(77, 42);

    repo.getMatchOrganisationId.mockResolvedValue(ORG_B);
    await expect(ctrl.startOrgTournamentMatchHandler(req({ params: { orgId: String(ORG_A), matchId: '77' } }), res()))
      .rejects.toMatchObject({ statusCode: 404, errorCode: 'MATCH_NOT_FOUND' });
  });

  it('court/referee assignment: org-tenanted via the match row', async () => {
    repo.getMatchOrganisationId.mockResolvedValue(ORG_A);
    service.assignCourt.mockResolvedValue({});
    service.assignReferee.mockResolvedValue({});
    await ctrl.assignOrgCourtHandler(req({ params: { orgId: String(ORG_A), matchId: '77' }, body: { resource_id: 5 } }), res());
    expect(service.assignCourt).toHaveBeenCalledWith(77, 5);
    await ctrl.assignOrgRefereeHandler(req({ params: { orgId: String(ORG_A), matchId: '77' }, body: { referee_id: 9 } }), res());
    expect(service.assignReferee).toHaveBeenCalledWith(77, 9);

    repo.getMatchOrganisationId.mockResolvedValue(ORG_B);
    await expect(ctrl.assignOrgCourtHandler(req({ params: { orgId: String(ORG_A), matchId: '77' }, body: { resource_id: 5 } }), res()))
      .rejects.toMatchObject({ statusCode: 404, errorCode: 'MATCH_NOT_FOUND' });
  });

  it('lifecycle: publish asserts ownership then calls the SAME service action', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    service.publish.mockResolvedValue({ id: 7, status: 'published' });
    await ctrl.publishOrgTournamentHandler(req({ params: { orgId: String(ORG_A), id: '7' } }), res());
    expect(service.publish).toHaveBeenCalledWith(7);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.PUBLISH', entityId: 7 }));
  });

  it('groups/fixtures generation and stage creation: tenanted and audited', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    service.generateGroups.mockResolvedValue({});
    await ctrl.generateOrgGroupsHandler(req({ params: { orgId: String(ORG_A), id: '7' }, body: { group_size: 4, advance_count: 2 } }), res());
    expect(service.generateGroups).toHaveBeenCalledWith(7, 4, 2, undefined);

    service.createStage.mockResolvedValue({ id: 2 });
    const reply = res();
    await ctrl.createOrgStageHandler(req({ params: { orgId: String(ORG_A), id: '7' }, body: { stage_order: 1, name: 'Knockout', progression_format: 'knockout', advance_count: 4 } }), reply);
    expect(service.createStage).toHaveBeenCalledWith(7, expect.objectContaining({ stage_order: 1 }));
    expect(reply.statusCode).toBe(201);

    repo.getOrganisationId.mockResolvedValue(ORG_B);
    await expect(ctrl.generateOrgGroupsHandler(req({ params: { orgId: String(ORG_A), id: '7' }, body: { group_size: 4, advance_count: 2 } }), res()))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('Group 5B-SR: org commission config is resolved against the scoped org (tenant-isolated)', async () => {
    service.getOrgCommissionConfig.mockResolvedValue({ commissionRate: 10, planName: 'Standard Club' });
    const reply = res();
    await ctrl.getOrgCommissionConfigHandler(req({ params: { orgId: String(ORG_A) } }), reply);
    expect(service.getOrgCommissionConfig).toHaveBeenCalledWith(ORG_A);
    expect(reply.sent).toEqual({ commissionRate: 10, planName: 'Standard Club' });
  });

  it('Group 5B-SR: bracket types + sport formats cascade are tenant-scoped org reads', async () => {
    service.listBracketTypeOptions.mockResolvedValue({
      data: [{ id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: true, engine_capability: 'ready', creation_available: true }],
      registry: [{ format: 'group_stage_knockout', name: 'Group Stage + Knockout', type: 'composite', source: 'engine_registry', engine_capability: 'ready', creation_available: true, toggleable: false }],
    });
    const btReply = res();
    await ctrl.listActiveBracketTypesHandler(req({ params: { orgId: String(ORG_A) } }), btReply);
    expect(btReply.sent.data).toHaveLength(1);
    expect(btReply.sent.registry[0].format).toBe('group_stage_knockout');
    expect(btReply.sent.data[0]).toMatchObject({ engine_capability: 'ready', creation_available: true });

    service.listSportFormatsCascade.mockResolvedValue([]);
    const fmtReply = res();
    await ctrl.listSportFormatsCascadeHandler(req({ params: { orgId: String(ORG_A), sportId: '22' } }), fmtReply);
    expect(service.listSportFormatsCascade).toHaveBeenCalledWith(22, undefined);

    // Group 1A — the create-form cascade may carry a selected bracket type.
    await ctrl.listSportFormatsCascadeHandler(req({ params: { orgId: String(ORG_A), sportId: '22' }, query: { bracket_type_id: '1' } }), res());
    expect(service.listSportFormatsCascade).toHaveBeenCalledWith(22, 1);
  });

  it('G8: eligible-courts listing is tenant-isolated (cross-org blocked before any service call)', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_B);
    await expect(ctrl.listOrgEligibleCourtsHandler(req({ params: { orgId: String(ORG_A), id: '7' } }), res()))
      .rejects.toMatchObject({ statusCode: 404, errorCode: 'TOURNAMENT_NOT_FOUND' });
  });
});

describe('org-tournament.controller — competition-scoped draw generation', () => {
  const ORG_A = 1001;

  it('forwards the selected competition_id to the service (multi-competition draw)', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    drawService.generateDraw.mockResolvedValue({ id: 501, competition_id: 11 });
    const reply = res();
    await ctrl.generateOrgDrawHandler(
      req({ params: { orgId: String(ORG_A), id: '9' }, body: { competition_id: 11 } }),
      reply,
    );
    expect(drawService.generateDraw).toHaveBeenCalledWith(9, 42, undefined, 11);
    expect(reply.sent).toMatchObject({ id: 501, competition_id: 11 });
  });

  it('forwards draw_seed AND competition_id together', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    drawService.generateDraw.mockResolvedValue({ id: 502 });
    await ctrl.generateOrgDrawHandler(
      req({ params: { orgId: String(ORG_A), id: '9' }, body: { draw_seed: 777, competition_id: 12 } }),
      res(),
    );
    expect(drawService.generateDraw).toHaveBeenCalledWith(9, 42, 777, 12);
  });

  it('omits the competition scope when none is supplied (single-competition / legacy compatible)', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    drawService.generateDraw.mockResolvedValue({ id: 503 });
    await ctrl.generateOrgDrawHandler(req({ params: { orgId: String(ORG_A), id: '9' }, body: {} }), res());
    expect(drawService.generateDraw).toHaveBeenCalledWith(9, 42, undefined, undefined);
  });

  it('rejects a malformed competition_id at the DTO boundary before any service call', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    await expect(
      ctrl.generateOrgDrawHandler(req({ params: { orgId: String(ORG_A), id: '9' }, body: { competition_id: 'not-a-number' } }), res()),
    ).rejects.toThrow();
    expect(drawService.generateDraw).not.toHaveBeenCalled();
  });

  it('rejects a non-positive competition_id at the DTO boundary', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    await expect(
      ctrl.generateOrgDrawHandler(req({ params: { orgId: String(ORG_A), id: '9' }, body: { competition_id: 0 } }), res()),
    ).rejects.toThrow();
    expect(drawService.generateDraw).not.toHaveBeenCalled();
  });

  it('cannot generate a draw for a tournament owned by another org (tenancy enforced before delegating)', async () => {
    repo.getOrganisationId.mockResolvedValue(2002); // ORG_B
    await expect(
      ctrl.generateOrgDrawHandler(req({ params: { orgId: String(ORG_A), id: '9' }, body: { competition_id: 11 } }), res()),
    ).rejects.toMatchObject({ statusCode: 404, errorCode: 'TOURNAMENT_NOT_FOUND' });
    expect(drawService.generateDraw).not.toHaveBeenCalled();
  });

  it('propagates a competition that does not belong to this tournament (service fail-closed)', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    drawService.generateDraw.mockRejectedValue(
      new AppError('Competition not found', 404, 'TOURNAMENT_COMPETITION_NOT_FOUND'),
    );
    await expect(
      ctrl.generateOrgDrawHandler(req({ params: { orgId: String(ORG_A), id: '9' }, body: { competition_id: 999 } }), res()),
    ).rejects.toMatchObject({ statusCode: 404, errorCode: 'TOURNAMENT_COMPETITION_NOT_FOUND' });
    expect(drawService.generateDraw).toHaveBeenCalledWith(9, 42, undefined, 999);
  });

  it('read: forwards competition_id from the query string (multi-competition current draw)', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    drawService.getCurrentDraw.mockResolvedValue({ id: 601, competition_id: 11 });
    const reply = res();
    await ctrl.getOrgCurrentDrawHandler(
      req({ params: { orgId: String(ORG_A), id: '9' }, query: { competition_id: '11' } }),
      reply,
    );
    expect(drawService.getCurrentDraw).toHaveBeenCalledWith(9, 11);
    expect(reply.sent).toMatchObject({ id: 601, competition_id: 11 });
  });

  it('read: omits scope when the query has no competition_id (single-competition / legacy compatible)', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    drawService.getCurrentDraw.mockResolvedValue(null);
    await ctrl.getOrgCurrentDrawHandler(req({ params: { orgId: String(ORG_A), id: '9' }, query: {} }), res());
    expect(drawService.getCurrentDraw).toHaveBeenCalledWith(9, undefined);
  });

  it('validate: forwards competition_id from the query string', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    drawService.validateDraw.mockResolvedValue({ valid: true });
    await ctrl.validateOrgDrawHandler(
      req({ params: { orgId: String(ORG_A), id: '9' }, query: { competition_id: '12' } }),
      res(),
    );
    expect(drawService.validateDraw).toHaveBeenCalledWith(9, 12);
  });

  it('approve: forwards competition_id from the body', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    drawService.approveDraw.mockResolvedValue({ id: 602, status: 'approved' });
    await ctrl.approveOrgDrawHandler(
      req({ params: { orgId: String(ORG_A), id: '9' }, body: { competition_id: 11 } }),
      res(),
    );
    expect(drawService.approveDraw).toHaveBeenCalledWith(9, 42, 11);
  });

  it('lock: forwards competition_id from the body', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    drawService.lockDraw.mockResolvedValue({ id: 603, status: 'locked' });
    await ctrl.lockOrgDrawHandler(
      req({ params: { orgId: String(ORG_A), id: '9' }, body: { competition_id: 12 } }),
      res(),
    );
    expect(drawService.lockDraw).toHaveBeenCalledWith(9, 42, 12);
  });

  it('approve/lock: empty or absent body omits scope (legacy compatible)', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    drawService.approveDraw.mockResolvedValue({});
    drawService.lockDraw.mockResolvedValue({});
    await ctrl.approveOrgDrawHandler(req({ params: { orgId: String(ORG_A), id: '9' }, body: {} }), res());
    expect(drawService.approveDraw).toHaveBeenCalledWith(9, 42, undefined);
    await ctrl.lockOrgDrawHandler(req({ params: { orgId: String(ORG_A), id: '9' }, body: undefined }), res());
    expect(drawService.lockDraw).toHaveBeenCalledWith(9, 42, undefined);
  });

  it('read/validate: reject a malformed competition_id in the query before delegating', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    await expect(
      ctrl.getOrgCurrentDrawHandler(req({ params: { orgId: String(ORG_A), id: '9' }, query: { competition_id: 'abc' } }), res()),
    ).rejects.toThrow();
    await expect(
      ctrl.validateOrgDrawHandler(req({ params: { orgId: String(ORG_A), id: '9' }, query: { competition_id: 0 } }), res()),
    ).rejects.toThrow();
    expect(drawService.getCurrentDraw).not.toHaveBeenCalled();
    expect(drawService.validateDraw).not.toHaveBeenCalled();
  });

  it('read/approve: cross-tenant draw operations are blocked before delegating', async () => {
    repo.getOrganisationId.mockResolvedValue(2002); // ORG_B
    await expect(
      ctrl.getOrgCurrentDrawHandler(req({ params: { orgId: String(ORG_A), id: '9' }, query: { competition_id: '11' } }), res()),
    ).rejects.toMatchObject({ statusCode: 404, errorCode: 'TOURNAMENT_NOT_FOUND' });
    await expect(
      ctrl.approveOrgDrawHandler(req({ params: { orgId: String(ORG_A), id: '9' }, body: { competition_id: 11 } }), res()),
    ).rejects.toMatchObject({ statusCode: 404, errorCode: 'TOURNAMENT_NOT_FOUND' });
    expect(drawService.getCurrentDraw).not.toHaveBeenCalled();
    expect(drawService.approveDraw).not.toHaveBeenCalled();
  });
});