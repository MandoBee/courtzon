import { describe, it, expect, vi, afterEach } from 'vitest';
import { updateAppBadge } from './appBadge';

function withNavigator(setAppBadge?: (...args: any[]) => Promise<void>, clearAppBadge?: () => Promise<void>) {
  const original = (globalThis as any).navigator;
  const mockNav: any = { ...original };
  if (setAppBadge) mockNav.setAppBadge = setAppBadge;
  if (clearAppBadge) mockNav.clearAppBadge = clearAppBadge;
  (globalThis as any).navigator = mockNav;
  return () => {
    (globalThis as any).navigator = original;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('updateAppBadge', () => {
  it('O. calls setAppBadge when unread count > 0', () => {
    const setAppBadge = vi.fn(async () => undefined);
    const restore = withNavigator(setAppBadge);
    updateAppBadge(3);
    expect(setAppBadge).toHaveBeenCalledWith(3);
    restore();
  });

  it('P. calls clearAppBadge when unread count is 0', () => {
    const clearAppBadge = vi.fn(async () => undefined);
    const restore = withNavigator(undefined, clearAppBadge);
    updateAppBadge(0);
    expect(clearAppBadge).toHaveBeenCalledTimes(1);
    restore();
  });

  it('Q. unsupported browser (no Badging API) — no error, no-op', () => {
    const restore = withNavigator(undefined, undefined);
    expect(() => updateAppBadge(5)).not.toThrow();
    expect(() => updateAppBadge(0)).not.toThrow();
    restore();
  });

  it('Q. a throwing Badging API is swallowed (never breaks notifications)', () => {
    const restore = withNavigator(
      vi.fn(async () => { throw new Error('NotAllowedError'); }),
      undefined,
    );
    expect(() => updateAppBadge(2)).not.toThrow();
    restore();
  });
});