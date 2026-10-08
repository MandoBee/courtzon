import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ctrl from '../presentation/tournament.controller.js';
import * as orgCtrl from '../presentation/org-tournament.controller.js';

const repo = vi.hoisted(() => ({
  getOrganisationId: vi.fn(),
  getRegistrationOrganisationId: vi.fn(),
}));

const service = vi.hoisted(() => ({
  getMatchesDetailed: vi.fn(),
  getMatches: vi.fn(),
}));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const pool = vi.hoisted(() => ({ query: vi.fn(async () => [[]]), execute: vi.fn(async () => [[]]) }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const mrRepo = vi.hoisted(() => ({}));
const matchServiceMock = vi.hoisted(() => ({ createForTournament: vi.fn() }));
const commission = vi.hoisted(() => ({ getCommissionRate: vi.fn(), getCurrentSubscription: vi.fn() }));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../application/tournament.service.js', () => ({ tournamentService: service }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mrRepo }));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: matchServiceMock }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({
  getCommissionRate: commission.getCommissionRate,
  getCurrentSubscription: commission.getCurrentSubscription,
}));
vi.mock('../application/tournament-prize-award.service.js', () => ({ tournamentPrizeAwardService: {} }));

const MATCH = {
  id: 101, tournament_id: 1, match_id: 900, round: 1, round_name: 'Round 1', match_number: 4,
  bracket_position: 0, status: 'scheduled', progression_state: 'pending',
  player1_id: 10, player2_id: 20, participant1_id: 100, participant2_id: 200,
  player1_name: 'Ali', player2_name: 'Sara', resource_name: 'Court A', referee_name: 'Ref 1',
  score_summary: null, shared_status: 'open', booking_id: 77,
  rule_snapshot: { score_structure: 'sets' },
  stage_id: 2, group_id: 3, stage_name: 'Knockout', stage_order: 2, stage_progression_format: 'knockout',
  group_name: 'B', result_id: 55, result_status: 'pending_confirmation',
};

function req(overrides: any = {}): any {
  return { params: {}, body: {}, query: {}, ip: '::1', headers: {}, userId: 7, ...overrides };
}

function res(): any {
  const r: any = { sent: undefined };
  r.send = (body: any) => { r.sent = body; };
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  service.getMatchesDetailed.mockResolvedValue([MATCH]);
  repo.getOrganisationId.mockResolvedValue(1);
});

describe('Canonical match read contract — controllers', () => {
  it('admin handler returns the RAW array with existing + additive fields (Hub contract)', async () => {
    const reply = res();
    await ctrl.getAdminMatchesHandler(req({ params: { id: '1' } }), reply);
    expect(Array.isArray(reply.sent)).toBe(true);
    const m = reply.sent[0];
    expect(m).toMatchObject({ id: 101, match_id: 900, status: 'scheduled', player1_name: 'Ali', referee_name: 'Ref 1' });
    expect(m).toMatchObject({ stage_name: 'Knockout', group_name: 'B', result_status: 'pending_confirmation', stage_progression_format: 'knockout' });
    expect(service.getMatchesDetailed).toHaveBeenCalledWith(1);
  });

  it('player/public handler keeps the { data } envelope with the same detailed rows', async () => {
    const reply = res();
    await ctrl.getMatchesHandler(req({ params: { id: '1' } }), reply);
    expect(Array.isArray(reply.sent.data)).toBe(true);
    expect(reply.sent.data[0].group_name).toBe('B');
    expect(reply.sent.data[0].result_status).toBe('pending_confirmation');
  });

  it('organisation scope is enforced for org match reads (cross-org blocked before any data access)', async () => {
    repo.getOrganisationId.mockResolvedValue(2002);
    await expect(orgCtrl.getOrgMatchesHandler(req({ params: { orgId: '1001', id: '7' } }), res()))
      .rejects.toMatchObject({ statusCode: 404, errorCode: 'TOURNAMENT_NOT_FOUND' });
    expect(service.getMatchesDetailed).not.toHaveBeenCalled();
  });

  it('organisation scope passes through for the owning org (raw array, same contract)', async () => {
    const reply = res();
    await orgCtrl.getOrgMatchesHandler(req({ params: { orgId: '1', id: '7' } }), reply);
    expect(Array.isArray(reply.sent)).toBe(true);
    expect(reply.sent[0].stage_name).toBe('Knockout');
  });

  it('does not add unexpected private fields — the row shape is the documented additive union', async () => {
    const reply = res();
    await ctrl.getAdminMatchesHandler(req({ params: { id: '1' } }), reply);
    const allowed = new Set(Object.keys(MATCH));
    for (const key of Object.keys(reply.sent[0])) {
      expect(allowed.has(key) || key === 'resource_id' || key === 'referee_id').toBe(true);
    }
  });
});