import type { ParticipantRole, ParticipantSide } from './match.types.js';

export interface ParticipantData {
  id: number;
  matchId: number;
  userId: number;
  role: ParticipantRole;
  side: ParticipantSide | null;
  teamIndex: number | null;
  joinedAt: Date;
}

export class Participant {
  public readonly id: number;
  public readonly matchId: number;
  public readonly userId: number;
  public readonly role: ParticipantRole;
  public readonly side: ParticipantSide | null;
  public readonly teamIndex: number | null;
  public readonly joinedAt: Date;

  constructor(data: ParticipantData) {
    this.id = data.id;
    this.matchId = data.matchId;
    this.userId = data.userId;
    this.role = data.role;
    this.side = data.side ?? null;
    this.teamIndex = data.teamIndex ?? null;
    this.joinedAt = data.joinedAt;
  }
}