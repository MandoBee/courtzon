import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRealtimeCacheUpdates } from './useRealtimeCacheUpdates';

/**
 * Hook-level coverage for the coalesced match invalidations.
 *
 * The pure coalescer is tested in `matchInvalidationCoalescer.test.ts`; this
 * file pins the wiring that unit test cannot see: a socket event arriving
 * through `useRealtimeCacheUpdates` is queued (not applied immediately) and an
 * unmount flushes the queue instead of dropping the last event.
 */

type Handler = (payload: any) => void;

interface Sub {
  event: string;
  handler: Handler;
}

let subs: Sub[] = [];

const subscribe = vi.fn((event: string, handler: Handler) => {
  subs.push({ event, handler });
  return () => {
    subs = subs.filter((sub) => sub.handler !== handler);
  };
});

const emit = (event: string, payload?: any) => {
  for (const sub of [...subs]) {
    if (sub.event === event) sub.handler(payload);
  }
};

vi.mock('./SocketContext', () => ({
  useSocketContext: () => ({ socket: null, isConnected: true, state: 'connected', subscribe }),
}));

vi.mock('./socket-client', () => ({
  getSocketState: () => 'connected',
  onSocketStateChange: () => () => {},
  disconnectSocket: vi.fn(),
  createSocket: vi.fn(),
}));

vi.mock('../store/auth.store', () => {
  const getState = () => ({ refreshOrganisations: vi.fn(), forceLogout: vi.fn() });
  const useAuthStore: any = () => ({ forceLogout: undefined });
  useAuthStore.getState = getState;
  return { useAuthStore };
});

function renderUpdates() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(qc, 'invalidateQueries');
  const view = renderHook(() => useRealtimeCacheUpdates(), {
    wrapper: ({ children }: any) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
  const keys = (): string[] =>
    spy.mock.calls.map((call: any) => JSON.stringify(call[0]?.queryKey));
  return { qc, spy, keys, ...view };
}

describe('useRealtimeCacheUpdates — coalesced match invalidations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subs = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('queues a match event instead of invalidating immediately', () => {
    const { keys } = renderUpdates();

    emit('match.available', { matchId: 1234 });

    expect(keys()).not.toContain(JSON.stringify(['public-matches']));
    expect(keys()).not.toContain(JSON.stringify(['match', 1234]));
  });

  it('flushes a queued invalidation on unmount instead of dropping it', () => {
    const { keys, unmount } = renderUpdates();

    emit('match.updated', { matchId: 4321 });
    expect(keys()).not.toContain(JSON.stringify(['public-matches']));

    unmount();

    const flushed = keys();
    expect(flushed).toContain(JSON.stringify(['public-matches']));
    expect(flushed).toContain(JSON.stringify(['match', 4321]));
    expect(flushed.filter((key) => key === JSON.stringify(['public-matches']))).toHaveLength(1);
  });

  it('flushes the trailing window once the burst goes quiet', () => {
    const { keys } = renderUpdates();

    emit('match.available', { matchId: 11 });
    emit('match.available', { matchId: 12 });
    emit('match.available', { matchId: 13 });

    vi.advanceTimersByTime(750);

    const flushed = keys();
    expect(flushed.filter((key) => key === JSON.stringify(['public-matches']))).toHaveLength(1);
    for (const id of [11, 12, 13]) {
      expect(flushed).toContain(JSON.stringify(['match', id]));
    }
  });
});
