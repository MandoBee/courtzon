import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * G11.12 — tournament start reminder scheduler (pure unit).
 * Covers the deterministic jobId, 24h delay, UTC anchoring, past-trigger guard,
 * remove helper, and the EN/AR template residency used by the direct worker.
 */

const queue = vi.hoisted(() => ({
  add: vi.fn(async () => 'bull-id'),
  removeJob: vi.fn(async () => undefined),
}));

vi.mock('../../../infrastructure/queue/queue.service.js', () => ({
  queueService: { add: queue.add, removeJob: queue.removeJob, addBulk: vi.fn() },
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => ({ execute: vi.fn(async () => [[]]), query: vi.fn(async () => [[]]) }) }));

// scheduler.service statically imports the dispatcher (which would pull redis/env).
vi.mock('../application/dispatcher.service.js', () => ({
  dispatchToUser: vi.fn(async () => undefined),
  dispatchByRole: vi.fn(async () => undefined),
  dispatchByOrg: vi.fn(async () => undefined),
  dispatchByBranch: vi.fn(async () => undefined),
  dispatchByUserIdsBulk: vi.fn(async () => undefined),
  dispatchToAll: vi.fn(async () => undefined),
  dispatchByPermission: vi.fn(async () => undefined),
}));

import {
  tournamentReminderJobId,
  tournamentStartUtc,
  scheduleTournamentStartReminder,
  removeTournamentStartReminder,
  TOURNAMENT_START_REMINDER_LEAD_MS,
} from '../application/scheduler.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-29T10:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('G11.12 — tournamentStartUtc (deterministic UTC anchor)', () => {
  it('uses daily_start_time when present (R1)', () => {
    const d = tournamentStartUtc('2026-12-01', '18:30:00');
    expect(d!.toISOString()).toBe('2026-12-01T18:30:00.000Z');
  });

  it('falls back to 00:00:00Z when daily_start_time is absent (R1)', () => {
    const d = tournamentStartUtc('2026-12-01');
    expect(d!.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('accepts a full Date/ISO input and still anchors on the date part', () => {
    const d = tournamentStartUtc(new Date('2026-12-01T14:00:00.000Z'));
    expect(d!.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('returns null for unusable inputs (no invented fallback time)', () => {
    expect(tournamentStartUtc(null)).toBeNull();
    expect(tournamentStartUtc(undefined)).toBeNull();
    expect(tournamentStartUtc('not-a-date')).toBeNull();
  });
});

describe('G11.12 — scheduleTournamentStartReminder', () => {
  const startUtc = new Date('2026-12-01T00:00:00.000Z'); // reminder at 2026-11-30T00:00Z

  it('creates the correct BullMQ job with deterministic jobId and 24h delay', async () => {
    await scheduleTournamentStartReminder(7, startUtc, 42, 'Cup');

    expect(queue.add).toHaveBeenCalledTimes(1);
    const [type, data, opts] = queue.add.mock.calls[0];
    expect(type).toBe('send_scheduled_notification');
    expect(opts.jobId).toBe('tournament-reminder-7-42');
    expect(opts.delay).toBe(14 * 60 * 60 * 1000); // 2026-11-30T00:00Z - 2026-11-29T10:00Z = 14h
    expect(opts.attempts).toBe(3);
    expect(data.userId).toBe(42);
    expect(data.payload).toMatchObject({
      eventName: 'tournament:starting-soon',
      tournamentId: 7,
      name: 'Cup',
      startDate: '2026-12-01T00:00:00.000Z',
    });
  });

  it('tournamentReminderJobId is deterministic', () => {
    expect(tournamentReminderJobId(7, 42)).toBe('tournament-reminder-7-42');
    expect(tournamentReminderJobId(7, 43)).toBe('tournament-reminder-7-43');
  });

  it('uses exactly a 24-hour lead time constant', () => {
    expect(TOURNAMENT_START_REMINDER_LEAD_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('does NOT schedule when the reminder time is already in the past (delay <= 0)', async () => {
    // Tournament starts in 12 hours → reminder (24h lead) is already past.
    const nearStart = new Date('2026-11-29T22:00:00.000Z');
    await scheduleTournamentStartReminder(7, nearStart, 42, 'Cup');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does NOT schedule for an invalid startUtc', async () => {
    await scheduleTournamentStartReminder(7, new Date('invalid'), 42, 'Cup');
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe('G11.12 — removeTournamentStartReminder', () => {
  it('removes by the same deterministic jobId (safe path — missing job does not throw)', async () => {
    await removeTournamentStartReminder(7, 42);
    expect(queue.removeJob).toHaveBeenCalledWith('send_scheduled_notification', 'tournament-reminder-7-42');
  });
});

describe('G11.12 — existing starting-soon templates (EN + AR) are usable by the worker', () => {
  it('EN + AR tournament:starting-soon default template rows exist in template.service.ts', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/modules/notifications/application/template.service.ts'),
      'utf-8',
    );
    const enBlock = source.match(/eventName: 'tournament:starting-soon', locale: 'en'[\s\S]{0,200}/);
    const arBlock = source.match(/eventName: 'tournament:starting-soon', locale: 'ar'[\s\S]{0,200}/);
    expect(enBlock?.[0] ?? '').toContain('Tournament Starting Soon');
    expect(arBlock?.[0] ?? '').toContain('البطولة على وشك البدء');
  });
});