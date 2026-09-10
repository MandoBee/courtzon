import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

const repo = vi.hoisted(() => ({
  getEvidence: vi.fn(),
  getSelfDeclaredPercent: vi.fn(),
  getProfileLevelInfo: vi.fn(),
  getSelfDeclaredEvidence: vi.fn(),
  upsertEvidence: vi.fn(),
  getRating: vi.fn(),
  upsertRating: vi.fn(),
  insertHistory: vi.fn(),
  getSelfDeclaredSportIds: vi.fn(),
  getMainSportId: vi.fn(),
  setEvidenceActive: vi.fn(),
  adjustStatDelta: vi.fn(),
}));

vi.mock('../infrastructure/rating.repository.js', () => ({ ratingRepository: repo }));

import { ratingService } from '../application/rating/rating.service.js';

const NOW = new Date().toISOString();

function ev(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, userId: 5, sportId: 22,
    evidenceType: 'match_evidence', valuePercent: 100,
    source: 'match_result', sourceRefId: 99, occurredAt: NOW,
    meta: null, created_at: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.getSelfDeclaredPercent.mockResolvedValue(60);
  repo.getProfileLevelInfo.mockResolvedValue({ profileId: 100, levelOrder: 3, updatedAt: NOW });
  repo.getSelfDeclaredEvidence.mockResolvedValue(null);
  repo.getRating.mockResolvedValue(null);
});

describe('Round 2 Item 1 — inactive evidence is excluded from rating', () => {
  it('recalculate ignores evidence flagged meta.active === false', async () => {
    repo.getEvidence.mockResolvedValue([
      ev({ id: 1, valuePercent: 100, meta: null }),
      ev({ id: 2, valuePercent: 0, meta: { active: false } }),
    ]);
    const overall = await ratingService.recalculate(5, 22, null, 'test');
    // active 100 (weight 0.3) → 100; if the inactive 0 were counted it would be 50
    expect(overall).toBe(100);
  });

  it('resolveOverallPercentAt ignores inactive evidence', async () => {
    repo.getEvidence.mockResolvedValue([
      ev({ id: 1, valuePercent: 100, meta: null, occurredAt: NOW }),
      ev({ id: 2, valuePercent: 0, meta: { active: false }, occurredAt: NOW }),
    ]);
    const overall = await ratingService.resolveOverallPercentAt(5, 22, new Date());
    expect(overall).toBe(100);
  });

  it('setMatchEvidenceActive forwards to the repository without deleting rows', async () => {
    await ratingService.setMatchEvidenceActive('match_result', 99, false);
    expect(repo.setEvidenceActive).toHaveBeenCalledWith('match_result', 99, false);
  });
});

describe('Round 2 Item 2 — self-declared immediate recalculation', () => {
  it('recalculateSelfDeclaredForUser syncs + recalcs declared sports and main sport only', async () => {
    repo.getSelfDeclaredSportIds.mockResolvedValue([22, 33]);
    repo.getMainSportId.mockResolvedValue(44);
    repo.getEvidence.mockResolvedValue([]);
    repo.upsertRating.mockResolvedValue(undefined);
    repo.insertHistory.mockResolvedValue(undefined);

    await ratingService.recalculateSelfDeclaredForUser(5);

    // recalculate runs once per target sport (22, 33, 44) — no unrelated sport
    expect(repo.getSelfDeclaredSportIds).toHaveBeenCalledWith(5);
    expect(repo.getMainSportId).toHaveBeenCalledWith(5);
    expect(repo.getRating).toHaveBeenCalledTimes(3);
  });

  it('recalculateSelfDeclaredForUser does nothing for a user with no declared sports', async () => {
    repo.getSelfDeclaredSportIds.mockResolvedValue([]);
    repo.getMainSportId.mockResolvedValue(null);
    await ratingService.recalculateSelfDeclaredForUser(5);
    expect(repo.getProfileLevelInfo).not.toHaveBeenCalled();
    expect(repo.getRating).not.toHaveBeenCalled();
  });

  it('syncSelfDeclaredEvidence is idempotent when value + timestamp are unchanged', async () => {
    repo.getSelfDeclaredEvidence.mockResolvedValue(ev({ evidenceType: 'self_declared', valuePercent: 60, occurredAt: NOW, meta: null }));
    await ratingService.syncSelfDeclaredEvidence(5, 22);
    expect(repo.upsertEvidence).not.toHaveBeenCalled();
  });

  it('syncSelfDeclaredEvidence updates the row when the declared level changes', async () => {
    repo.getSelfDeclaredEvidence.mockResolvedValue(ev({ evidenceType: 'self_declared', valuePercent: 40, occurredAt: NOW, meta: null }));
    repo.getProfileLevelInfo.mockResolvedValue({ profileId: 100, levelOrder: 5, updatedAt: NOW });
    await ratingService.syncSelfDeclaredEvidence(5, 22);
    expect(repo.upsertEvidence).toHaveBeenCalledWith(expect.objectContaining({ valuePercent: 100, sourceRefId: 100 }));
  });
});

describe('Round 2 — self-declared participates at 5% alongside match evidence (Test M)', () => {
  it('once match evidence exists, the self-declared component still contributes', async () => {
    repo.getProfileLevelInfo.mockResolvedValue({ profileId: 100, levelOrder: 1, updatedAt: NOW });
    repo.getSelfDeclaredEvidence.mockResolvedValue(null);
    repo.getEvidence.mockResolvedValue([
      ev({ id: 1, evidenceType: 'match_evidence', valuePercent: 100, meta: null }),
      ev({ id: 2, evidenceType: 'self_declared', valuePercent: 20, meta: null }),
    ]);
    repo.getRating.mockResolvedValue({ userId: 5, sportId: 22, overallPercent: 100, matchesCount: 1, matchWins: 1, matchDraws: 0, matchLosses: 0 });
    const overall = await ratingService.recalculate(5, 22, null, 'test');
    // 100 (match, weight 0.3) + 20 (self_declared, weight 0.05) → (30 + 1) / 0.35 = 88.57
    expect(overall).toBeLessThan(100);
    expect(overall).toBeGreaterThan(88);
    expect(repo.upsertEvidence).toHaveBeenCalledWith(expect.objectContaining({ evidenceType: 'self_declared', valuePercent: 20 }));
  });
});