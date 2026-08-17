import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: mockExecute }),
}));

import { RBACRepository } from '../infrastructure/repositories/rbac.repository.js';

describe('RBACRepository.updateUser', () => {
  let repo: RBACRepository;

  beforeEach(() => {
    mockExecute.mockReset();
    repo = new RBACRepository();
  });

  it('converts empty languageId to NULL instead of failing with an empty string', async () => {
    mockExecute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

    await repo.updateUser(1, { fullName: 'Test', languageId: '' });

    const userUpdate = mockExecute.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE users'));
    expect(userUpdate).toBeDefined();
    expect(String(userUpdate[0])).toContain('language_id = NULL');
    expect(String(userUpdate[0])).not.toContain('language_id = ?');
  });

  it('skips empty countryId (NOT NULL column) rather than writing an empty string', async () => {
    mockExecute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

    await repo.updateUser(1, { fullName: 'Test', countryId: '' });

    const userUpdate = mockExecute.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE users'));
    expect(String(userUpdate[0])).not.toContain('country_id');
  });

  it('persists empty mainSportId/mainLevelId to player_profiles as NULL', async () => {
    mockExecute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

    await repo.updateUser(1, { fullName: 'Test', mainSportId: '', mainLevelId: 3 });

    const profileUpsert = mockExecute.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO player_profiles'));
    expect(profileUpsert).toBeDefined();
    expect(String(profileUpsert[0])).toContain('main_sport_id');
    expect(String(profileUpsert[0])).toContain('main_level_id');
    expect(profileUpsert[1]).toEqual([1, null, 3]);
  });

  it('does not touch coach_profiles when isCoach matches the current DB state', async () => {
    mockExecute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ status: 'none' }], []]);

    const changed = await repo.updateUser(1, { fullName: 'Test', isCoach: false });

    const coachUpsert = mockExecute.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO coach_profiles'));
    expect(coachUpsert).toBeUndefined();
    expect(changed).toBe(false);
  });

  it('updates coach_profiles only when isCoach actually changes', async () => {
    mockExecute
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ status: 'none' }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ id: 5 }], []]);

    const changed = await repo.updateUser(1, { fullName: 'Test', isCoach: true });

    const coachUpsert = mockExecute.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO coach_profiles'));
    expect(coachUpsert).toBeDefined();
    expect(coachUpsert[1]).toEqual([1, 'pending']);
    expect(changed).toBe(true);
  });
});