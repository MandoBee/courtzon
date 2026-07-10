import type { Match } from '../../domain/match.entity.js';

export interface MatchRepository {
  findById(id: number): Promise<Match | null>;
  save(match: Match): Promise<void>;
}
