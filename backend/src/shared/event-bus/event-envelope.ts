import { randomBytes } from 'node:crypto';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateUlid(): string {
  const now = Date.now();
  const timeChars = new Array(10);
  let remaining = now;
  for (let i = 9; i >= 0; i--) {
    timeChars[i] = ENCODING[remaining % 32];
    remaining = Math.floor(remaining / 32);
  }

  const rand = randomBytes(16);
  const randChars = new Array(16);
  for (let i = 0; i < 16; i++) {
    randChars[i] = ENCODING[rand[i] % 32];
  }

  return timeChars.join('') + randChars.join('');
}

export interface EventEnvelope {
  eventId: string;
  eventName: string;
  schemaVersion: number;
  occurredAt: string;
  publishedAt: string;
  correlationId: string;
  causationId: string;
  actorId: number | null;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  payload: Record<string, unknown>;
  metadata: {
    tenantId?: number;
    ipAddress?: string;
    userAgent?: string;
    source?: string;
  };
}

export interface EnvelopeContext {
  correlationId?: string;
  causationId?: string;
  actorId?: number;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  metadata?: {
    tenantId?: number;
    ipAddress?: string;
    userAgent?: string;
    source?: string;
  };
  schemaVersion?: number;
}

export function createEnvelope(
  eventName: string,
  payload: Record<string, unknown>,
  context: EnvelopeContext,
): EventEnvelope {
  const now = new Date();
  return {
    eventId: generateUlid(),
    eventName,
    schemaVersion: context.schemaVersion ?? 1,
    occurredAt: now.toISOString(),
    publishedAt: now.toISOString(),
    correlationId: context.correlationId || generateUlid(),
    causationId: context.causationId || '',
    actorId: context.actorId ?? null,
    aggregateType: context.aggregateType,
    aggregateId: context.aggregateId,
    aggregateVersion: context.aggregateVersion,
    payload,
    metadata: {
      tenantId: context.metadata?.tenantId,
      ipAddress: context.metadata?.ipAddress,
      userAgent: context.metadata?.userAgent,
      source: context.metadata?.source,
    },
  };
}
