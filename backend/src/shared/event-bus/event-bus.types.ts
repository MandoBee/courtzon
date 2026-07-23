import type { EventEnvelope } from './event-envelope.js';

export type DeliveryGuarantee = 'at-least-once' | 'at-most-once';

export type StartingCursor = 'latest' | number;

export interface SubscriberRegistration {
  subscriberId: string;
  eventName: string;
  queueName: string;
  handler: (envelope: EventEnvelope, conn?: any) => Promise<void>;
  options?: {
    deliveryGuarantee?: DeliveryGuarantee;
    attempts?: number;
    backoffDelay?: number;
    concurrency?: number;
    startingCursor?: StartingCursor;
  };
}

export interface SubscriberWorkerConfig {
  subscriberId: string;
  queueName: string;
  handler: (envelope: EventEnvelope) => Promise<void>;
  concurrency: number;
  attempts: number;
  backoffDelay: number;
}

export type SubscriberResult = 'processed' | 'skipped' | 'failed';
