export interface MatchEventPayload {
  matchId: number;
  timestamp: string;
}

export interface MatchCreatedPayload extends MatchEventPayload {
  matchId: number;
  type: string;
  sportId: number;
  creatorId: number;
  timestamp: string;
}

export interface MatchStatusChangedPayload extends MatchEventPayload {
  matchId: number;
  fromStatus: string;
  toStatus: string;
  timestamp: string;
}

export interface MatchCancelledPayload extends MatchEventPayload {
  matchId: number;
  reason?: string;
  timestamp: string;
}

export interface MatchCompletedPayload extends MatchEventPayload {
  matchId: number;
  timestamp: string;
}

export interface InvitationSentPayload extends MatchEventPayload {
  matchId: number;
  userId: number;
  timestamp: string;
}

export interface InvitationDeclinedPayload extends MatchEventPayload {
  matchId: number;
  userId: number;
  timestamp: string;
}

export interface InvitationExpiredPayload extends MatchEventPayload {
  matchId: number;
  userId: number;
  timestamp: string;
}

export interface JoinRequestSubmittedPayload extends MatchEventPayload {
  matchId: number;
  userId: number;
  creatorId?: number;
  timestamp: string;
}

export interface JoinRequestApprovedPayload extends MatchEventPayload {
  matchId: number;
  userId: number;
  timestamp: string;
}

export interface JoinRequestRejectedPayload extends MatchEventPayload {
  matchId: number;
  userId: number;
  reason?: string;
  timestamp: string;
}

export interface JoinRequestWithdrawnPayload extends MatchEventPayload {
  matchId: number;
  userId: number;
  timestamp: string;
}

export interface JoinRequestAutoRejectedPayload extends MatchEventPayload {
  matchId: number;
  userId: number;
  timestamp: string;
}

export interface ParticipantAddedPayload extends MatchEventPayload {
  matchId: number;
  userId: number;
  role: string;
  timestamp: string;
}

export interface ParticipantRemovedPayload extends MatchEventPayload {
  matchId: number;
  userId: number;
  timestamp: string;
}

export interface WaitingListPromotedPayload extends MatchEventPayload {
  matchId: number;
  userId: number;
  position: number;
  timestamp: string;
}

export interface WaitingListEntryAddedPayload extends MatchEventPayload {
  matchId: number;
  userId: number;
  position: number;
  timestamp: string;
}

export interface WaitingListEntryRemovedPayload extends MatchEventPayload {
  matchId: number;
  userId: number;
  timestamp: string;
}

export interface SessionStartedPayload extends MatchEventPayload {
  matchId: number;
  startedAt: string;
  timestamp: string;
}

export interface SessionCompletedPayload extends MatchEventPayload {
  matchId: number;
  durationMinutes: number;
  winnerId?: number;
  timestamp: string;
}

export type MatchDomainEvent =
  | { type: 'match:created'; payload: MatchCreatedPayload }
  | { type: 'match:status_changed'; payload: MatchStatusChangedPayload }
  | { type: 'match:cancelled'; payload: MatchCancelledPayload }
  | { type: 'match:completed'; payload: MatchCompletedPayload }
  | { type: 'invitation:sent'; payload: InvitationSentPayload }
  | { type: 'invitation:declined'; payload: InvitationDeclinedPayload }
  | { type: 'invitation:expired'; payload: InvitationExpiredPayload }
  | { type: 'join_request:submitted'; payload: JoinRequestSubmittedPayload }
  | { type: 'join_request:approved'; payload: JoinRequestApprovedPayload }
  | { type: 'join_request:rejected'; payload: JoinRequestRejectedPayload }
  | { type: 'join_request:withdrawn'; payload: JoinRequestWithdrawnPayload }
  | { type: 'join_request:auto_rejected'; payload: JoinRequestAutoRejectedPayload }
  | { type: 'participant:added'; payload: ParticipantAddedPayload }
  | { type: 'participant:removed'; payload: ParticipantRemovedPayload }
  | { type: 'waiting_list:promoted'; payload: WaitingListPromotedPayload }
  | { type: 'waiting_list:entry_added'; payload: WaitingListEntryAddedPayload }
  | { type: 'waiting_list:entry_removed'; payload: WaitingListEntryRemovedPayload }
  | { type: 'session:started'; payload: SessionStartedPayload }
  | { type: 'session:completed'; payload: SessionCompletedPayload };
