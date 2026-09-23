import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * G9-D5-C — authoritative preference query semantics + fresh-env seed.
 *
 * `user_notification_preferences.is_allowed` (default 1) is the single source
 * of truth: NO row = ENABLED, explicit `is_allowed = 0` = suppressed.
 */

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute }),
}));

import { notificationRepository } from '../infrastructure/repositories/notification.repository.js';

beforeEach(() => {
  execute.mockReset();
});

describe('G9-D5-C — isCategoryAllowed semantics', () => {
  it('P/A. no preference row → allowed (default ON)', async () => {
    execute.mockResolvedValue([[]]);
    expect(await notificationRepository.isCategoryAllowed(1, 'tournament')).toBe(true);
  });

  it('C. explicit is_allowed = 0 → suppressed', async () => {
    execute.mockResolvedValue([[{ id: 9 }]]);
    expect(await notificationRepository.isCategoryAllowed(1, 'tournament')).toBe(false);
  });

  it('B. explicit is_allowed = 1 → allowed (query only matches = 0 rows)', async () => {
    execute.mockResolvedValue([[]]);
    expect(await notificationRepository.isCategoryAllowed(1, 'tournament')).toBe(true);
  });

  it('looks the category up by slug (canonical slug "tournament")', async () => {
    execute.mockResolvedValue([[{ id: 9 }]]);
    await notificationRepository.isCategoryAllowed(42, 'tournament');
    const sql = String(execute.mock.calls[0][0]);
    const params = execute.mock.calls[0][1] as unknown[];
    expect(sql).toContain('nc.slug = ?');
    expect(sql).toContain('user_notification_preferences');
    expect(sql).toContain('is_allowed = 0');
    expect(params).toEqual([42, 'tournament']);
  });
});

describe('G9-D5-C — filterAllowedUserIds semantics', () => {
  it('drops only users with an explicit opt-out row', async () => {
    execute.mockResolvedValue([[{ user_id: 2 }]]);
    const allowed = await notificationRepository.filterAllowedUserIds([1, 2, 3], 'tournament');
    expect(allowed).toEqual([1, 3]);
  });

  it('empty input returns empty (no query)', async () => {
    expect(await notificationRepository.filterAllowedUserIds([], 'tournament')).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('G9-D5-C — seed/baseline (fresh environment)', () => {
  it('O. canonical seed contains exactly one tournament notification category', () => {
    const seed = fs.readFileSync(
      path.resolve(process.cwd(), '../database/seeds/001_baseline.sql'),
      'utf-8',
    );
    const insertLine = seed
      .split('\n')
      .find((line) => line.includes('INSERT IGNORE INTO `notification_categories`'));
    expect(insertLine).toBeDefined();
    const tournamentHits = (insertLine!.match(/\(9,'tournament',1,9,/g) ?? []);
    expect(tournamentHits).toHaveLength(1);
    // No other tournament category row may exist.
    const allTournamentMentions = (insertLine!.match(/'tournament'/g) ?? []);
    expect(allTournamentMentions).toHaveLength(1);
  });
});