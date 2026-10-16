import { describe, it, expect } from 'vitest';
import { mapDomainEvent } from '../application/socket-event-mapper.js';

/**
 * P1-04B - referee assignment realtime routing.
 *
 * Contract:
 *   - referee:assigned  -> client event "referee.assigned"
 *   - referee:unassigned -> client event "referee.unassigned"
 *   - route to user:{userId} (when a valid userId exists) plus the admin room;
 *   - never the match / player / organisation / branch rooms;
 *   - forward only the existing payload fields: matchId, refereeId, userId, matchType;
 *   - always return a mapping (admin room alone when userId is absent) so the
 *     socket publisher never counts these events as dropped.
 */
describe('P1-04B - referee assignment routing', () => {
  it('maps referee:assigned to referee.assigned with the referee user room + admin', () => {
    const result = mapDomainEvent('referee:assigned', {
      matchId: 15, refereeId: 3, userId: 42, matchType: 'league',
    });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('referee.assigned');
    expect(result!.rooms).toContain('user:42');
    expect(result!.rooms).toContain('admin');
    expect(result!.payload).toEqual({ matchId: 15, refereeId: 3, userId: 42, matchType: 'league' });
  });

  it('maps referee:unassigned to referee.unassigned with the referee user room + admin', () => {
    const result = mapDomainEvent('referee:unassigned', {
      matchId: 15, refereeId: 3, userId: 42, matchType: 'tournament',
    });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('referee.unassigned');
    expect(result!.rooms).toContain('user:42');
    expect(result!.rooms).toContain('admin');
    expect(result!.payload).toEqual({ matchId: 15, refereeId: 3, userId: 42, matchType: 'tournament' });
  });

  it('never targets the match, player, organisation or branch rooms', () => {
    const result = mapDomainEvent('referee:assigned', {
      matchId: 15, refereeId: 3, userId: 42, matchType: 'league',
    })!;
    expect(result.rooms).not.toContain('player');
    expect(result.rooms.some((r) => r.startsWith('match:'))).toBe(false);
    expect(result.rooms.some((r) => r.startsWith('organisation:'))).toBe(false);
    expect(result.rooms.some((r) => r.startsWith('branch:'))).toBe(false);
  });

  it('still maps (never drops) when userId is absent - admin room only', () => {
    const result = mapDomainEvent('referee:assigned', { matchId: 15, refereeId: 3, matchType: 'league' });
    expect(result).not.toBeNull();
    expect(result!.type).toBe('referee.assigned');
    expect(result!.rooms).toEqual(['admin']);
    expect(result!.rooms.some((r) => r.startsWith('user:'))).toBe(false);
  });

  it('ignores an invalid userId instead of creating a bogus room', () => {
    const result = mapDomainEvent('referee:unassigned', { matchId: 15, refereeId: 3, userId: 0 })!;
    expect(result.rooms).toEqual(['admin']);
    expect(result.rooms).not.toContain('user:0');
  });
});
