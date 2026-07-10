import type { ParticipantRole } from './match.types.js';

export interface ParticipantData {
  id: number;
  matchId: number;
  userId: number;
  role: ParticipantRole;
  joinedAt: Date;
}

export class Participant {
  public readonly id: number;
  public readonly matchId: number;
  public readonly userId: number;
  public readonly role: ParticipantRole;
  public readonly joinedAt: Date;

  constructor(data: ParticipantData) {
    this.id = data.id;
    this.matchId = data.matchId;
    this.userId = data.userId;
    this.role = data.role;
    this.joinedAt = data.joinedAt;
  }
}
