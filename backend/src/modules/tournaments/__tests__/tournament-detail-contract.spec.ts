import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ctrl from '../presentation/tournament.controller.js';

const service = vi.hoisted(() => ({
  getByIdDetailed: vi.fn(),
  getGroups: vi.fn(),
  getMatchesDetailed: vi.fn(),
  getStandings: vi.fn(),
  getRegistrations: vi.fn(),
}));

const repo = vi.hoisted(() => ({ countBracketTypeReferences: vi.fn() }));

vi.mock('../application/tournament.service.js', () => ({ tournamentService: service }));
vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn() }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));

function req(overrides: any = {}): any {
  return { params: {}, query: {}, userId: 1, ...overrides };
}

function res(): any {
  const r = { sent: null };
  r.send = vi.fn((val: any) => { r.sent = val; return r; });
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Tournament admin detail contract (UAT crash regression)', () => {
  it('getTournamentHandler returns the ENRICHED detail shape via getByIdDetailed', async () => {
    service.getByIdDetailed.mockResolvedValue({ id: 1, name: 'Padel Test Tournament', sport_name: 'Padel', max_players: 16, type: 'platform' });
    const reply = res();
    await ctrl.getTournamentHandler(req({ params: { id: '1' } }), reply);
    expect(service.getByIdDetailed).toHaveBeenCalledWith(1);
    expect(reply.sent.sport_name).toBe('Padel');
    expect(reply.sent.max_players).toBe(16);
  });

  it('getGroupsHandler returns a RAW array (not { data })', async () => {
    service.getGroups.mockResolvedValue([{ id: 1, name: 'A' }]);
    const reply = res();
    await ctrl.getGroupsHandler(req({ params: { id: '1' } }), reply);
    expect(Array.isArray(reply.sent)).toBe(true);
    expect(reply.sent).toHaveLength(1);
  });

  it('getAdminMatchesHandler returns a RAW array (not { data })', async () => {
    service.getMatchesDetailed.mockResolvedValue([{ id: 1, round: 1 }]);
    const reply = res();
    await ctrl.getAdminMatchesHandler(req({ params: { id: '1' } }), reply);
    expect(Array.isArray(reply.sent)).toBe(true);
    expect(reply.sent).toHaveLength(1);
  });

  it('getAdminStandingsHandler returns a RAW array (not { data })', async () => {
    service.getStandings.mockResolvedValue([{ registration_id: 1, points: 3 }]);
    const reply = res();
    await ctrl.getAdminStandingsHandler(req({ params: { id: '1' } }), reply);
    expect(Array.isArray(reply.sent)).toBe(true);
    expect(reply.sent).toHaveLength(1);
  });

  it('getRegistrationsHandler returns a RAW array (not { data })', async () => {
    service.getRegistrations.mockResolvedValue([{ id: 1, status: 'registered' }]);
    const reply = res();
    await ctrl.getRegistrationsHandler(req({ params: { id: '1' } }), reply);
    expect(Array.isArray(reply.sent)).toBe(true);
    expect(reply.sent).toHaveLength(1);
  });
});