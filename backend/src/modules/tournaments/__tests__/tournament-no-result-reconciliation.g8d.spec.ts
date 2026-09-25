import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * G8-D-MINIMAL — listener-level regression for the approved reconciliation fix:
 * `match:result-no-result` reaches the tournament progression listener and routes
 * through the EXACT correction reconciliation path (`recalculateStandingsForResult`).
 *
 * The service/domain no-result reconciliation behavior (mirror, standings recompute,
 * no winner, no completion, no progression) is covered in
 * tournament-standings.g8a.spec.ts (which owns the service harness).
 */

const subscribed = vi.hoisted(() => [] as Array<{ eventName: string; handler: (envelope: any) => Promise<void> }>);
const recalc = vi.hoisted(() => vi.fn(async () => undefined));
const progress = vi.hoisted(() => vi.fn(async () => ({ advancedTo: null })));
const mirror = vi.hoisted(() => vi.fn(async () => ({ tournamentId: null, updated: false })));

vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: {
    subscribe: (reg: any) => { subscribed.push({ eventName: reg.eventName, handler: reg.handler }); },
    emit: vi.fn(),
  },
}));
vi.mock('../application/tournament.service.js', () => ({
  tournamentService: {
    recalculateStandingsForResult: recalc,
    syncSharedResultMirror: mirror,
    progressFromApprovedResult: progress,
  },
}));
vi.mock('../../../shared/event-bus/subscriber.worker.js', () => ({
  createSubscriberWorker: (opts: any) => ({ opts }),
}));

let registerTournamentProgressionSubscribers: () => void;
let createTournamentProgressionWorkers: () => Array<{ opts: { concurrency: number } }>;

beforeAll(async () => {
  const mod = await import('../application/tournament-progression.listener.js');
  registerTournamentProgressionSubscribers = mod.registerTournamentProgressionSubscribers;
  createTournamentProgressionWorkers = mod.createTournamentProgressionWorkers;
});

beforeEach(() => {
  subscribed.length = 0;
  vi.clearAllMocks();
});

describe('G8-D-MINIMAL listener — match:result-no-result routing', () => {
  function envelopeFor(eventName: string, resultId = 99) {
    return {
      eventId: 'evt-1',
      eventName,
      payload: { matchId: 77, resultId, allUserIds: [1, 2] },
    };
  }

  it('subscribes to match:result-no-result alongside the approved/corrected family', () => {
    registerTournamentProgressionSubscribers();
    const names = subscribed.map((s) => s.eventName);
    expect(names).toContain('match:result-no-result');
    expect(names).toContain('match:result-approved');
    expect(names).toContain('match:result-auto-approved');
    expect(names).toContain('match:result-resolved');
    expect(names).toContain('match:result-corrected');
  });

  it('routes match:result-no-result through the SAME recalculateStandingsForResult path as corrections', async () => {
    registerTournamentProgressionSubscribers();
    const sub = subscribed.find((s) => s.eventName === 'match:result-no-result')!;
    await sub.handler(envelopeFor('match:result-no-result'));

    expect(recalc).toHaveBeenCalledExactlyOnceWith(99);
    // No progression, no separate mirror call — the single correction path is reused.
    expect(progress).not.toHaveBeenCalled();
    expect(mirror).not.toHaveBeenCalled();
  });

  it('duplicate/retried deliveries remain safe — the same reconciliation is invoked idempotently', async () => {
    registerTournamentProgressionSubscribers();
    const sub = subscribed.find((s) => s.eventName === 'match:result-no-result')!;
    await sub.handler(envelopeFor('match:result-no-result', 99));
    await sub.handler(envelopeFor('match:result-no-result', 99)); // retry

    expect(recalc).toHaveBeenCalledTimes(2);
    expect(recalc).toHaveBeenNthCalledWith(1, 99);
    expect(recalc).toHaveBeenNthCalledWith(2, 99);
    expect(progress).not.toHaveBeenCalled();
  });

  it('a no-result event does NOT trigger progressFromApprovedResult (no progression side effects)', async () => {
    registerTournamentProgressionSubscribers();
    const sub = subscribed.find((s) => s.eventName === 'match:result-no-result')!;
    await sub.handler(envelopeFor('match:result-no-result'));
    expect(progress).not.toHaveBeenCalled();
  });

  it('creates the durable BullMQ worker for the progression queue', () => {
    const workers = createTournamentProgressionWorkers();
    expect(workers).toHaveLength(1);
    expect((workers[0] as any).opts.concurrency).toBe(1);
  });
});