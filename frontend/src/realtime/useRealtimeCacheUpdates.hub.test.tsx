import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useRealtimeCacheUpdates,
  invalidateRealtimeReconcile,
  isTournamentHubQueryRoot,
  tournamentHubPredicate,
} from './useRealtimeCacheUpdates';

/**
 * Step 3H — Tournament Hub realtime parity tests.
 * Renders the realtime hook with a captured useSocketEvent map, invokes the
 * tournament/match handlers and asserts the exact React Query invalidations for
 * the Hub canonical keys (`tournament-matches` / `-groups` / `-stages`, incl.
 * the org-<orgId>-tournament-* variants) — invalidation only, no client logic.
 */

type Handler = (payload: any) => void;
const captured: Record<string, Handler[]> = {};

const fire = (eventName: string, payload: any) => {
  (captured[eventName] ?? []).forEach((h) => h(payload));
};

vi.mock('./useSocket', () => ({
  useSocketEvent: (eventType: string, handler: Handler) => {
    if (!captured[eventType]) captured[eventType] = [];
    captured[eventType].push(handler);
  },
}));

vi.mock('./socket-client', () => ({
  getSocketState: () => 'connected',
  onSocketStateChange: () => () => {},
  disconnectSocket: vi.fn(),
  createSocket: vi.fn(),
}));

vi.mock('../store/auth.store', () => {
  const getState = () => ({ refreshOrganisations: vi.fn() });
  const useAuthStore: any = () => ({ forceLogout: undefined });
  useAuthStore.getState = getState;
  return { useAuthStore };
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, 'invalidateQueries');
  renderHook(() => useRealtimeCacheUpdates(), {
    wrapper: ({ children }: any) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
  return { qc, spy };
}

type Predicate = (query: { queryKey: readonly unknown[] }) => boolean;

function predicateCalls(spy: any): Predicate[] {
  return spy.mock.calls
    .filter((c: any[]) => c[0] && typeof c[0].predicate === 'function')
    .map((c: any[]) => c[0].predicate as Predicate);
}

function matchesAny(spy: any, key: readonly unknown[]): boolean {
  const exact = spy.mock.calls.some((c: any[]) =>
    c[0]?.queryKey != null && JSON.stringify(c[0].queryKey) === JSON.stringify(key));
  const pred = predicateCalls(spy).some((fn) => fn({ queryKey: key }));
  return exact || pred;
}

beforeEach(() => {
  Object.keys(captured).forEach((k) => delete captured[k]);
});

describe('Tournament Hub realtime parity (Step 3H)', () => {
  it('exports Hub-root predicate matching admin + org keys, scoped by tournament id', () => {
    expect(isTournamentHubQueryRoot('tournament-matches', 'tournament-matches')).toBe(true);
    expect(isTournamentHubQueryRoot('org-6-tournament-matches', 'tournament-matches')).toBe(true);
    expect(isTournamentHubQueryRoot('org-6-tournament-groups', 'tournament-groups')).toBe(true);
    expect(isTournamentHubQueryRoot('org-6-tournament-stages', 'tournament-stages')).toBe(true);

    const p = tournamentHubPredicate('tournament-matches', 5);
    expect(p({ queryKey: ['tournament-matches', 5] })).toBe(true);
    expect(p({ queryKey: ['org-6-tournament-matches', 5] })).toBe(true);
    expect(p({ queryKey: ['org-6-tournament-matches', 7] })).toBe(false);
    expect(p({ queryKey: ['tournament-bracket-types'] })).toBe(false);
  });

  it('group-stage-generated handler invalidates Hub groups/stages/matches for that tournament only', () => {
    const { spy } = setup();
    fire('tournament.group-stage-generated', { tournamentId: 5, organisationId: 6 });
    expect(matchesAny(spy, ['tournament-matches', 5])).toBe(true);
    expect(matchesAny(spy, ['org-9-tournament-groups', 5])).toBe(true);
    expect(matchesAny(spy, ['org-9-tournament-stages', 5])).toBe(true);
    expect(matchesAny(spy, ['tournament', 5, 'matches'])).toBe(true);
    expect(matchesAny(spy, ['tournament-matches', 7])).toBe(false);
  });

  it('knockout-generated handler invalidates Hub stages/matches/bracket', () => {
    const { spy } = setup();
    fire('tournament.knockout-generated', { tournamentId: 5 });
    expect(matchesAny(spy, ['org-9-tournament-stages', 5])).toBe(true);
    expect(matchesAny(spy, ['tournament-matches', 5])).toBe(true);
    expect(matchesAny(spy, ['tournament', 5, 'bracket'])).toBe(true);
  });

  it('match status_changed invalidates the Hub match query', () => {
    const { spy } = setup();
    fire('match.status_changed', { tournamentId: 5, matchId: 9, toStatus: 'in_progress' });
    expect(matchesAny(spy, ['tournament-matches', 5])).toBe(true);
    expect(matchesAny(spy, ['match', 9])).toBe(true);
  });

  it('result approved refreshes matches + standings', () => {
    const { spy } = setup();
    fire('match.result-approved', { tournamentId: 5, matchId: 9 });
    expect(matchesAny(spy, ['tournament-matches', 5])).toBe(true);
    expect(matchesAny(spy, ['tournament', 5, 'standings'])).toBe(true);
  });

  it('match-progressed refreshes bracket', () => {
    const { spy } = setup();
    fire('tournament.match-progressed', { tournamentId: 5 });
    expect(matchesAny(spy, ['tournament', 5, 'bracket'])).toBe(true);
    expect(matchesAny(spy, ['tournament-matches', 5])).toBe(true);
  });

  it('unrelated tournament events do not invalidate the current Hub', () => {
    const { spy } = setup();
    fire('tournament.match-progressed', { tournamentId: 7 });
    fire('tournament.group-stage-generated', { tournamentId: 7 });
    expect(matchesAny(spy, ['tournament-matches', 5])).toBe(false);
    expect(matchesAny(spy, ['tournament', 5, 'bracket'])).toBe(false);
    expect(matchesAny(spy, ['tournament-matches', 7])).toBe(true);
  });

  it('completed refreshes tournament detail + matches + bracket + standings', () => {
    const { spy } = setup();
    fire('tournament.completed', { tournamentId: 5, winnerId: 11 });
    expect(matchesAny(spy, ['tournament', 5])).toBe(true);
    expect(matchesAny(spy, ['tournament-matches', 5])).toBe(true);
    expect(matchesAny(spy, ['tournament', 5, 'bracket'])).toBe(true);
    expect(matchesAny(spy, ['tournament', 5, 'standings'])).toBe(true);
  });

  it('reconnect reconcile includes the Hub roots (admin + org variants)', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    invalidateRealtimeReconcile({ invalidateQueries: qc.invalidateQueries.bind(qc) } as any);
    expect(matchesAny(spy, ['tournament-matches', 1])).toBe(true);
    expect(matchesAny(spy, ['org-6-tournament-matches', 1])).toBe(true);
    expect(matchesAny(spy, ['org-6-tournament-groups', 1])).toBe(true);
    expect(matchesAny(spy, ['org-6-tournament-stages', 1])).toBe(true);
  });
});