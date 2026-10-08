import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';
import { TournamentService } from '../application/tournament.service.js';
import { bracketSlugCapability } from '../domain/tournament-aggregate.js';
import { BracketTypeUpdateSchema } from '../presentation/tournament.dto.js';
import * as ctrl from '../presentation/tournament.controller.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = vi.hoisted(() => ({
  listBracketTypes: vi.fn(),
  findBracketTypeById: vi.fn(),
  findBracketTypeBySlug: vi.fn(),
  createBracketType: vi.fn(),
  updateBracketType: vi.fn(),
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
vi.mock('../application/tournament-prize-award.service.js', () => ({ tournamentPrizeAwardService: {} }));

const svc = new TournamentService();

const SE = { id: 1, name: 'Single Elimination', slug: 'single-elimination', is_active: 1, config_schema: '{"rounds":"auto","seeding":true}' };
const DE = { id: 2, name: 'Double Elimination', slug: 'double-elimination', is_active: 1, config_schema: '{"losers_bracket":true}' };
const RR = { id: 3, name: 'Round Robin', slug: 'round-robin', is_active: 1, config_schema: null };
const SW = { id: 4, name: 'Swiss System', slug: 'swiss', is_active: 1, config_schema: null };

function req(overrides: any = {}): any {
  return {
    params: {},
    body: {},
    query: {},
    ip: '::1',
    headers: {},
    userId: 7,
    ...overrides,
  };
}

function res(): any {
  const r: any = { sent: undefined, code: 200 };
  r.send = (body: any) => { r.sent = body; };
  r.code = (c: number) => { r._code = c; return r; };
  return r;
}

function routesSource(): string {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../presentation/tournament.routes.ts');
  return readFileSync(root, 'utf8');
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.setBracketTypeActive.mockResolvedValue(undefined);
  repo.updateBracketType.mockResolvedValue(undefined);
  repo.createBracketType.mockResolvedValue(5);
  repo.countBracketTypeReferences.mockResolvedValue(0);
  repo.countActiveTournamentReferences.mockResolvedValue(0);
  repo.findBracketTypeBySlug.mockResolvedValue(null);
});

describe('BRACKET-TYPE CRUD — CREATE', () => {
  it('1. creates a valid READY bracket type (inactive by default) + audit', async () => {
    repo.findBracketTypeById.mockResolvedValue({ ...SE, id: 5, is_active: 0 });
    const created = await svc.createBracketType({ name: 'Single Elimination', slug: 'single-elimination' }, 7);
    expect(repo.createBracketType).toHaveBeenCalledWith({ name: 'Single Elimination', slug: 'single-elimination', is_active: 0, config_schema: null });
    expect(Number(created.is_active)).toBe(0);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.BRACKET_TYPE_CREATE' }));
  });

  it('2. duplicate slug rejected (TOURNAMENT_BRACKET_DUPLICATE)', async () => {
    repo.findBracketTypeBySlug.mockResolvedValue(SE);
    await expect(svc.createBracketType({ name: 'Duplicate', slug: 'single-elimination' }, 7))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_BRACKET_DUPLICATE });
    expect(repo.createBracketType).not.toHaveBeenCalled();
  });

  it('3. invalid slug format rejected', async () => {
    await expect(svc.createBracketType({ name: 'Bad', slug: 'Bad Slug!' }, 7))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
    expect(repo.createBracketType).not.toHaveBeenCalled();
  });

  it('4. invalid JSON config rejected (TOURNAMENT_BRACKET_INVALID_CONFIG)', async () => {
    await expect(svc.createBracketType({ name: 'X', slug: 'swiss', config_schema: '{ not json' }, 7))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_BRACKET_INVALID_CONFIG });
    expect(repo.createBracketType).not.toHaveBeenCalled();
  });

  it('5. unsupported engine slug rejected (TOURNAMENT_BRACKET_ENGINE_UNSUPPORTED)', async () => {
    await expect(svc.createBracketType({ name: 'X', slug: 'best-of-7' }, 7))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_BRACKET_ENGINE_UNSUPPORTED });
    expect(repo.createBracketType).not.toHaveBeenCalled();
  });

  it('6. PLANNED definition may be registered but stays inactive/non-creatable', async () => {
    repo.findBracketTypeById.mockResolvedValue({ ...DE, id: 6, is_active: 0 });
    const created = await svc.createBracketType({ name: 'Double Elimination', slug: 'double-elimination' }, 7);
    expect(repo.createBracketType).toHaveBeenCalledWith(expect.objectContaining({ is_active: 0, slug: 'double-elimination' }));
    expect(bracketSlugCapability(created.slug)).toBe('planned');
  });

  it('7. GSK cannot be created as a DB bracket type (composite)', async () => {
    await expect(svc.createBracketType({ name: 'GSK', slug: 'group-stage-knockout' }, 7))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
    await expect(svc.createBracketType({ name: 'GSK', slug: 'group_stage_knockout' }, 7))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
    expect(repo.createBracketType).not.toHaveBeenCalled();
  });

  it('controller: POST admin/bracket-types returns { data } with capability fields', async () => {
    repo.findBracketTypeById.mockResolvedValue({ ...RR, id: 5, is_active: 0 });
    const reply = res();
    await ctrl.createBracketTypeHandler(req({ body: { name: 'Round Robin', slug: 'round-robin', config_schema: '{}' } }), reply);
    expect(reply.sent.data).toMatchObject({ id: 5, slug: 'round-robin', engine_capability: 'ready', creation_available: false });
  });

  it('8+9. RBAC: POST requires tournament.bracket-types.manage', () => {
    const src = routesSource();
    expect(src).toContain("app.post('/admin/bracket-types'");
    expect(src).toContain("requirePermission(['tournament.bracket-types.manage'])");
  });
});

describe('BRACKET-TYPE CRUD — READ (GET by id)', () => {
  it('10. GET by id returns detail with capability + usage split', async () => {
    repo.findBracketTypeById.mockResolvedValue(SE);
    repo.countBracketTypeReferences.mockResolvedValue(3);
    repo.countActiveTournamentReferences.mockResolvedValue(1);
    const reply = res();
    await ctrl.getBracketTypeHandler(req({ params: { id: '1' } }), reply);
    expect(reply.sent.data).toMatchObject({
      id: 1, slug: 'single-elimination', referenced_count: 3, active_references: 1, historical_references: 2,
      engine_capability: 'ready', creation_available: true,
    });
  });

  it('11. nonexistent id → structured not-found', async () => {
    repo.findBracketTypeById.mockResolvedValue(null);
    await expect(ctrl.getBracketTypeHandler(req({ params: { id: '999' } }), res()))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_NOT_FOUND });
  });

  it('12. capability fields present via the service detail (list parity)', async () => {
    repo.findBracketTypeById.mockResolvedValue(DE);
    const detail = await svc.getBracketTypeDetail(2);
    expect(detail.engine_capability).toBe('planned');
    expect(detail.creation_available).toBe(false);
  });

  it('13. RBAC: GET by id requires tournament.bracket-types.view', () => {
    const src = routesSource();
    expect(src).toContain("app.get('/admin/bracket-types/:id'");
    expect(src).toContain("requirePermission(['tournament.bracket-types.view'])");
  });
});

describe('BRACKET-TYPE CRUD — UPDATE', () => {
  it('14. rename zero-reference type works (name only)', async () => {
    repo.findBracketTypeById.mockResolvedValue(SE);
    const updated = await svc.updateBracketTypeMetadata(1, { name: 'Single Elim' }, 7);
    expect(repo.updateBracketType).toHaveBeenCalledWith(1, { name: 'Single Elim' });
    expect(updated.slug).toBe('single-elimination');
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.BRACKET_TYPE_UPDATE', beforeState: expect.any(Object) }));
  });

  it('15. config update on a zero-reference ready type works', async () => {
    repo.findBracketTypeById.mockResolvedValue(SE);
    repo.countActiveTournamentReferences.mockResolvedValue(0);
    await svc.updateBracketTypeMetadata(1, { config_schema: '{"rounds":"auto"}' }, 7);
    expect(repo.updateBracketType).toHaveBeenCalledWith(1, { config_schema: '{"rounds":"auto"}' });
  });

  it('16. slug cannot be changed — .strict() DTO rejects it', () => {
    expect(() => BracketTypeUpdateSchema.parse({ slug: 'cheat' })).toThrow();
    expect(() => BracketTypeUpdateSchema.parse({ is_active: true })).not.toThrow();
    expect(() => BracketTypeUpdateSchema.parse({ name: 'New' })).not.toThrow();
  });

  it('17. config edit of a referenced READY type is blocked (TOURNAMENT_BRACKET_IN_USE)', async () => {
    repo.findBracketTypeById.mockResolvedValue(SE);
    repo.countActiveTournamentReferences.mockResolvedValue(2);
    await expect(svc.updateBracketTypeMetadata(1, { config_schema: '{}' }, 7))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_BRACKET_IN_USE });
    expect(repo.updateBracketType).not.toHaveBeenCalled();
  });

  it('18. historical-only references do NOT block safe metadata edits', async () => {
    repo.findBracketTypeById.mockResolvedValue(SE);
    repo.countBracketTypeReferences.mockResolvedValue(50);
    repo.countActiveTournamentReferences.mockResolvedValue(0);
    await svc.updateBracketTypeMetadata(1, { config_schema: '{"rounds":"auto"}' }, 7);
    expect(repo.updateBracketType).toHaveBeenCalled();
  });

  it('19. unsupported type cannot be activated (Step 1 guard intact)', async () => {
    repo.findBracketTypeById.mockResolvedValue({ ...SW, slug: 'unknown-format' });
    await expect(svc.updateBracketTypeActive(4, true, 7))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_BRACKET_ENGINE_UNSUPPORTED });
  });

  it('20. Step 1 deactivation dependency guard intact (RR active refs → blocked)', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    repo.countActiveTournamentReferences.mockResolvedValue(2);
    await expect(svc.updateBracketTypeActive(3, false, 7))
      .rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_BRACKET_ENGINE_DEPENDENCY });
    expect(repo.setBracketTypeActive).not.toHaveBeenCalled();
  });

  it('21. RBAC: PUT requires tournament.bracket-types.manage', () => {
    const src = routesSource();
    expect(src).toContain("app.put('/admin/bracket-types/:id'");
    expect(src).toContain("requirePermission(['tournament.bracket-types.manage'])");
  });
});

describe('BRACKET-TYPE CRUD — DELETE', () => {
  it('22. unused non-canonical type can be soft-deleted (deactivated)', async () => {
    repo.findBracketTypeById.mockResolvedValue(SW);
    await svc.deleteBracketType(4, 7);
    expect(repo.setBracketTypeActive).toHaveBeenCalledWith(4, false);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'TOURNAMENT.BRACKET_TYPE_DELETE' }));
  });

  it('23. referenced type cannot be deleted', async () => {
    repo.findBracketTypeById.mockResolvedValue(SW);
    repo.countBracketTypeReferences.mockResolvedValue(4);
    await expect(svc.deleteBracketType(4, 7)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
    expect(repo.setBracketTypeActive).not.toHaveBeenCalled();
  });

  it('24. active/future dependency blocks deletion (refs include active tournaments)', async () => {
    repo.findBracketTypeById.mockResolvedValue(SW);
    repo.countBracketTypeReferences.mockResolvedValue(0);
    repo.countActiveTournamentReferences.mockResolvedValue(1);
    // delete uses total references; active refs are a subset — refs>0 already blocks
    repo.countBracketTypeReferences.mockResolvedValue(1);
    await expect(svc.deleteBracketType(4, 7)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_INVALID_FORMAT });
  });

  it('25. canonical Single Elimination cannot be deleted (TOURNAMENT_BRACKET_CANONICAL)', async () => {
    repo.findBracketTypeById.mockResolvedValue(SE);
    await expect(svc.deleteBracketType(1, 7)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_BRACKET_CANONICAL });
    expect(repo.setBracketTypeActive).not.toHaveBeenCalled();
  });

  it('26. canonical Round Robin cannot be deleted', async () => {
    repo.findBracketTypeById.mockResolvedValue(RR);
    await expect(svc.deleteBracketType(3, 7)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_BRACKET_CANONICAL });
  });

  it('27. GSK fake-ID/delete cannot occur (no DB row → not found)', async () => {
    repo.findBracketTypeById.mockResolvedValue(null);
    await expect(svc.deleteBracketType(9999, 7)).rejects.toMatchObject({ code: ErrorCodes.TOURNAMENT_NOT_FOUND });
  });

  it('controller: DELETE returns { success: true }', async () => {
    repo.findBracketTypeById.mockResolvedValue(SW);
    const reply = res();
    await ctrl.deleteBracketTypeHandler(req({ params: { id: '4' } }), reply);
    expect(reply.sent).toEqual({ success: true });
  });

  it('28. RBAC: DELETE requires tournament.bracket-types.manage', () => {
    const src = routesSource();
    expect(src).toContain("app.delete('/admin/bracket-types/:id'");
    expect(src).toContain("requirePermission(['tournament.bracket-types.manage'])");
  });
});

describe('BRACKET-TYPE CRUD — REGRESSION SNAPSHOTS', () => {
  it('29. capability helper unchanged (SE/RR ready, DE/SW planned, unknown unsupported)', () => {
    expect(bracketSlugCapability('single-elimination')).toBe('ready');
    expect(bracketSlugCapability('round-robin')).toBe('ready');
    expect(bracketSlugCapability('double-elimination')).toBe('planned');
    expect(bracketSlugCapability('swiss')).toBe('planned');
    expect(bracketSlugCapability('mystery')).toBe('unsupported');
  });

  it('30. list endpoint still returns data + registry (GSK composite, no fake id)', async () => {
    repo.listBracketTypes.mockResolvedValue([SE, DE, RR, SW]);
    const reply = res();
    await ctrl.listBracketTypesHandler({} as any, reply);
    expect(reply.sent.data).toHaveLength(4);
    expect(reply.sent.registry[0]).toMatchObject({ format: 'group_stage_knockout', type: 'composite' });
    expect(reply.sent.registry[0].id).toBeUndefined();
  });
});