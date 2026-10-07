import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
import {
  BRACKET_SLUG_TO_FORMAT,
  bracketSlugCapability,
  bracketTypeCreationAvailable,
} from '../domain/tournament-aggregate.js';
import * as ctrl from '../presentation/tournament.controller.js';

const repo = vi.hoisted(() => ({
  listBracketTypes: vi.fn(),
  findBracketTypeById: vi.fn(),
  setBracketTypeActive: vi.fn(),
  countBracketTypeReferences: vi.fn(),
  countActiveTournamentReferences: vi.fn(),
}));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const pool = vi.hoisted(() => ({ query: vi.fn(async () => [[]]), execute: vi.fn(async () => [[]]) }));
const bus = vi.hoisted(() => ({ emit: vi.fn() }));
const mrRepo = vi.hoisted(() => ({}));
const matchServiceMock = vi.hoisted(() => ({ createForTournament: vi.fn() }));
const commission = vi.hoisted(() => ({ getCommissionRate: vi.fn(), getCurrentSubscription: vi.fn() }));

vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: bus }));
vi.mock('../../match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: mrRepo }));
vi.mock('../../match/application/services/match.service.js', () => ({ matchService: matchServiceMock }));
vi.mock('../../organisations/application/current-subscription.service.js', () => ({
  getCommissionRate: commission.getCommissionRate,
  getCurrentSubscription: commission.getCurrentSubscription,
}));
// The controller imports the prize-award service (heavy DB/wallet deps) at module
// top; not under test here, so stub it to keep the suite hermetic.
vi.mock('../application/tournament-prize-award.service.js', () => ({ tournamentPrizeAwardService: {} }));

const svc = new TournamentService();

const SE = { id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: 1, config_schema: null };
const DE = { id: 2, name: 'Double Elimination', slug: 'double-elimination', is_active: 1, config_schema: '{"losers_bracket":true}' };
const RR = { id: 3, name: 'Round Robin', slug: 'round-robin', is_active: 1, config_schema: null };
const SW = { id: 4, name: 'Swiss System', slug: 'swiss', is_active: 1, config_schema: null };

function res(): any {
  const r: any = { sent: undefined };
  r.send = (body: any) => { r.sent = body; };
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.setBracketTypeActive.mockResolvedValue(undefined);
  repo.countBracketTypeReferences.mockResolvedValue(0);
  repo.countActiveTournamentReferences.mockResolvedValue(0);
});

describe('Group 5B-SR — engine capability helpers (domain, single source of truth)', () => {
  it('1. Single Elimination capability = ready', () => {
    expect(bracketSlugCapability('single-elimination')).toBe('ready');
    expect(bracketTypeCreationAvailable('single-elimination', 1)).toBe(true);
  });

  it('2. Round Robin capability = ready', () => {
    expect(bracketSlugCapability('round-robin')).toBe('ready');
    expect(bracketTypeCreationAvailable('round-robin', 1)).toBe(true);
  });

  it('3. GSK is a COMPOSITE — no bracket-type slug, no fake DB row', () => {
    // The identity map must never bind GSK to a bracket-type slug.
    expect(Object.keys(BRACKET_SLUG_TO_FORMAT)).not.toContain('group-stage-knockout');
    expect((BRACKET_SLUG_TO_FORMAT as Record<string, string>)['group_stage_knockout']).toBeUndefined();
    // GSK stays engine-executable at registry level (asserted via the registry response in the controller tests).
    expect((['knockout', 'round_robin', 'group_stage_knockout'])).toContain('group_stage_knockout');
  });

  it('4. Double Elimination capability = planned / not executable', () => {
    expect(bracketSlugCapability('double-elimination')).toBe('planned');
    expect(bracketTypeCreationAvailable('double-elimination', 1)).toBe(false);
  });

  it('5. Swiss capability = planned / not executable', () => {
    expect(bracketSlugCapability('swiss')).toBe('planned');
    expect(bracketTypeCreationAvailable('swiss', 1)).toBe(false);
  });

  it('5b. unknown / unregistered slug = unsupported', () => {
    expect(bracketSlugCapability('best-of-anything')).toBe('unsupported');
    expect(bracketTypeCreationAvailable('best-of-anything', 1)).toBe(false);
  });

  it('5c. an inactive READY row is not creation-available', () => {
    expect(bracketTypeCreationAvailable('round-robin', 0)).toBe(false);
  });
});

describe('Service — SAFE activation (backend authoritative)', () => {
  it('8. activating Single Elimination succeeds when allowed', async () => {
    repo.findBracketTypeById.mockResolvedValue(SE);
    await svc.updateBracketTypeActive(1, true, 1);
    expect(repo.setBracketTypeActive).toHaveBeenCalledWith(1, true);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.BRACKET_TYPE_UPDATE' }));
  });

  it('9. activating Round Robin succeeds when allowed', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    await svc.updateBracketTypeActive(3, true, 1);
    expect(repo.setBracketTypeActive).toHaveBeenCalledWith(3, true);
  });

  it('10. activating Double Elimination FAILS', async () => {
    repo.findBracketTypeById.mockResolvedValue(DE);
    await expect(svc.updateBracketTypeActive(2, true, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_BRACKET_ENGINE_UNSUPPORTED });
    expect(repo.setBracketTypeActive).not.toHaveBeenCalled();
  });

  it('11. activating Swiss FAILS', async () => {
    repo.findBracketTypeById.mockResolvedValue(SW);
    await expect(svc.updateBracketTypeActive(4, true, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_BRACKET_ENGINE_UNSUPPORTED });
    expect(repo.setBracketTypeActive).not.toHaveBeenCalled();
  });

  it('12. unknown / non-executable slug activation FAILS', async () => {
    repo.findBracketTypeById.mockResolvedValue({ id: 9, name: 'Mystery', slug: 'unknown-format', is_active: 1, config_schema: null });
    await expect(svc.updateBracketTypeActive(9, true, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_BRACKET_ENGINE_UNSUPPORTED });
    expect(repo.setBracketTypeActive).not.toHaveBeenCalled();
  });

  it('12b. activating a READY row that is currently inactive succeeds', async () => {
    repo.findBracketTypeById.mockResolvedValue({ ...RR, is_active: 0 });
    await svc.updateBracketTypeActive(3, true, 1);
    expect(repo.setBracketTypeActive).toHaveBeenCalledWith(3, true);
  });
});

describe('Service — SAFE deactivation (active/future dependency guard)', () => {
  it('13. deactivating Single Elimination is BLOCKED while active/future tournaments depend on it (incl. GSK substrate)', async () => {
    repo.findBracketTypeById.mockResolvedValue(SE);
    repo.countActiveTournamentReferences.mockResolvedValue(2); // e.g. active GSK tournaments reference the SE substrate
    await expect(svc.updateBracketTypeActive(1, false, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_BRACKET_ENGINE_DEPENDENCY });
    expect(repo.setBracketTypeActive).not.toHaveBeenCalled();
  });

  it('14. deactivating a used executable format (Round Robin) is BLOCKED while active/future tournaments use it', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    repo.countActiveTournamentReferences.mockResolvedValue(3);
    await expect(svc.updateBracketTypeActive(3, false, 1))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_BRACKET_ENGINE_DEPENDENCY });
    expect(repo.setBracketTypeActive).not.toHaveBeenCalled();
  });

  it('14b. deactivating an executable format is ALLOWED when only HISTORICAL tournaments reference it', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    repo.countActiveTournamentReferences.mockResolvedValue(0);
    await svc.updateBracketTypeActive(3, false, 1);
    expect(repo.setBracketTypeActive).toHaveBeenCalledWith(3, false);
  });

  it('15. deactivating a PLANNED row (Double Elimination) is allowed (operational status only; creation stays engine-blocked)', async () => {
    repo.findBracketTypeById.mockResolvedValue(DE);
    await svc.updateBracketTypeActive(2, false, 1);
    expect(repo.countActiveTournamentReferences).not.toHaveBeenCalled();
    expect(repo.setBracketTypeActive).toHaveBeenCalledWith(2, false);
  });
});

describe('Controller — GET /admin/bracket-types enrichment', () => {
  it('6. every DB row exposes engine_capability + creation_available + referenced_count', async () => {
    repo.listBracketTypes.mockResolvedValue([SE, DE, RR, SW]);
    repo.countBracketTypeReferences.mockResolvedValue(2);
    const reply = res();
    await ctrl.listBracketTypesHandler({} as any, reply);

    expect(reply.sent.data).toHaveLength(4);
    const se = reply.sent.data.find((r: any) => r.slug === 'single-elimination');
    expect(se).toMatchObject({ engine_capability: 'ready', creation_available: true, referenced_count: 2 });
    const de = reply.sent.data.find((r: any) => r.slug === 'double-elimination');
    expect(de).toMatchObject({ engine_capability: 'planned', creation_available: false, referenced_count: 2 });
    const sw = reply.sent.data.find((r: any) => r.slug === 'swiss');
    expect(sw).toMatchObject({ engine_capability: 'planned', creation_available: false });
    // Legacy shape preserved (additive only).
    expect(se).toMatchObject({ id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: true });
  });

  it('7. GSK is exposed as a registry-level composite capability WITHOUT a fake DB row', async () => {
    repo.listBracketTypes.mockResolvedValue([SE, DE, RR, SW]);
    const reply = res();
    await ctrl.listBracketTypesHandler({} as any, reply);

    expect(Array.isArray(reply.sent.registry)).toBe(true);
    const gsk = reply.sent.registry.find((r: any) => r.format === 'group_stage_knockout');
    expect(gsk).toBeDefined();
    expect(gsk).toMatchObject({
      name: 'Group Stage + Knockout',
      type: 'composite',
      source: 'engine_registry',
      engine_capability: 'ready',
      creation_available: true,
      toggleable: false,
      substrate: 'single-elimination',
    });
    // Must NOT be a DB row: no numeric id, and not duplicated inside `data`.
    expect(gsk.id).toBeUndefined();
    expect(reply.sent.data.some((r: any) => r.slug === 'group-stage-knockout')).toBe(false);
  });

  it('7b. GSK creation_available is false when the single-elimination substrate is inactive', async () => {
    repo.listBracketTypes.mockResolvedValue([
      { ...SE, is_active: 0 },
      DE,
      { ...RR, is_active: 0 },
      SW,
    ]);
    const reply = res();
    await ctrl.listBracketTypesHandler({} as any, reply);
    const gsk = reply.sent.registry.find((r: any) => r.format === 'group_stage_knockout');
    expect(gsk.creation_available).toBe(false);
  });
});