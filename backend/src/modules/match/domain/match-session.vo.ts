import type { SessionStatus } from './match.types.js';

export interface MatchSessionParams {
  status: SessionStatus;
  startedAt: Date;
  endedAt?: Date | null;
  durationMinutes?: number | null;
  winnerId?: number | null;
  participantsConfirmed?: number[] | null;
  noShowUserIds?: number[] | null;
  scores?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export class MatchSession {
  readonly status: SessionStatus;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly durationMinutes: number | null;
  readonly winnerId: number | null;
  readonly participantsConfirmed: number[] | null;
  readonly noShowUserIds: number[] | null;
  readonly scores: Record<string, unknown> | null;
  readonly metadata: Record<string, unknown> | null;

  constructor(params: MatchSessionParams) {
    this.status = params.status;
    this.startedAt = params.startedAt;
    this.endedAt = params.endedAt ?? null;
    this.durationMinutes = params.durationMinutes ?? null;
    this.winnerId = params.winnerId ?? null;
    this.participantsConfirmed = params.participantsConfirmed ?? null;
    this.noShowUserIds = params.noShowUserIds ?? null;
    this.scores = params.scores ?? null;
    this.metadata = params.metadata ?? null;
  }
}
