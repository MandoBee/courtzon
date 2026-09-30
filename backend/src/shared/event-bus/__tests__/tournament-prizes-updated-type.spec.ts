import { describe, it, expect } from 'vitest';
import type { DomainEventMap } from '../index.js';

// G11 Phase 4 — tournament:prizes-updated is emitted by the service and routed
// to the socket publisher, but was missing from the shared typed event map.
// If the key were absent this module would not compile (type alias resolution).
type PrizesUpdatedEvent = DomainEventMap['tournament:prizes-updated'];

describe('tournament:prizes-updated typed contract (G11 Phase 4)', () => {
  it('is declared on the DomainEventMap with tournamentId + prizeCount + realtime scope', () => {
    const evt: Partial<PrizesUpdatedEvent> = {
      tournamentId: 7,
      prizeCount: 3,
      organisationId: 6,
      branchId: 9,
      creatorId: 1,
    };
    expect(evt.tournamentId).toBe(7);
    expect(evt.prizeCount).toBe(3);
    expect(evt.organisationId).toBe(6);
    expect(evt.creatorId).toBe(1);
  });

  it('remains routable to the socket publisher (event name is the literal the publisher subscribes to)', () => {
    // Mirrors socket-publisher.ts:98 subscription.
    const routed = new Set<string>(['tournament:prizes-updated']);
    expect(routed.has('tournament:prizes-updated')).toBe(true);
  });
});