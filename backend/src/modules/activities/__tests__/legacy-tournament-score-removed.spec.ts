import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Group 2 — the legacy activities-module tournament score/bracket endpoints are
 * removed so `match_result_records` remains the ONE authoritative result store.
 *
 * These source contracts are deliberately asserted at the file level (the same
 * pattern used by the notification mapping specs) because the endpoints were
 * unused by any frontend/backend consumer — proving the routes, service methods
 * and repository write paths are gone guards against accidental resurrection.
 */

const ROUTES_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), 'src/modules/activities/presentation/activities.routes.ts'),
  'utf-8',
);
const SERVICE_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), 'src/modules/activities/application/activities.service.ts'),
  'utf-8',
);
const REPO_SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), 'src/modules/activities/infrastructure/repositories/activities.repository.ts'),
  'utf-8',
);

describe('Group 2 — legacy activities tournament score/bracket paths are removed', () => {
  it('no longer registers the legacy `POST /matches/:matchId/score` route', () => {
    expect(ROUTES_SOURCE).not.toContain("'/matches/:matchId/score'");
  });

  it('no longer registers the legacy `POST /tournaments/:id/generate-bracket` route', () => {
    expect(ROUTES_SOURCE).not.toContain("'/tournaments/:id/generate-bracket'");
  });

  it('no longer exposes the enterMatchScore / generateBracket service methods', () => {
    expect(SERVICE_SOURCE).not.toContain('async enterMatchScore');
    expect(SERVICE_SOURCE).not.toContain('async generateBracket');
  });

  it('no longer writes tournament_match_scores from the activities repository', () => {
    expect(REPO_SOURCE).not.toContain('INSERT INTO tournament_match_scores');
  });

  it('no longer mutates tournament_matches.winner_id / score_summary from the activities repository', () => {
    expect(REPO_SOURCE).not.toContain('UPDATE tournament_matches SET winner_id');
  });
});