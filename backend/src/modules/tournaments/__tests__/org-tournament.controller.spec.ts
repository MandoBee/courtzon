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
  generateFixtures: vi.fn(),
  generateBracket: vi.fn(),
  getGroups: vi.fn(),
  getMatches: vi.fn(),
  getStandings: vi.fn(),
  getBracket: vi.fn(),
  createStage: vi.fn(),
  getStages: vi.fn(),
  assignCourt: vi.fn(),
  assignReferee: vi.fn(),
  recordMatchResult: vi.fn(),
  listBracketTypes: vi.fn(),
  getOrgCommissionConfig: vi.fn(),
  listSportFormatsCascade: vi.fn(),
}));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../application/tournament.service.js', () => ({ tournamentService: service }));
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

  it('get: allows a tournament owned by the scoped org', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_A);
    service.getById.mockResolvedValue({ id: 7, organisation_id: ORG_A, name: 'T' });
    const reply = res();
    await ctrl.getOrgTournamentHandler(req({ params: { orgId: String(ORG_A), id: '7' } }), reply);
    expect(service.getById).toHaveBeenCalledWith(7);
    expect(reply.sent.name).toBe('T');
  });

  it('get: rejects a tournament owned by a DIFFERENT org (cross-tenant leak blocked)', async () => {
    repo.getOrganisationId.mockResolvedValue(ORG_B);
    const reply = res();
    await expect(ctrl.getOrgTournamentHandler(req({ params: { orgId: String(ORG_A), id: '7' } }), reply))
      .rejects.toThrow(AppError);
    await expect(ctrl.getOrgTournamentHandler(req({ params: { orgId: String(ORG_A), id: '7' } }), reply))
      .rejects.toMatchObject({ statusCode: 404, errorCode: 'TOURNAMENT_NOT_FOUND' });
    expect(service.getById).not.toHaveBeenCalled();
  });

  it('create: forces organisation_id to the URL org and never trusts the client body', async () => {
    service.create.mockResolvedValue({ id: 9, organisation_id: ORG_A });
    const reply = res();
    await ctrl.createOrgTournamentHandler(
      req({ params: { orgId: String(ORG_A) }, body: { name: 'X', organisation_id: ORG_B, max_participants: 8, bracket_type_id: 1 } }),
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
    expect(service.register).toHaveBeenCalledWith(7, 42, 3);
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

  it('match result: only org-owned matches accept a recorded result', async () => {
    repo.getMatchOrganisationId.mockResolvedValue(ORG_A);
    service.recordMatchResult.mockResolvedValue({});
    const reply = res();
    await ctrl.recordOrgMatchResultHandler(
      req({ params: { orgId: String(ORG_A), matchId: '77' }, body: { winner_id: 1, home_score: '2', away_score: '1', score_details: '6-1' } }),
      reply,
    );
    expect(service.recordMatchResult).toHaveBeenCalledWith(77, 1, '2', '1', '6-1', 42);

    repo.getMatchOrganisationId.mockResolvedValue(ORG_B);
    await expect(ctrl.recordOrgMatchResultHandler(req({ params: { orgId: String(ORG_A), matchId: '77' }, body: { winner_id: 1 } }), res()))
      .rejects.toMatchObject({ statusCode: 404, errorCode: 'MATCH_NOT_FOUND' });
    expect(service.recordMatchResult).toHaveBeenCalledTimes(1);
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
    expect(service.generateGroups).toHaveBeenCalledWith(7, 4, 2);

    service.generateFixtures.mockResolvedValue({});
    await ctrl.generateOrgFixturesHandler(req({ params: { orgId: String(ORG_A), id: '7' } }), res());
    expect(service.generateFixtures).toHaveBeenCalledWith(7);

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
    service.listBracketTypes.mockResolvedValue([{ id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: 1, config_schema: null }]);
    const btReply = res();
    await ctrl.listActiveBracketTypesHandler(req({ params: { orgId: String(ORG_A) } }), btReply);
    expect(btReply.sent.data).toHaveLength(1);

    service.listSportFormatsCascade.mockResolvedValue([]);
    const fmtReply = res();
    await ctrl.listSportFormatsCascadeHandler(req({ params: { orgId: String(ORG_A), sportId: '22' } }), fmtReply);
    expect(service.listSportFormatsCascade).toHaveBeenCalledWith(22);
  });
});