import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorCodes } from '../../../shared/errors/error-codes.js';

const repo = vi.hoisted(() => ({
  sportExists: vi.fn(),
  listAdminFormats: vi.fn(),
  findAdminFormatById: vi.fn(),
  findFormatBySportAndSlug: vi.fn(),
  createFormat: vi.fn(),
  updateFormat: vi.fn(),
  deleteFormat: vi.fn(),
  unsetFormatDefaults: vi.fn(),
  listRuleSetsAdmin: vi.fn(),
  findRuleSetAdminById: vi.fn(),
  hasActiveRuleSet: vi.fn(),
  createRuleSetVersion: vi.fn(),
  updateRuleSet: vi.fn(),
  unsetRuleSetDefaults: vi.fn(),
  setRuleSetActive: vi.fn(),
}));

const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));
const txn = vi.hoisted(() => ({ token: 0 }));
const txnImpl = vi.hoisted(() => ({ withTransaction: undefined as unknown }));

vi.mock('../../../database/database.transaction.js', () => ({
  withTransaction: (cb) => {
    if (typeof (txnImpl.withTransaction as any) === 'function') {
      return (txnImpl.withTransaction as any)(cb);
    }
    return cb({ execute: () => [] });
  },
}));
vi.mock('../infrastructure/match-result.repository.js', () => ({ matchResultRepository: repo }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));

import { SportConfigAdminService, validateScoringRules, validateStandingsRules } from '../application/sport-config.admin.service.js';

const svc = new SportConfigAdminService();

const FORMAT = {
  id: 10,
  sportId: 2,
  sportName: 'Tennis',
  slug: 'singles',
  name: 'Singles',
  formatType: 'singles',
  playersPerSide: 1,
  rosterSize: null,
  description: null,
  isDefault: true,
  isActive: true,
  ruleSetCount: 2,
  referenceCount: 3,
};

const RULE_SET = {
  id: 100,
  formatId: 10,
  version: 1,
  name: 'v1',
  rules: {
    score_structure: 'sets',
    best_of: 3,
    sets_to_win: 2,
    first_to: 6,
    margin: 2,
    draw_allowed: false,
    terminations: ['retired', 'walkover'],
  },
  standingsRules: { points: { win: 2, draw: 1, loss: 0 }, tiebreakers: [{ field: 'game_difference', direction: 'desc' }] },
  isActive: true,
  isDefault: true,
  referenceCount: 0,
  createdAt: '2026-09-01 00:00:00',
};

const VALID_RULES = {
  score_structure: 'sets',
  best_of: 3,
  sets_to_win: 2,
  first_to: 6,
  margin: 2,
  draw_allowed: false,
  terminations: ['retired', 'walkover'],
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.sportExists.mockResolvedValue(true);
  repo.findAdminFormatById.mockResolvedValue(FORMAT);
  repo.findFormatBySportAndSlug.mockResolvedValue(null);
  repo.createFormat.mockResolvedValue(41);
  repo.findRuleSetAdminById.mockResolvedValue(RULE_SET);
  repo.hasActiveRuleSet.mockResolvedValue(true);
  repo.createRuleSetVersion.mockResolvedValue(200);
  repo.listRuleSetsAdmin.mockResolvedValue([]);
});

describe('SportConfigAdminService — FORMATS', () => {
  it('create: happy path inserts with defaults + audit; slug uniqueness enforced', async () => {
    repo.findAdminFormatById.mockResolvedValueOnce(FORMAT);
    const created = await svc.createFormat(
      2,
      { slug: 'doubles', name: 'Doubles', formatType: 'doubles', playersPerSide: 2 },
      7,
    );
    expect(repo.createFormat).toHaveBeenCalledWith(
      expect.objectContaining({ sportId: 2, slug: 'doubles', name: 'Doubles', formatType: 'doubles', playersPerSide: 2, rosterSize: null, isActive: true, isDefault: false, createdBy: 7 }),
      expect.any(Object),
    );
    expect(created).toBe(FORMAT);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'sport_format.created', actorId: 7 }));
  });

  it('create: duplicate slug → SPORT_FORMAT_DUPLICATE, no insert', async () => {
    repo.findFormatBySportAndSlug.mockResolvedValue({ id: 9 });
    await expect(svc.createFormat(2, { slug: 'singles', name: 'X', formatType: 'singles' }, 7))
      .rejects.toMatchObject({ code: ErrorCodes.SPORT_FORMAT_DUPLICATE });
    expect(repo.createFormat).not.toHaveBeenCalled();
  });

  it('create: missing sport → 404 not found', async () => {
    repo.sportExists.mockResolvedValue(false);
    await expect(svc.createFormat(999, { slug: 'x', name: 'X', formatType: 'singles' }, 7))
      .rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
  });

  it('create: singles must have players_per_side = 1', async () => {
    await expect(svc.createFormat(2, { slug: 'singles', name: 'S', formatType: 'singles', playersPerSide: 2 }, 7))
      .rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(repo.createFormat).not.toHaveBeenCalled();
  });

  it('create: is_default clears sibling defaults transactionally', async () => {
    repo.findAdminFormatById.mockResolvedValueOnce(FORMAT);
    await svc.createFormat(2, { slug: 'new', name: 'New', formatType: 'team', isDefault: true }, 7);
    expect(repo.unsetFormatDefaults).toHaveBeenCalledWith(2, -1, expect.any(Object));
  });

  it('update: metadata-only update passes through; slug is immutable (no slug field accepted)', async () => {
    repo.findAdminFormatById.mockResolvedValue(FORMAT);
    const updated = await svc.updateFormat(10, { name: 'Renamed', isActive: false }, 7);
    expect(repo.updateFormat).toHaveBeenCalledWith(10, { name: 'Renamed', isActive: false }, expect.any(Object));
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'sport_format.updated', beforeState: expect.any(Object) }));
    expect(updated).toBe(FORMAT);
  });

  it('update: unknown format → 404', async () => {
    repo.findAdminFormatById.mockResolvedValue(null);
    await expect(svc.updateFormat(999, { name: 'X' }, 7)).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    expect(repo.updateFormat).not.toHaveBeenCalled();
  });

  it('delete: unreferenced format is hard-deleted + audited', async () => {
    repo.findAdminFormatById.mockResolvedValue({ ...FORMAT, referenceCount: 0 });
    await svc.deleteFormat(10, 7);
    expect(repo.deleteFormat).toHaveBeenCalledWith(10);
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'sport_format.deleted' }));
  });

  it('delete: referenced format → SPORT_FORMAT_IN_USE, no delete', async () => {
    repo.findAdminFormatById.mockResolvedValue({ ...FORMAT, referenceCount: 4 });
    await expect(svc.deleteFormat(10, 7)).rejects.toMatchObject({ code: ErrorCodes.SPORT_FORMAT_IN_USE });
    expect(repo.deleteFormat).not.toHaveBeenCalled();
  });
});

describe('SportConfigAdminService — RULE SETS', () => {
  it('create: first version auto-activates (no active exists); later versions stay drafts', async () => {
    repo.findRuleSetAdminById.mockResolvedValueOnce({ ...RULE_SET, id: 200 });
    repo.hasActiveRuleSet.mockResolvedValue(false);
    const created = await svc.createRuleSet(10, { name: 'v1', rules: VALID_RULES }, 7);
    expect(repo.createRuleSetVersion).toHaveBeenCalledWith(
      expect.objectContaining({ formatId: 10, name: 'v1', rules: expect.any(Object), isDefault: false, createdBy: 7 }),
      expect.any(Object),
    );
    // auto-activate for first version
    expect(repo.setRuleSetActive).toHaveBeenCalledWith(10, 200, true, expect.any(Object));
    expect(created).toEqual(expect.objectContaining({ id: 200 }));
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'sport_rule_set.created' }));
  });

  it('create: explicit isActive false keeps a draft even when it is the first version', async () => {
    repo.findRuleSetAdminById.mockResolvedValueOnce({ ...RULE_SET, id: 201 });
    repo.hasActiveRuleSet.mockResolvedValue(false);
    await svc.createRuleSet(10, { name: 'draft', rules: VALID_RULES, isActive: false }, 7);
    expect(repo.setRuleSetActive).not.toHaveBeenCalled();
  });

  it('create: invalid rules JSON structure → RULES_VALIDATION, nothing persisted', async () => {
    await expect(svc.createRuleSet(10, { name: 'bad', rules: { score_structure: 'sets', tiebreak_at: 6 } }, 7))
      .rejects.toThrow('tiebreak_first_to');
    expect(repo.createRuleSetVersion).not.toHaveBeenCalled();
  });

  it('create: unknown format → 404', async () => {
    repo.findAdminFormatById.mockResolvedValue(null);
    await expect(svc.createRuleSet(999, { name: 'x', rules: VALID_RULES }, 7))
      .rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
    expect(repo.createRuleSetVersion).not.toHaveBeenCalled();
  });

  it('update: metadata-only on a referenced version succeeds', async () => {
    repo.findRuleSetAdminById.mockResolvedValue({ ...RULE_SET, referenceCount: 5 });
    await svc.updateRuleSet(100, { name: 'renamed', isDefault: true }, 7);
    expect(repo.updateRuleSet).toHaveBeenCalledWith(100, { name: 'renamed', isDefault: true }, expect.any(Object));
  });

  it('update: scoring edit on a REFERENCED version → SPORT_RULE_SET_IN_USE (snapshot protection)', async () => {
    repo.findRuleSetAdminById.mockResolvedValue({ ...RULE_SET, referenceCount: 5 });
    await expect(
      svc.updateRuleSet(100, { name: 'new', rules: { ...VALID_RULES, best_of: 5 } }, 7),
    ).rejects.toMatchObject({ code: ErrorCodes.SPORT_RULE_SET_IN_USE });
    expect(repo.updateRuleSet).not.toHaveBeenCalled();
  });

  it('update: scoring edit on an UNREFERENCED version persists (draft correction)', async () => {
    repo.findRuleSetAdminById.mockResolvedValue({ ...RULE_SET, referenceCount: 0 });
    await svc.updateRuleSet(100, { rules: { ...VALID_RULES, best_of: 5 } }, 7);
    expect(repo.updateRuleSet).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ rules: expect.objectContaining({ best_of: 5 }) }),
      expect.any(Object),
    );
  });

  it('activate: single-active invariant (deactivates siblings first) + activation audit', async () => {
    const activated = await svc.activateRuleSet(100, 7);
    expect(repo.setRuleSetActive).toHaveBeenCalledWith(10, 100, true, expect.any(Object));
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'sport_rule_set.activated' }));
    expect(activated.id).toBe(100);
  });

  it('deactivate: clears the active flag + deactivation audit', async () => {
    await svc.deactivateRuleSet(100, 7);
    expect(repo.setRuleSetActive).toHaveBeenCalledWith(10, 100, false, expect.any(Object));
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'sport_rule_set.deactivated' }));
  });
});

describe('validateScoringRules — shared rules engine reuse', () => {
  it('accepts the canonical best-of-3 sets configuration', () => {
    expect(validateScoringRules(VALID_RULES).score_structure).toBe('sets');
  });

  it('rejects an unknown score_structure', () => {
    expect(() => validateScoringRules({ score_structure: 'points', draw_allowed: false, terminations: [] }))
      .toThrow('score_structure');
  });

  it('rejects goals structure with invalid halves', () => {
    expect(() =>
      validateScoringRules({ score_structure: 'goals', halves: [0, 45], draw_allowed: false, terminations: [] }),
    ).toThrow('halves');
  });

  it('rejects unknown terminations (fail-closed)', () => {
    expect(() =>
      validateScoringRules({ score_structure: 'sets', draw_allowed: false, terminations: ['sudden_death'] }),
    ).toThrow('termination');
  });

  it('delegates to assertScoringConfiguration (tiebreak pairing)', () => {
    expect(() =>
      validateScoringRules({ score_structure: 'sets', tiebreak_at: 6, draw_allowed: false, terminations: [] }),
    ).toThrow('tiebreak_first_to');
  });
});

describe('validateStandingsRules', () => {
  it('accepts points + tiebreakers', () => {
    expect(
      validateStandingsRules({ points: { win: 2, draw: 1, loss: 0 }, tiebreakers: [{ field: 'gd', direction: 'desc' }] }).points.win,
    ).toBe(2);
  });

  it('rejects missing points', () => {
    expect(() => validateStandingsRules({ tiebreakers: [] })).toThrow('points');
  });

  it('rejects bad tiebreaker direction', () => {
    expect(() =>
      validateStandingsRules({ points: { win: 2, draw: 1, loss: 0 }, tiebreakers: [{ field: 'gd', direction: 'up' }] }),
    ).toThrow('direction');
  });
});