import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Command } from '../../../shared/command/command-base.js';
import { NotFoundError } from '../../../shared/errors/app-error.js';

const hoisted = vi.hoisted(() => ({
  queryExecute: vi.fn(),
  pipelineExecute: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: hoisted.queryExecute }),
  createPool: vi.fn(),
  closePool: vi.fn(),
}));

vi.mock('../../../shared/utils/logger.js', () => ({
  createModuleLogger: () => ({
    info: hoisted.logInfo,
    warn: hoisted.logWarn,
    error: hoisted.logError,
    debug: vi.fn(),
    child: vi.fn(),
  }),
}));

vi.mock('../../../shared/command/command-pipeline.js', () => ({
  commandPipeline: { execute: hoisted.pipelineExecute },
}));

vi.mock('../commands/complete-booking.command.js', () => ({
  completeBookingHandler: { execute: vi.fn(), events: vi.fn(() => []) },
}));

import { handleAutoCompleteBookings } from './booking-auto-complete.worker.js';

function candidates(...ids: number[]) {
  return ids.map((id) => ({ id, user_id: 100 + id, organisation_id: 5 }));
}

/** Pipeline outcomes are keyed by booking id so mixed batches are deterministic. */
function pipelineOutcomes(outcomes: Record<number, 'ok' | 'conflict' | 'not-found' | 'version-conflict'>) {
  hoisted.pipelineExecute.mockImplementation(async (command: Command) => {
    const bookingId = Number(command.aggregateId);
    const outcome = outcomes[bookingId];
    if (outcome === 'ok') return { status: 'processed', data: { bookingId } };
    if (outcome === 'not-found') throw new NotFoundError('Booking');
    if (outcome === 'version-conflict') throw new Error('Booking 1 version conflict: expected 1, actual 2');
    return { status: 'error', code: 'CONFLICT', message: 'Cannot complete a booking in terminal state: cancelled' };
  });
}

const summaryInfo = () => hoisted.logInfo.mock.calls.map((c) => c[0]);
const summaryWarn = () => hoisted.logWarn.mock.calls.map((c) => c[0]);

describe('handleAutoCompleteBookings — success/failure accounting (P8.7.14.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.queryExecute.mockResolvedValue([candidates(1, 2, 3)]);
  });

  it('reports only actual completions for a mixed batch and reports failures separately', async () => {
    pipelineOutcomes({ 1: 'ok', 2: 'ok', 3: 'conflict' });

    await handleAutoCompleteBookings();

    expect(hoisted.logInfo).toHaveBeenCalledTimes(1);
    expect(summaryInfo()[0]).toEqual({ completed: 2, failed: 1, candidates: 3 });
    expect(hoisted.logInfo.mock.calls[0][1]).toBe('Auto-completed 2 past bookings');

    expect(hoisted.logWarn).toHaveBeenCalledTimes(1);
    expect(summaryWarn()[0]).toEqual({
      failed: 1,
      candidates: 3,
      failedBookingIds: [3],
      truncated: false,
    });

    expect(hoisted.logError).toHaveBeenCalledTimes(1);
    const [errorContext, errorMessage] = hoisted.logError.mock.calls[0];
    expect(errorMessage).toBe('Failed to auto-complete booking');
    expect(Object.keys(errorContext).sort()).toEqual(['bookingId', 'err']);
    expect(errorContext.bookingId).toBe(3);
    expect(errorContext.err).toBeInstanceOf(Error);
  });

  it('never reports successful completions when the whole batch fails', async () => {
    pipelineOutcomes({ 1: 'conflict', 2: 'conflict', 3: 'conflict' });

    await handleAutoCompleteBookings();

    expect(hoisted.logInfo).not.toHaveBeenCalled();
    expect(summaryWarn()[0]).toEqual({
      failed: 3,
      candidates: 3,
      failedBookingIds: [1, 2, 3],
      truncated: false,
    });
    expect(hoisted.logError).toHaveBeenCalledTimes(3);
  });

  it('reports the candidate-independent success count when every booking completes', async () => {
    pipelineOutcomes({ 1: 'ok', 2: 'ok', 3: 'ok' });

    await handleAutoCompleteBookings();

    expect(summaryInfo()[0]).toEqual({ completed: 3, failed: 0, candidates: 3 });
    expect(hoisted.logWarn).not.toHaveBeenCalled();
    expect(hoisted.logError).not.toHaveBeenCalled();
  });

  it('counts an already-completed idempotent no-op as a success without re-completing', async () => {
    // The command handler returns normally for an already-completed booking.
    pipelineOutcomes({ 1: 'ok' });
    hoisted.queryExecute.mockResolvedValue([candidates(1)]);

    await handleAutoCompleteBookings();

    expect(hoisted.pipelineExecute).toHaveBeenCalledTimes(1);
    expect(summaryInfo()[0]).toEqual({ completed: 1, failed: 0, candidates: 1 });
  });

  it('does not downgrade NOT_FOUND: it is counted as a failure, not a success', async () => {
    hoisted.queryExecute.mockResolvedValue([candidates(1, 2)]);
    pipelineOutcomes({ 1: 'ok', 2: 'not-found' });

    await handleAutoCompleteBookings();

    expect(summaryInfo()[0]).toEqual({ completed: 1, failed: 1, candidates: 2 });
    expect(summaryWarn()[0].failedBookingIds).toEqual([2]);
    expect(hoisted.logError.mock.calls[0][0].err).toBeInstanceOf(NotFoundError);
    expect(hoisted.logError.mock.calls[0][0].bookingId).toBe(2);
  });

  it('counts optimistic-lock/version conflicts as failures without inflating successes', async () => {
    hoisted.queryExecute.mockResolvedValue([candidates(1, 2)]);
    pipelineOutcomes({ 1: 'version-conflict', 2: 'ok' });

    await handleAutoCompleteBookings();

    expect(summaryInfo()[0]).toEqual({ completed: 1, failed: 1, candidates: 2 });
    expect(hoisted.logError.mock.calls[0][0].bookingId).toBe(1);
  });

  it('bounds the failure summary for large failing batches', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => i + 1);
    hoisted.queryExecute.mockResolvedValue([candidates(...ids)]);
    pipelineOutcomes(Object.fromEntries(ids.map((id) => [id, 'conflict' as const])));

    await handleAutoCompleteBookings();

    expect(hoisted.logInfo).not.toHaveBeenCalled();
    const warn = summaryWarn()[0];
    expect(warn.failed).toBe(25);
    expect(warn.failedBookingIds).toHaveLength(10);
    expect(warn.truncated).toBe(true);
    expect(hoisted.logError).toHaveBeenCalledTimes(25);
  });

  it('logs nothing when there are no candidates', async () => {
    hoisted.queryExecute.mockResolvedValue([[]]);

    await handleAutoCompleteBookings();

    expect(hoisted.pipelineExecute).not.toHaveBeenCalled();
    expect(hoisted.logInfo).not.toHaveBeenCalled();
    expect(hoisted.logWarn).not.toHaveBeenCalled();
    expect(hoisted.logError).not.toHaveBeenCalled();
  });

  it('keeps the candidate query scoped to past non-tournament confirmed bookings', async () => {
    hoisted.queryExecute.mockResolvedValue([[]]);

    await handleAutoCompleteBookings();

    const sql = String(hoisted.queryExecute.mock.calls[0][0]).replace(/\s+/g, ' ');
    expect(sql).toContain("WHERE booking_status = 'confirmed'");
    expect(sql).toContain("AND booking_type != 'tournament'");
    expect(sql).toContain("AND CONCAT(booking_date, ' ', start_time) < NOW()");
  });

  it('never logs booking, customer or payment payloads', async () => {
    pipelineOutcomes({ 1: 'ok', 2: 'conflict', 3: 'ok' });

    await handleAutoCompleteBookings();

    const loggedKeys = [...summaryInfo(), ...summaryWarn(), ...hoisted.logError.mock.calls.map((c) => c[0])]
      .flatMap((ctx) => Object.keys(ctx));
    expect(loggedKeys).not.toContain('user_id');
    expect(loggedKeys).not.toContain('organisation_id');
    for (const ctx of [...summaryInfo(), ...summaryWarn()]) {
      expect(Object.keys(ctx).some((k) => /email|phone|amount|payment/i.test(k))).toBe(false);
    }
  });
});
