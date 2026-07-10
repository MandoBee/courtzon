import type { Match } from '../domain/match.entity.js';
import type { MatchProjection } from '../infrastructure/repositories/match-read.repository.js';

export class MatchSerializer {
  static toProjection(match: Match): Record<string, unknown> {
    return {
      id: match.id,
      type: match.type,
      status: match.status,
      sportId: match.sportId,
      participantCount: match.participantCount,
      version: match.version,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
    };
  }
}
