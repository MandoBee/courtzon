import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

/**
 * G8-B — the ACTIVE legacy tournament bracket/fixture generation HTTP paths are
 * removed. Route-level regression: builds a REAL Fastify instance, registers the
 * SAME route modules the app uses (`tournamentRoutes` / `orgTournamentRoutes`),
 * and asserts:
 *   1. `/admin/tournaments/:id/generate-bracket`        → NOT registered
 *   2. `/admin/tournaments/:id/generate-fixtures`       → NOT registered
 *   3. `/org/:orgId/tournaments/:id/generate-bracket`   → NOT registered
 *   4. `/org/:orgId/tournaments/:id/generate-fixtures`  → NOT registered
 *   5. The modern locked-draw flow routes remain registered (draw / approve /
 *      lock / matches/generate) on BOTH admin and org scope.
 *
 * Controllers are only REGISTERED here (never invoked), so their service imports
 * are stubbed with light mocks — no DB, no queue, no Redis at import time.
 */

vi.mock('../application/tournament.service.js', () => ({ tournamentService: {} }));
vi.mock('../application/participant-draw.service.js', () => ({ participantDrawService: {} }));
vi.mock('../application/participant-member.service.js', () => ({ participantMemberService: {} }));
vi.mock('../application/match-schedule.service.js', () => ({ matchScheduleService: {} }));
vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: {} }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));

import { tournamentRoutes } from '../presentation/tournament.routes.js';
import { orgTournamentRoutes } from '../presentation/org-tournament.routes.js';

describe('G8-B — legacy tournament generate-bracket / generate-fixtures routes are removed', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await tournamentRoutes(app);
    await orgTournamentRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  const LEGACY_PATHS: Array<{ method: 'POST'; url: string }> = [
    { method: 'POST', url: '/admin/tournaments/:id/generate-bracket' },
    { method: 'POST', url: '/admin/tournaments/:id/generate-fixtures' },
    { method: 'POST', url: '/org/:orgId/tournaments/:id/generate-bracket' },
    { method: 'POST', url: '/org/:orgId/tournaments/:id/generate-fixtures' },
  ];

  const MODERN_PATHS: Array<{ method: 'POST'; url: string }> = [
    // Admin — draw → approve → lock → generate (matches).
    { method: 'POST', url: '/admin/tournaments/:id/draw' },
    { method: 'POST', url: '/admin/tournaments/:id/draw/approve' },
    { method: 'POST', url: '/admin/tournaments/:id/draw/lock' },
    { method: 'POST', url: '/admin/tournaments/:id/matches/generate' },
    // Org — same modern flow, tenant-scoped.
    { method: 'POST', url: '/org/:orgId/tournaments/:id/draw' },
    { method: 'POST', url: '/org/:orgId/tournaments/:id/draw/approve' },
    { method: 'POST', url: '/org/:orgId/tournaments/:id/draw/lock' },
    { method: 'POST', url: '/org/:orgId/tournaments/:id/matches/generate' },
  ];

  it('legacy generate-bracket is unreachable on every registered scope', () => {
    for (const path of LEGACY_PATHS.filter((p) => p.url.includes('generate-bracket'))) {
      expect(app.hasRoute({ method: path.method, url: path.url })).toBe(false);
    }
  });

  it('legacy generate-fixtures is unreachable on every registered scope', () => {
    for (const path of LEGACY_PATHS.filter((p) => p.url.includes('generate-fixtures'))) {
      expect(app.hasRoute({ method: path.method, url: path.url })).toBe(false);
    }
  });

  it('no controller exports the removed legacy handlers', async () => {
    const admin = await import('../presentation/tournament.controller.js');
    const org = await import('../presentation/org-tournament.controller.js');
    expect((admin as any).generateBracketHandler).toBeUndefined();
    expect((admin as any).generateFixturesHandler).toBeUndefined();
    expect((org as any).generateOrgBracketHandler).toBeUndefined();
    expect((org as any).generateOrgFixturesHandler).toBeUndefined();
  });

  it('the modern locked-draw flow remains fully registered (admin + org)', () => {
    for (const path of MODERN_PATHS) {
      expect(app.hasRoute({ method: path.method, url: path.url })).toBe(true);
    }
  });

  it('modern match-result writes are unaffected (shared result record route still registered)', () => {
    expect(app.hasRoute({ method: 'POST', url: '/admin/tournaments/matches/:matchId/result' })).toBe(true);
    expect(app.hasRoute({ method: 'POST', url: '/org/:orgId/tournaments/matches/:matchId/result' })).toBe(true);
  });
});