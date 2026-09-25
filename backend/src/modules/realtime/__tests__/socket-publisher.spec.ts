import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: { on: vi.fn(), emit: vi.fn() },
}));

import {
  MATCH_AND_RESULT_SOCKET_EVENTS,
  SocketPublisher,
} from '../application/socket-publisher.js';

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
