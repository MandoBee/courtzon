import { describe, it, expect } from 'vitest';
import { getNotificationRoute, resolveNotificationTarget } from './notificationRoutes';

describe('getNotificationRoute', () => {
  it('returns the route when action has an absolute route', () => {
    expect(getNotificationRoute({ route: '/tournaments/5' })).toBe('/tournaments/5');
  });

  it('returns null for missing / non-absolute routes', () => {
    expect(getNotificationRoute(null)).toBeNull();
    expect(getNotificationRoute(undefined)).toBeNull();
    expect(getNotificationRoute({ route: '' })).toBeNull();
    expect(getNotificationRoute({ route: 'tournaments/5' })).toBeNull();
  });
});

describe('resolveNotificationTarget', () => {
  it('resolves from notification.action (backend source of truth)', () => {
    const target = resolveNotificationTarget({
      action: { route: '/tournaments/12', tab: 'bracket' },
    });
    expect(target).toEqual({ route: '/tournaments/12', tab: 'bracket' });
  });

  it('falls back to action_payload.route when action is missing (legacy rows)', () => {
    const target = resolveNotificationTarget({
      action: null,
      action_payload: { route: '/matches/42' },
    });
    expect(target?.route).toBe('/matches/42');
  });

  it('handles malformed / empty input gracefully (no crash)', () => {
    expect(resolveNotificationTarget(null)).toBeNull();
    expect(resolveNotificationTarget(undefined)).toBeNull();
    expect(resolveNotificationTarget({})).toBeNull();
    expect(resolveNotificationTarget({ action: null, action_payload: null })).toBeNull();
    expect(resolveNotificationTarget({ action_payload: 'not-an-object' } as any)).toBeNull();
    expect(resolveNotificationTarget({ action: { route: 'no-leading-slash' } })).toBeNull();
  });

  it('prefers action over action_payload when both exist', () => {
    const target = resolveNotificationTarget({
      action: { route: '/tournaments/1' },
      action_payload: { route: '/matches/1' },
    });
    expect(target?.route).toBe('/tournaments/1');
  });

  it('preserves tab/params/replace from the action', () => {
    const target = resolveNotificationTarget({
      action: { route: '/bookings/9', tab: 'details', params: { step: 2 }, replace: true },
    });
    expect(target).toEqual({ route: '/bookings/9', tab: 'details', params: { step: 2 }, replace: true });
  });
});