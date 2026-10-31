import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSocketEvents } from './useSocket';
import { useRealtimeCacheUpdates } from './useRealtimeCacheUpdates';

/**
 * P3-04 — regression coverage for the loop-safe socket subscription hook.
 *
 * The cache-update layer used to call `useSocketEvent` inside `for` loops (25
 * `react-hooks/rules-of-hooks` findings). `useSocketEvents` performs the loop
 * inside a single effect; these tests lock down the lifecycle:
 * subscribe-once-per-event, stable on re-render, correct add/remove handling for
 * a changed event list, full cleanup on unmount, and latest-handler semantics.
 */

type Handler = (payload: any) => void;

interface Sub {
  event: string;
  handler: Handler;
  unsub: ReturnType<typeof vi.fn>;
}

let subs: Sub[] = [];

const subscribe = vi.fn((event: string, handler: Handler) => {
  const unsub = vi.fn(() => {
    subs = subs.filter((s) => s.unsub !== unsub);
  });
  subs.push({ event, handler, unsub });
  return unsub;
});

const activeEvents = () => subs.map((s) => s.event).sort();

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

const LIST = ['alpha.one', 'beta.two'] as const;

beforeEach(() => {
  subs = [];
  subscribe.mockClear();
});

describe('useSocketEvents — stable loop-free subscriptions', () => {
  it('subscribes once per event and delivers the event name with the payload', () => {
    const handler = vi.fn();
    renderHook(() => useSocketEvents(LIST, handler));

    expect(subscribe).toHaveBeenCalledTimes(LIST.length);
    expect(activeEvents()).toEqual([...LIST].sort());

    emit('beta.two', { id: 7 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('beta.two', { id: 7 });
  });

  it('does not resubscribe when the component re-renders with the same list', () => {
    const handler = vi.fn();
    const { rerender } = renderHook(() => useSocketEvents(LIST, handler));
    const callsAfterMount = subscribe.mock.calls.length;

    rerender();
    rerender();

    expect(subscribe).toHaveBeenCalledTimes(callsAfterMount);
    expect(activeEvents()).toEqual([...LIST].sort());
  });

  it('applies room-list additions and removals without leaving stale subscriptions', () => {
    const LIST_A = ['a.one', 'b.two', 'c.three'] as const;
    const LIST_B = ['b.two', 'd.four'] as const;
    let list: readonly string[] = LIST_A;

    const handler = vi.fn();
    const { rerender } = renderHook(() => useSocketEvents(list, handler));

    const previousUnsubs = subs.map((s) => s.unsub);
    expect(activeEvents()).toEqual(['a.one', 'b.two', 'c.three']);

    list = LIST_B;
    rerender();

    // Every previous subscription was torn down and only the new list is live.
    for (const unsub of previousUnsubs) expect(unsub).toHaveBeenCalled();
    expect(activeEvents()).toEqual(['b.two', 'd.four']);
    expect(subs).toHaveLength(LIST_B.length);

    // The removed event no longer reaches the handler; the added one does.
    emit('a.one', {});
    emit('d.four', { id: 4 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('d.four', { id: 4 });
  });

  it('unsubscribes every event on unmount (no listeners leak)', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useSocketEvents(LIST, handler));
    const unsubs = subs.map((s) => s.unsub);

    unmount();

    for (const unsub of unsubs) expect(unsub).toHaveBeenCalled();
    expect(subs).toHaveLength(0);
    emit('alpha.one', {});
    expect(handler).not.toHaveBeenCalled();
  });

  it('always invokes the latest handler without resubscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    let handler: Handler = first;

    const { rerender } = renderHook(() => useSocketEvents(LIST, handler));
    const callsAfterMount = subscribe.mock.calls.length;

    handler = second;
    rerender();

    expect(subscribe).toHaveBeenCalledTimes(callsAfterMount);
    emit('alpha.one', { value: 1 });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('alpha.one', { value: 1 });
  });
});

describe('useRealtimeCacheUpdates — subscription lifecycle after the P3-04 refactor', () => {
  const renderUpdates = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const view = renderHook(() => useRealtimeCacheUpdates(), {
      wrapper: ({ children }: any) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });
    return { qc, spy, ...view };
  };

  it('registers every event list once and keeps the set stable across re-renders', () => {
    const { rerender } = renderUpdates();
    const callsAfterMount = subscribe.mock.calls.length;

    expect(callsAfterMount).toBeGreaterThan(100);

    rerender();
    rerender();

    expect(subscribe).toHaveBeenCalledTimes(callsAfterMount);
    // Every subscription is still accounted for; shared events intentionally
    // carry more than one handler (cache update + nav counter), so the live
    // subscription count must equal the mount count (no leak, no duplicates).
    expect(activeEvents()).toHaveLength(callsAfterMount);
  });

  it('keeps both handlers for a shared event (cache update + nav counter)', () => {
    const { spy } = renderUpdates();

    emit('booking.created', { resourceId: 3, bookingDate: '2026-10-27' });

    const invalidated = spy.mock.calls.map((c: any) => c[0]?.queryKey?.[0]);
    expect(invalidated).toContain('my-bookings');
    expect(invalidated).toContain('player-nav-counts');
    expect(invalidated).toContain('resource-slots');
  });

  it('cleans up all subscriptions when the hook unmounts', () => {
    const { unmount } = renderUpdates();
    expect(subs.length).toBeGreaterThan(0);

    unmount();

    expect(subs).toHaveLength(0);
  });
});
