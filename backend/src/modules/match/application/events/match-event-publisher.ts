import { eventBusV2 } from '../../../../shared/event-bus/index.js';
import type { MatchDomainEvent } from './match.events.js';

export class MatchEventPublisher {
  publish(event: MatchDomainEvent): void {
    eventBusV2.emit(event.type as any, event.payload as any);
  }
}

export const matchEventPublisher = new MatchEventPublisher();
