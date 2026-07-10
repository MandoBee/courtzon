export interface MatchProjection {
  id: number;
  type: string;
  status: string;
  sportId: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  venueName: string;
  branchName: string;
  organisationName: string;
  participantCount: number;
  maxPlayers: number;
  autoAccept: boolean;
  deadline: string | null;
  distanceKm: number | null;
  invitationId: number | null;
  invitationStatus: string | null;
  joinRequestStatus: string | null;
  isParticipant: boolean;
}

export interface MatchFilters {
  lat?: number;
  lng?: number;
  date?: string;
  sportId?: number;
}

export interface MatchReadRepository {
  findAvailable(userId: number, filters?: MatchFilters): Promise<MatchProjection[]>;
  findById(matchId: number, userId: number): Promise<MatchProjection | null>;
}
