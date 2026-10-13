import { describe, it, expect, vi, beforeEach } from 'vitest';

const svc = vi.hoisted(() => ({
  approveTournamentMatchResult: vi.fn(),
}));
const repo = vi.hoisted(() => ({}));
const awardSvc = vi.hoisted(() => ({}));
const audit = vi.hoisted(() => ({ recordAudit: vi.fn() }));

vi.mock('../application/tournament.service.js', () => ({ tournamentService: svc }));
vi.mock('../infrastructure/repositories/tournament.repository.js', () => ({ tournamentRepository: repo }));
vi.mock('../application/tournament-prize-award.service.js', () => ({ tournamentPrizeAwardService: awardSvc }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: audit.recordAudit }));

import * as ctrl from '../presentation/tournament.controller.js';

function req(overrides: any = {}): any {
  return { params: {}, body: {}, query: {}, headers: {}, userId: 127, ip: '1.2.3.4', ...overrides };
}

function res(): any {
  const r = { sent: null, statusCode: 200 };
  r.send = vi.fn((val: any) => { r.sent = val; return r; });
  r.status = vi.fn((code: number) => { r.statusCode = code; return r; });
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Administrative approval of a PENDING tournament match result (Super Admin /
 * tournament creator / owning-organisation admin). The route guard
 * (`requirePermission(['tournament.result.manage'])`) is the authorization
 * boundary; this handler delegates to the canonical tournament service and
 * records the ADMINISTRATIVE audit path.
 */
describe('tournament.controller (admin) — administrative result approval', () => {
  it('delegates with the authenticated actor + match id and records the admin audit path', async () => {
    svc.approveTournamentMatchResult.mockResolvedValue({ sharedMatchId: 16, resultId: 8, submissionStatus: 'approved' });
    const reply = res();
    await ctrl.approveMatchResultHandler(
      req({ params: { matchId: '3' }, userId: 127, ip: '1.2.3.4', headers: { 'user-agent': 'vitest' } }),
      reply,
    );

    expect(svc.approveTournamentMatchResult).toHaveBeenCalledWith(3, 127, '1.2.3.4');
    expect(reply.sent).toMatchObject({ success: true, resultId: 8, sharedMatchId: 16, status: 'approved' });
    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 127,
      action: 'TOURNAMENT.APPROVE_RESULT',
      entityType: 'match_result_records',
      entityId: 8,
      afterState: expect.objectContaining({ sharedMatchId: 16, path: 'admin', status: 'approved' }),
    }));
  });

  it('propagates a service rejection (e.g. non-pending result) and records no success audit', async () => {
    svc.approveTournamentMatchResult.mockRejectedValue(new Error('This result is no longer pending confirmation'));
    await expect(
      ctrl.approveMatchResultHandler(req({ params: { matchId: '3' } }), res()),
    ).rejects.toThrow(/no longer pending/);
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it('propagates a missing/unknown tournament match rejection (404) without a success audit', async () => {
    svc.approveTournamentMatchResult.mockRejectedValue(Object.assign(new Error('Tournament match not found'), { errorCode: 'TOURNAMENT_NOT_FOUND', statusCode: 404 }));
    await expect(
      ctrl.approveMatchResultHandler(req({ params: { matchId: '999' } }), res()),
    ).rejects.toMatchObject({ errorCode: 'TOURNAMENT_NOT_FOUND', statusCode: 404 });
    expect(svc.approveTournamentMatchResult).toHaveBeenCalledWith(999, 127, '1.2.3.4');
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });
});
