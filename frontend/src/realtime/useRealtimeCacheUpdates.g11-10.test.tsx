import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRealtimeCacheUpdates, invalidateRealtimeReconcile } from './useRealtimeCacheUpdates';

/**
 * G11.10 + G11.11 — frontend Tier-B socket handlers. Renders the realtime cache
 * hook with a captured useSocketEvent map, then invokes the tournament handlers
 * and asserts the exact React Query invalidation. G11.11 adds the terminal
 * lifecycle handlers (cancelled / archived / refund-request-updated) and the
 * reconcile root assertions.
 */

type Handler = (payload: any) => void;
const captured: Record<string, Handler> = {};

vi.mock('./useSocket', () => ({
  useSocketEvent: (eventType: string, handler: Handler) => { captured[eventType] = handler; },
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
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
  renderHook(() => useRealtimeCacheUpdates(), {
    wrapper: ({ children }: any) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
  return invalidateSpy;
}

const calls = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map((c: any) => c[0]);

const hasKey = (call: any, root: string, part?: string | number) =>
  !!call?.queryKey && call.queryKey[0] === root && (part === undefined || call.queryKey[1] === part);

beforeEach(() => {
  for (const k of Object.keys(captured)) delete captured[k];
});

describe('G11.10 — tournament.registration-refunded cache invalidation', () => {
  it('refreshes tournament detail, my-tournaments, participants, org list and org P&L', () => {
    const spy = setup();
    expect(captured['tournament.registration-refunded']).toBeDefined();
    captured['tournament.registration-refunded']({ tournamentId: 5, registrationId: 12, userId: 42, organisationId: 3 });

    const all = calls(spy);
    // invalidateTournament (dual key forms: numeric + string).
    expect(all.some((c: any) => hasKey(c, 'tournament', 5) || hasKey(c, 'tournament', '5'))).toBe(true);
    expect(all.some((c: any) => hasKey(c, 'tournaments'))).toBe(true);
    expect(all.some((c: any) => hasKey(c, 'my-tournaments'))).toBe(true);
    expect(all.some((c: any) => hasKey(c, 'tournament-participants', 5))).toBe(true);
    // Org-scoped tournament list root.
    expect(all.some((c: any) => hasKey(c, 'org-3-tournaments'))).toBe(true);
    // G11.9 org Tournament P&L root (via invalidateOrgAccounting on orgId).
    expect(all.some((c: any) => hasKey(c, 'org-tournament-pnl'))).toBe(true);
  });
});

describe('G11.10 — tournament.standings-finalized cache invalidation', () => {
  it('refreshes tournament detail, standings, participants and the org list root', () => {
    const spy = setup();
    expect(captured['tournament.standings-finalized']).toBeDefined();
    captured['tournament.standings-finalized']({ tournamentId: 5, organisationId: 3, name: 'RR Cup' });

    const all = calls(spy);
    expect(all.some((c: any) => c.queryKey?.[0] === 'tournament' && c.queryKey[2] === 'standings')).toBe(true);
    expect(all.some((c: any) => c.queryKey?.[0] === 'tournament' && c.queryKey[2] === 'participants')).toBe(true);
    expect(all.some((c: any) => hasKey(c, 'org-3-tournaments'))).toBe(true);
  });
});

describe('G11.10 — tournament.prize-awarded / prize-refunded cache invalidation', () => {
  it('refreshes the tournament detail + awards workbench (no invented wallet keys)', () => {
    const spy = setup();
    expect(captured['tournament.prize-awarded']).toBeDefined();
    expect(captured['tournament.prize-refunded']).toBeDefined();

    captured['tournament.prize-awarded']({ tournamentId: 5, awardId: 1, winnerUserId: 42, organisationId: 3 });
    let all = calls(spy);
    expect(all.some((c: any) => hasKey(c, 'tournament', 5) || hasKey(c, 'tournament', '5'))).toBe(true);
    expect(all.some((c: any) => c.queryKey?.[0] === 'tournament-awards' && c.queryKey[1] === '5')).toBe(true);
    // No new wallet invalidation introduced here.
    expect(all.some((c: any) => c.queryKey?.[0] === 'wallet' && c.queryKey[1] === 'me')).toBe(false);

    spy.mockClear();
    captured['tournament.prize-refunded']({ tournamentId: 5, awardId: 2, winnerUserId: 42, organisationId: 3 });
    all = calls(spy);
    expect(all.some((c: any) => c.queryKey?.[0] === 'tournament-awards' && c.queryKey[1] === '5')).toBe(true);
  });
});

describe('G11.10 — tournament.refund-requested cache invalidation', () => {
  it('refreshes the org refund-management screen + tournament detail', () => {
    const spy = setup();
    expect(captured['tournament.refund-requested']).toBeDefined();
    captured['tournament.refund-requested']({ tournamentId: 5, registrationId: 12, requestId: 55, organisationId: 3 });

    const all = calls(spy);
    expect(all.some((c: any) => hasKey(c, 'tournament', 5) || hasKey(c, 'tournament', '5'))).toBe(true);
    expect(all.some((c: any) => c.queryKey?.[0] === 'tournament-refund-requests' && c.queryKey[1] === 3)).toBe(true);
  });
});

describe('G11.10 — tournament.registration-closed cache invalidation', () => {
  it('refreshes the registration lifecycle caches + the org list root', () => {
    const spy = setup();
    expect(captured['tournament.registration-closed']).toBeDefined();
    captured['tournament.registration-closed']({ tournamentId: 5, organisationId: 3, name: 'Cup' });

    const all = calls(spy);
    expect(all.some((c: any) => hasKey(c, 'tournament', 5) || hasKey(c, 'tournament', '5'))).toBe(true);
    expect(all.some((c: any) => hasKey(c, 'my-tournaments'))).toBe(true);
    expect(all.some((c: any) => hasKey(c, 'tournament-participants', 5))).toBe(true);
    expect(all.some((c: any) => hasKey(c, 'org-3-tournaments'))).toBe(true);
  });
});

describe('G11.10 G7 — accounting.entry-recorded refreshes G11.9 finance surfaces', () => {
  it('tournament-sourced postings refresh the ReportsPage tournament blocks + org P&L', () => {
    const spy = setup();
    expect(captured['accounting.entry-recorded']).toBeDefined();
    captured['accounting.entry-recorded']({ eventType: 'posted', sourceType: 'tournament', sourceId: 5, organisationId: 3 });

    const all = calls(spy);
    expect(all.some((c: any) => hasKey(c, 'reports', 'overview'))).toBe(true);
    expect(all.some((c: any) => hasKey(c, 'reports', 'participation'))).toBe(true);
    // org P&L root enters via ORG_ACCOUNTING_ROOTS predicate-scoped invalidation.
    expect(all.some((c: any) => c.queryKey?.[0] === 'org-tournament-pnl')).toBe(true);
  });

  it('non-tournament postings do NOT refresh the tournament finance report blocks', () => {
    const spy = setup();
    captured['accounting.entry-recorded']({ eventType: 'posted', sourceType: 'booking', sourceId: 9, organisationId: 3 });

    const all = calls(spy);
    expect(all.some((c: any) => hasKey(c, 'reports', 'overview'))).toBe(false);
    expect(all.some((c: any) => hasKey(c, 'reports', 'participation'))).toBe(false);
  });
});

describe('G11.11 — tournament.cancelled cache invalidation', () => {
  it('refreshes tournament detail, participants, my-tournaments and the org list root', () => {
    const spy = setup();
    expect(captured['tournament.cancelled']).toBeDefined();
    captured['tournament.cancelled']({ tournamentId: 5, organisationId: 3, name: 'Cup' });

    const all = calls(spy);
    expect(all.some((c: any) => hasKey(c, 'tournament', 5) || hasKey(c, 'tournament', '5'))).toBe(true);
    expect(all.some((c: any) => c.queryKey?.[0] === 'tournament-participants' && c.queryKey[1] === 5)).toBe(true);
    expect(all.some((c: any) => hasKey(c, 'my-tournaments'))).toBe(true);
    expect(all.some((c: any) => hasKey(c, 'org-3-tournaments'))).toBe(true);
  });
});

describe('G11.11 — tournament.archived cache invalidation', () => {
  it('refreshes tournament detail, registration state, my-tournaments and the org list root', () => {
    const spy = setup();
    expect(captured['tournament.archived']).toBeDefined();
    captured['tournament.archived']({ tournamentId: 5, organisationId: 3, name: 'Cup' });

    const all = calls(spy);
    expect(all.some((c: any) => hasKey(c, 'tournament', 5) || hasKey(c, 'tournament', '5'))).toBe(true);
    expect(all.some((c: any) => hasKey(c, 'my-tournaments'))).toBe(true);
    expect(all.some((c: any) => hasKey(c, 'org-3-tournaments'))).toBe(true);
  });
});

describe('G11.11 — tournament.refund-request-updated cache invalidation', () => {
  it('refreshes the org refund-management screen + tournament detail', () => {
    const spy = setup();
    expect(captured['tournament.refund-request-updated']).toBeDefined();
    captured['tournament.refund-request-updated']({ tournamentId: 5, registrationId: 12, requestId: 55, status: 'rejected', organisationId: 3 });

    const all = calls(spy);
    expect(all.some((c: any) => hasKey(c, 'tournament', 5) || hasKey(c, 'tournament', '5'))).toBe(true);
    expect(all.some((c: any) => c.queryKey?.[0] === 'tournament-refund-requests' && c.queryKey[1] === 3)).toBe(true);
  });
});

describe('G11.11 — disqualification + operator-complete reuse existing handlers', () => {
  it('participant-updated (disqualified) refreshes the affected participant state', () => {
    const spy = setup();
    expect(captured['tournament.participant-updated']).toBeDefined();
    captured['tournament.participant-updated']({ tournamentId: 5, participantId: 1, status: 'disqualified', organisationId: 3 });

    const all = calls(spy);
    expect(all.some((c: any) => c.queryKey?.[0] === 'tournament-participants' && c.queryKey[1] === 5)).toBe(true);
    expect(all.some((c: any) => c.queryKey?.[0] === 'tournament' && c.queryKey[1] === '5' && c.queryKey[2] === 'participants')).toBe(true);
  });
  // Note: tournament.completed needs NO new G11.11 frontend wiring — the
  // TOURNAMENT_REALTIME_EVENTS loop (asserted in useRealtimeCacheUpdates.test.ts
  // lines 245–249) already refreshes tournament detail + standings. The single-slot
  // captured map here is overwritten by the later player-nav-counts registration,
  // but in production BOTH subscriptions fire.
});

describe('G11.11 — reconnect/reconcile includes the refund-request root', () => {
  it('invalidateRealtimeReconcile covers tournament-refund-requests + lifecycle roots', () => {
    const keys: string[][] = [];
    const fakeQc = {
      invalidateQueries: (o: any) => { if (o.queryKey) keys.push([...o.queryKey]); },
    };
    invalidateRealtimeReconcile(fakeQc as any);

    expect(keys).toContainEqual(['tournament-refund-requests']);
    expect(keys).toContainEqual(['my-tournaments']);
    expect(keys).toContainEqual(['tournament-awards']);
    expect(keys).toContainEqual(['tournament-participants']);
  });
});