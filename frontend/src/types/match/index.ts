export type MatchType = 'public';

export type MatchStatus = 'open' | 'full' | 'closed' | 'in_progress' | 'completed' | 'cancelled' | 'void';

export type Visibility = 'public' | 'invite_only';

export type InvitationStatus = 'sent' | 'read' | 'declined' | 'expired';

export type JoinRequestStatus = 'submitted' | 'withdrawn' | 'approved' | 'rejected' | 'auto_rejected';

export type ParticipantRole = 'host' | 'joiner';

export type SessionStatus = 'in_progress' | 'completed' | 'voided';

export interface MatchCriteria {
  minAge: number | null;
  maxAge: number | null;
  targetGender: 'male' | 'female' | 'any';
  targetLevelId: number | null;
}

export interface MatchPlayer {
  userId: number;
  fullName: string;
  avatarUrl: string | null;
  role: ParticipantRole;
}

export interface MatchListItem {
  id: number;
  type: MatchType;
  status: MatchStatus;
  bookingDate: string;
  startTime: string;
  endTime: string;
  sportId: number;
  sportName: string;
  resourceName: string;
  branchName: string;
  organisationName: string;
  venueName: string;
  participantCount: number;
  maxPlayers: number;
  autoAccept: boolean;
  criteria: MatchCriteria;
  deadline: string | null;
  distanceKm: number | null;
  invitationId: number | null;
  invitationStatus: InvitationStatus | null;
  joinRequestId: number | null;
  joinRequestStatus: JoinRequestStatus | null;
  isParticipant: boolean;
  participants: MatchPlayer[];
}

export interface MatchDetail extends MatchListItem {
  visibility: Visibility;
  creatorId: number;
  creatorName: string;
  session: MatchSessionData | null;
}

export interface MatchSessionData {
  id: number;
  status: SessionStatus;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  winnerId: number | null;
  participantsConfirmed: number[] | null;
  noShowUserIds: number[] | null;
}

export interface JoinRequestItem {
  id: number;
  userId: number;
  fullName: string;
  avatarUrl: string | null;
  status: JoinRequestStatus;
  submittedAt: string;
  rejectionReason: string | null;
}

export interface ApplicantData {
  joinRequests: JoinRequestItem[];
  participants: MatchPlayer[];
}
