import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: { on: vi.fn(), emit: vi.fn() },
}));

import {
  MATCH_AND_RESULT_SOCKET_EVENTS,
  SocketPublisher,
} from '../application/socket-publisher.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';

describe('SocketPublisher Group 5 subscriptions and delivery', () => {
  it('subscribes to every modern match lifecycle and result event', () => {
    const subscribed = new Set<string>(MATCH_AND_RESULT_SOCKET_EVENTS);

    for (const eventName of [
      'match:created',
      'match:status_changed',
      'match:cancelled',
      'match:completed',
      'participant:added',
      'participant:removed',
      'session:started',
      'session:completed',
      'match:result-submitted',
      'match:result-approved',
      'match:result-auto-approved',
      'match:result-disputed',
      'match:result-resolved',
      'match:result-corrected',
    ]) {
      expect(subscribed).toContain(eventName);
    }
  });

  it('has no duplicate centralized subscriptions', () => {
    expect(new Set(MATCH_AND_RESULT_SOCKET_EVENTS).size).toBe(MATCH_AND_RESULT_SOCKET_EVENTS.length);
  });

  it('subscribes to the G11.10 tournament Tier-B events (refund/standings/prize/refund-request/registration-closed)', () => {
    (eventBusV2.on as any).mockClear();

    const publisher = new SocketPublisher();
    publisher.setIO({ to: vi.fn(() => ({ emit: vi.fn() })) } as never);
    publisher.start();

    const subscribed = new Set<string>((eventBusV2.on as any).mock.calls.map((c: any) => c[0]));
    for (const eventName of [
      'tournament:registration-refunded',
      'tournament:standings-finalized',
      'tournament:prize-awarded',
      'tournament:prize-refunded',
      'tournament:refund-requested',
      'tournament:registration-closed',
    ]) {
      expect(subscribed).toContain(eventName);
    }
  });

  it('emits once to the union of all authorized rooms', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const publisher = new SocketPublisher();
    publisher.setIO({ to } as never);

    (publisher as unknown as {
      publish: (eventName: string, payload: Record<string, unknown>) => void;
    }).publish('match:status_changed', {
      matchId: 15,
      participantUserIds: [7, 9],
      organisationId: 3,
      branchId: 5,
    });

    expect(to).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith(expect.arrayContaining([
      'admin', 'match:15', 'user:7', 'user:9', 'organisation:3', 'branch:5',
    ]));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('match.status_changed', expect.objectContaining({ matchId: 15 }));
  });
});
