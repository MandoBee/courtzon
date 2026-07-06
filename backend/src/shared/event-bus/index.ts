import { EventEmitter } from 'events';

export interface BaseEvent {
  eventId?: string;
  timestamp?: Date;
  correlationId?: string;
}

export interface DomainEventMap {
  'booking:created': BaseEvent & { bookingId: number; userId: number; courtId: number; startTime: Date; endTime: Date; organisationId?: number; branchId?: number };
  'booking:confirmed': BaseEvent & { bookingId: number; userId: number; organisationId?: number; branchId?: number };
  'booking:cancelled': BaseEvent & { bookingId: number; userId: number; reason?: string; organisationId?: number; branchId?: number };
  'booking:expired': BaseEvent & { bookingId: number; userId: number };
  'payment:completed': BaseEvent & { paymentId: number; userId: number; amount: number; currency: string; gateway: string; organisationId?: number };
  'payment:failed': BaseEvent & { paymentId: number; userId: number; amount: number; currency?: string; error: string; organisationId?: number };
  'payment:refunded': BaseEvent & { paymentId: number; userId: number; amount: number; organisationId?: number };
  'marketplace:order-placed': BaseEvent & { orderId: number; userId: number; sellerId: number; total: number; organisationId?: number };
  'marketplace:order-status-changed': BaseEvent & { orderId: number; userId: number; status: string; organisationId?: number };
  'marketplace:new-review': BaseEvent & { reviewId: number; productId: number; reviewedUserId: number; rating: number };
  'user:registered': BaseEvent & { userId: number; email: string };
  'user:approved': BaseEvent & { userId: number; role: string };
  'system:announcement': BaseEvent & { title: string; body: string; targetRole?: string; targetUserId?: number };
}

export type DomainEventName = keyof DomainEventMap;

class EventBus {
  private emitter = new EventEmitter();
  private maxListeners = 100;

  constructor() {
    this.emitter.setMaxListeners(this.maxListeners);
  }

  emit<E extends DomainEventName>(event: E, data: DomainEventMap[E]): void {
    const payload = {
      ...data,
      eventId: data.eventId || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: data.timestamp || new Date(),
    };
    process.nextTick(() => {
      this.emitter.emit(event, payload);
      this.emitter.emit('*', { event, data: payload });
    });
  }

  on<E extends DomainEventName>(event: E, handler: (data: DomainEventMap[E]) => void): void {
    this.emitter.on(event, handler);
  }

  onAny(handler: (event: DomainEventName, data: any) => void): void {
    this.emitter.on('*', ({ event, data }: { event: DomainEventName; data: any }) => handler(event, data));
  }

  off<E extends DomainEventName>(event: E, handler: (data: DomainEventMap[E]) => void): void {
    this.emitter.off(event, handler);
  }

  once<E extends DomainEventName>(event: E, handler: (data: DomainEventMap[E]) => void): void {
    this.emitter.once(event, handler);
  }

  removeAllListeners(event?: DomainEventName): void {
    if (event) this.emitter.removeAllListeners(event);
    else this.emitter.removeAllListeners();
  }

  listenerCount(event: DomainEventName): number {
    return this.emitter.listenerCount(event);
  }
}

export const eventBus = new EventBus();
