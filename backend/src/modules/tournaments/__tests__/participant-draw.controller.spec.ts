import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../shared/errors/app-error.js';

const drawService = vi.hoisted(() => ({
  getCurrentDraw: vi.fn(),
  validateDraw: vi.fn(),
  approveDraw: vi.fn(),
  lockDraw: vi.fn(),
}));

vi.mock('../application/participant-draw.service.js', () => ({ participantDrawService: drawService }));
vi.mock('../application/participant-member.service.js', () => ({ participantMemberService: {} }));
vi.mock('../application/match-schedule.service.js', () => ({ matchScheduleService: {} }));

import * as ctrl from '../presentation/participant-draw.controller.js';

function req(overrides: any = {}): any {
  return { params: {}, body: {}, query: {}, userId: 42, ...overrides };
}

function res(): any {
  const r = { sent: null };
  r.send = vi.fn((val: any) => { r.sent = val; return r; });
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * G11.18 Phase 3 — the admin draw read/validate/approve/lock handlers must
 * forward the OPTIONAL competition scope so a multi-competition tournament's
 * per-competition draw can be read, validated, approved and locked. Omitted
 * scope keeps the single/default-competition behavior.
 */
describe('participant-draw.controller (admin) — competition-scoped draw operations', () => {
  it('getCurrentDraw forwards competition_id from the query string', async () => {
    drawService.getCurrentDraw.mockResolvedValue({ id: 1, competition_id: 11 });
    const reply = res();
    await ctrl.getCurrentDrawHandler(req({ params: { id: '9' }, query: { competition_id: '11' } }), reply);
    expect(drawService.getCurrentDraw).toHaveBeenCalledWith(9, 11);
    expect(reply.sent).toMatchObject({ id: 1, competition_id: 11 });
  });

  it('getCurrentDraw omits scope when the query has none (single-competition / legacy compatible)', async () => {
    drawService.getCurrentDraw.mockResolvedValue(null);
    await ctrl.getCurrentDrawHandler(req({ params: { id: '9' }, query: {} }), res());
    expect(drawService.getCurrentDraw).toHaveBeenCalledWith(9, undefined);
  });

  it('validateDraw forwards competition_id from the query string', async () => {
    drawService.validateDraw.mockResolvedValue({ valid: true });
    await ctrl.validateDrawHandler(req({ params: { id: '9' }, query: { competition_id: '12' } }), res());
    expect(drawService.validateDraw).toHaveBeenCalledWith(9, 12);
  });

  it('approveDraw forwards competition_id from the body', async () => {
    drawService.approveDraw.mockResolvedValue({ id: 2, status: 'approved' });
    await ctrl.approveDrawHandler(req({ params: { id: '9' }, body: { competition_id: 11 } }), res());
    expect(drawService.approveDraw).toHaveBeenCalledWith(9, 42, 11);
  });

  it('lockDraw forwards competition_id from the body', async () => {
    drawService.lockDraw.mockResolvedValue({ id: 3, status: 'locked' });
    await ctrl.lockDrawHandler(req({ params: { id: '9' }, body: { competition_id: 12 } }), res());
    expect(drawService.lockDraw).toHaveBeenCalledWith(9, 42, 12);
  });

  it('approve/lock omit scope when the body is empty or absent (legacy compatible)', async () => {
    drawService.approveDraw.mockResolvedValue({});
    drawService.lockDraw.mockResolvedValue({});
    await ctrl.approveDrawHandler(req({ params: { id: '9' }, body: {} }), res());
    expect(drawService.approveDraw).toHaveBeenCalledWith(9, 42, undefined);
    await ctrl.lockDrawHandler(req({ params: { id: '9' }, body: undefined }), res());
    expect(drawService.lockDraw).toHaveBeenCalledWith(9, 42, undefined);
  });

  it('rejects malformed competition ids at the DTO boundary before any service call', async () => {
    await expect(
      ctrl.getCurrentDrawHandler(req({ params: { id: '9' }, query: { competition_id: 'abc' } }), res()),
    ).rejects.toThrow();
    await expect(
      ctrl.validateDrawHandler(req({ params: { id: '9' }, query: { competition_id: 0 } }), res()),
    ).rejects.toThrow();
    await expect(
      ctrl.approveDrawHandler(req({ params: { id: '9' }, body: { competition_id: -3 } }), res()),
    ).rejects.toThrow();
    expect(drawService.getCurrentDraw).not.toHaveBeenCalled();
    expect(drawService.validateDraw).not.toHaveBeenCalled();
    expect(drawService.approveDraw).not.toHaveBeenCalled();
  });

  it('propagates a cross-tournament competition rejection from the service (fail-closed)', async () => {
    drawService.getCurrentDraw.mockRejectedValue(
      new AppError('Competition not found', 404, 'TOURNAMENT_COMPETITION_NOT_FOUND'),
    );
    await expect(
      ctrl.getCurrentDrawHandler(req({ params: { id: '9' }, query: { competition_id: '999' } }), res()),
    ).rejects.toMatchObject({ statusCode: 404, errorCode: 'TOURNAMENT_COMPETITION_NOT_FOUND' });
    expect(drawService.getCurrentDraw).toHaveBeenCalledWith(9, 999);
  });
});
