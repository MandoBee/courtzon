import type { MatchDomainEvent } from './match.events.js';

export class MatchEventPublisher {
  publish(event: MatchDomainEvent): void {
    void event;
  }
}
